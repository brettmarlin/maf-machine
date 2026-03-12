# MAF Machine — Development Environment Guide

## The Problem

The current setup has one Worker (`maf-machine`) serving both frontend assets and API on `maf.marliin.com`. Any deploy — worker or frontend — overwrites production. This is dangerous while Strava is reviewing the v1 submission.

Additionally, local development requires multiple hacks (auth bypass, commented-out preview KV IDs, waitUntil workarounds) that are easy to accidentally deploy.

## The Solution: Two Workers, Two Subdomains

```
PRODUCTION (don't touch)
  maf.marliin.com  →  maf-machine worker (v1, Strava submission)
  Branch: main
  Status: locked until Strava approves

DEVELOPMENT (work here)
  maf-dev.marliin.com  →  maf-machine-dev worker (v2 Pro)
  Branch: v2
  Status: deploy freely
```

Both workers read from the **same production KV namespaces** — your real Strava data, tokens, and settings. The dev worker additionally binds MAF_GAME for v2 gamification data.

This means:
- You never touch `maf.marliin.com` until Strava approval is done
- You can deploy v2 to `maf-dev.marliin.com` anytime with zero risk
- Local dev (`localhost:8787`) works identically to the dev deployment
- No more hack-and-pray workflow

---

## One-Time Setup

### Step 1: Create DNS Record

In Cloudflare Dashboard → `marliin.com` → DNS:

| Type | Name | Content | Proxy |
|---|---|---|---|
| AAAA | maf-dev | 100:: | Proxied ☁️ |

This creates `maf-dev.marliin.com` pointing to Cloudflare (the worker route will catch it).

### Step 2: Create Dev Worker Config

Create `worker/wrangler.dev.toml`:

```toml
name = "maf-machine-dev"
main = "src/index.ts"
compatibility_date = "2024-12-01"

# Route on dev subdomain
routes = [
  { pattern = "maf-dev.marliin.com/*", zone_name = "marliin.com" }
]

# Static assets from Vite build
[assets]
directory = "../app/dist"
binding = "ASSETS"

# All KV namespaces point to PRODUCTION data (no preview_id nonsense)
[[kv_namespaces]]
binding = "MAF_TOKENS"
id = "7fb555c0c26842ec8c43966c7bd4998a"

[[kv_namespaces]]
binding = "MAF_ACTIVITIES"
id = "fba9b72e54e74bd492c3c75902c5749b"

[[kv_namespaces]]
binding = "MAF_SETTINGS"
id = "08b7ce8af969418595856f61fb42c6c6"

[[kv_namespaces]]
binding = "MAF_GAME"
id = "da4c031c54784e1d878b087294a76421"

# Dev-only variables
[vars]
DEV_MODE = "true"
DEV_ATHLETE_ID = "9127290"
```

### Step 3: Set Secrets on Dev Worker

```bash
cd worker

# Copy secrets from production to dev worker
npx wrangler secret put STRAVA_CLIENT_ID --config wrangler.dev.toml
npx wrangler secret put STRAVA_CLIENT_SECRET --config wrangler.dev.toml
npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.dev.toml
```

Enter the same values as production. You only do this once.

### Step 4: Add Dev Auth Bypass to Worker Code

Replace the current hacky bypass with a clean, permanent one. In `worker/src/index.ts`, update `resolveSession`:

```typescript
async function resolveSession(request: Request, env: Env): Promise<string | null> {
  // Dev mode: bypass auth for local and dev deployments
  if ((env as any).DEV_MODE === 'true') {
    return (env as any).DEV_ATHLETE_ID || null;
  }

  const sessionId = getAthleteIdFromCookie(request);
  if (!sessionId) return null;
  return await env.MAF_TOKENS.get(`session:${sessionId}`);
}
```

Update `getValidToken` similarly — in dev mode, still read the token from KV but skip expiry checks:

