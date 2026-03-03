# MAF Machine — Infrastructure & Deployment

## Architecture

```
maf.marliin.com (frontend)  →  Cloudflare Pages (marliin project, pro branch)
maf.marliin.com/api/*       →  Cloudflare Worker (maf-machine-worker)
```

## Cloudflare Pages — Frontend

| Setting | Value |
|---|---|
| **Project** | `marliin` |
| **Branch** | `pro` (preview deployment) |
| **Production branch** | `main` (serves marliin.com) |
| **MAF subdomain** | `maf.marliin.com` → branch alias for `pro` |
| **Build command** | Auto via git push (Vite build) |
| **App directory** | `app/` |

### DNS

| Type | Name | Content | Proxy |
|---|---|---|---|
| AAAA | maf | 100:: | Proxied ☁️ |
| CNAME | marliin.com | marliin.pages.dev | Proxied ☁️ |

### Deploy Frontend

```bash
# Option A: Git push (auto-builds via Cloudflare)
cd app
git add -A && git commit -m "message" && git push origin pro

# Option B: Manual CLI deploy
cd app
npm run build
npx wrangler pages deploy dist --project-name=marliin --branch=pro
```

## Cloudflare Worker — API

| Setting | Value |
|---|---|
| **Worker name** | `maf-machine-worker` |
| **Directory** | `worker/` |
| **Route** | `maf.marliin.com/api/*` |
| **KV Namespaces** | `MAF_ACTIVITIES`, `MAF_GAME` |
| **Secrets** | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `ANTHROPIC_API_KEY` |

### Deploy Worker

```bash
cd worker
npx wrangler deploy
```

No build script in package.json — wrangler handles bundling via esbuild.

### Strava Webhook

| Setting | Value |
|---|---|
| **Webhook ID** | 331008 |
| **Callback URL** | `https://maf.marliin.com/api/webhook` |
| **Events** | Activity create/update/delete |

## KV Namespaces

### MAF_ACTIVITIES

Stores Strava data and analysis results.

| Key Pattern | Contents |
|---|---|
| `{athleteId}:settings` | User MAF settings (age, modifier, units) |
| `{athleteId}:tokens` | Strava OAuth tokens |
| `{athleteId}:activities` | Cached activity list |
| `{athleteId}:stream:{activityId}` | Raw Strava streams (HR, pace, cadence) |
| `{athleteId}:analysis:{activityId}` | Per-run MAF analysis results |

### MAF_GAME

Stores gamification and coaching data.

| Key Pattern | Contents |
|---|---|
| `{athleteId}:game` | Game state (XP, level, streak, quests, milestones, badges, weekly history) |
| `{athleteId}:coaching:{activityId}` | LLM coaching assessment for a run |
| `{athleteId}:coaching:weekly:{week}` | Weekly coaching summary |
| `{athleteId}:chat` | Conversational coach message history |
| `{athleteId}:maf_tests` | MAF Test history and splits |

## Local Development

### Frontend (Vite)

```bash
cd app
npm run dev
```

⚠️ Strava OAuth won't work locally — callback URL points to `maf.marliin.com`. For UI work that doesn't require auth, you can mock the authenticated state or use cached data from a previous session.

### Worker

```bash
cd worker
npx wrangler dev
```

Runs worker locally with access to remote KV (unless using `--local` flag).

## Git Branching

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | v1 stable / marliin.com | marliin.com (production) |
| `pro` | v2 MAF Machine | maf.marliin.com (preview alias) |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Recharts |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers |
| Storage | Cloudflare KV |
| LLM | Claude API (claude-sonnet-4-5-20250929) |
| Data Source | Strava API (OAuth 2.0) |
| Payments | Stripe (planned — Phase 8) |