```typescript
async function getValidToken(athleteId: string, env: Env): Promise<string | null> {
  const raw = await env.MAF_TOKENS.get(athleteId);
  if (!raw) return null;

  const tokens: StoredTokens = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  // Dev mode: return token even if expired (will still work for cached data)
  if ((env as any).DEV_MODE === 'true') {
    if (tokens.expires_at > now + 60) {
      return tokens.access_token;
    }
    // Try refresh, but return stale token as fallback
    try {
      return await refreshToken(athleteId, tokens, env);
    } catch {
      return tokens.access_token;
    }
  }

  if (tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  return await refreshToken(athleteId, tokens, env);
}
```

### Step 5: Fix waitUntil for Dev

In the webhook handler, replace the fragile `(globalThis as any).waitUntil` pattern:

```typescript
if (event.aspect_type === 'create' || event.aspect_type === 'update') {
  const processingPromise = processWebhookActivity(
    athleteId,
    event.object_id,
    env
  );

  // In production, use waitUntil for non-blocking.
  // In dev/local, await directly so logs are visible.
  if ((env as any).DEV_MODE === 'true') {
    await processingPromise;
  } else {
    try {
      (globalThis as any).waitUntil?.(processingPromise);
    } catch {
      processingPromise.catch((err: Error) =>
        console.error('Webhook processing error:', err)
      );
    }
  }
}
```

Apply the same pattern to the delete handler.

### Step 6: Configure Vite Proxy

In `app/vite.config.ts`, set up the proxy so the frontend dev server talks to the local worker:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
```

### Step 7: Restore Production wrangler.toml

Make sure `worker/wrangler.toml` is clean (no commented-out preview_ids, no dev hacks):

```toml
name = "maf-machine"
main = "src/index.ts"
compatibility_date = "2024-12-01"
workers_dev = false

routes = [
  { pattern = "maf.marliin.com/*", zone_name = "marliin.com" }
]

[assets]
directory = "../app/dist"
binding = "ASSETS"

[[kv_namespaces]]
binding = "MAF_TOKENS"
id = "7fb555c0c26842ec8c43966c7bd4998a"
preview_id = "eadad87860a24db297e36d810cccfa94"

[[kv_namespaces]]
binding = "MAF_ACTIVITIES"
id = "fba9b72e54e74bd492c3c75902c5749b"
preview_id = "6b88824b06b548899d517d70739faa23"

[[kv_namespaces]]
binding = "MAF_SETTINGS"
id = "08b7ce8af969418595856f61fb42c6c6"
preview_id = "d0d1c96a7b834c0490728d705f57c533"

[[kv_namespaces]]
binding = "MAF_GAME"
id = "da4c031c54784e1d878b087294a76421"
preview_id = "ad1c22de0f0e40df909bc311bd2c1b19"
```

Note: `DEV_MODE` is NOT set in production config, so the auth bypass never fires there.

---

## Daily Workflow

### Local Development

```bash
# Terminal 1: Worker (API)
cd worker
npx wrangler dev --remote --config wrangler.dev.toml

# Terminal 2: Frontend (UI)
cd app
npm run dev
```

Open `http://localhost:5173`. Frontend proxies API calls to local worker. Auth is bypassed. KV reads from production data. No cookies needed.

### Deploy to Dev

When you want to see v2 running on a real URL:

```bash
# Build frontend
cd app
npx vite build

# Deploy dev worker (includes frontend assets)
cd ../worker
npx wrangler deploy --config wrangler.dev.toml
```

Visit `https://maf-dev.marliin.com` — your v2 app is live. Production is untouched.

### Deploy to Production (ONLY after Strava approval)

```bash
git checkout main
git merge v2  # or cherry-pick specific commits

# Build frontend
cd app
npm run build

# Deploy production worker
cd ../worker
npx wrangler deploy  # uses default wrangler.toml
```

---

## Testing Webhooks Locally

Trigger a webhook for any existing activity:

```bash
curl -X POST http://localhost:8787/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"aspect_type":"create","object_type":"activity","object_id":ACTIVITY_ID,"owner_id":9127290}'
```

In dev mode, `await` runs synchronously — you'll see all logs in the wrangler terminal and the curl won't return until processing is complete.

### Check coaching results:

```bash
curl http://localhost:8787/api/coaching/latest
curl http://localhost:8787/api/coaching/ACTIVITY_ID
curl http://localhost:8787/api/game
```

### Trigger weekly summary:

```bash
curl -X POST http://localhost:8787/api/coaching/weekly
```

---

## Git Branching

| Branch | Purpose | Deploys to | Deploy command |
|---|---|---|---|
| `main` | v1 stable (Strava submission) | `maf.marliin.com` | `npx wrangler deploy` |
| `v2` | v2 Pro development | `maf-dev.marliin.com` | `npx wrangler deploy --config wrangler.dev.toml` |

The `pro` branch is retired. All v2 work happens on `v2`.

---

## Architecture Diagram

```
                    ┌─────────────────────────────────┐
                    │        Cloudflare DNS            │
                    └──────────┬──────────┬────────────┘
                               │          │
                    ┌──────────▼──┐  ┌────▼─────────────┐
                    │ maf.marliin │  │ maf-dev.marliin   │
                    │   .com      │  │   .com            │
                    └──────┬──────┘  └──────┬────────────┘
                           │                │
                    ┌──────▼──────┐  ┌──────▼────────────┐
                    │ maf-machine │  │ maf-machine-dev   │
                    │  (worker)   │  │  (worker)         │
                    │  v1 stable  │  │  v2 dev           │
                    │  NO DEV_MODE│  │  DEV_MODE=true    │
                    └──────┬──────┘  └──────┬────────────┘
                           │                │
                           └──────┬─────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   Shared Production KV    │
                    │  MAF_TOKENS               │
                    │  MAF_ACTIVITIES           │
                    │  MAF_SETTINGS             │
                    │  MAF_GAME                 │
                    └───────────────────────────┘
```

---

## Cleanup Checklist (Do This First)

Before starting with this new setup, clean up the hacks from today's session:

- [ ] Remove the hardcoded `return '9127290'` from `resolveSession` in `worker/src/index.ts`
- [ ] Remove the `console.log('DEV DEBUG URL:')` line
- [ ] Remove the dev bypass from `getValidToken`
- [ ] Uncomment the `preview_id` lines in `worker/wrangler.toml`
- [ ] Replace all dev hacks with the clean `DEV_MODE` pattern described above
- [ ] Verify `main` branch deploys cleanly to `maf.marliin.com` (it should already be there from today's rollback)
- [ ] Delete any v2 data accidentally written to MAF_GAME KV during today's testing (optional — it won't affect v1)

---

## What Can't Be Tested Locally

The following flows require testing on `maf-dev.marliin.com` — DEV_MODE auth bypass makes them untestable on localhost:

- Disconnect Strava / reconnect flow
- Session expiry handling
- OAuth callback routing
- Cookie behavior

For these, deploy to dev first, then test on the live URL.

---

## Quick Reference

| Task | Command |
|---|---|
| Start local dev (worker) | `cd worker && npx wrangler dev --remote --config wrangler.dev.toml` |
| Start local dev (frontend) | `cd app && npm run dev` |
| Deploy to dev URL | `cd app && npx vite build && cd ../worker && npx wrangler deploy --config wrangler.dev.toml` |
| Test webhook locally | `curl -X POST http://localhost:8787/api/webhook -H "Content-Type: application/json" -d '{"aspect_type":"create","object_type":"activity","object_id":ID,"owner_id":9127290}'` |
| Check coaching | `curl http://localhost:8787/api/coaching/latest` |
| Check game state | `curl http://localhost:8787/api/game` |
| Deploy to production | **Only from main branch:** `cd app && npm run build && cd ../worker && npx wrangler deploy` |
