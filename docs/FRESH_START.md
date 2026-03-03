# MAF Machine v2 — Fresh Start Guide

## Current State (as of Feb 20, 2026)

### What Exists (v1 on `main`)

**Worker** (`worker/src/index.ts` — 414 lines, single file):
- OAuth flow (Strava auth, callback, session, logout)
- Activity fetching + caching in KV
- Stream fetching + caching in KV
- Settings CRUD (age, modifier, units, MAF HR calculation)
- Static asset serving + SPA fallback
- No webhook handler (webhook sub ID 331008 exists on Strava side but handler may only be on `pro`)

**Frontend** (`app/src/`):
- `components/`: Dashboard, Login, SettingsModal, SummaryCards, DateRangePicker, RunAdvisor, SettingsPanel, TrendChart
- `lib/mafAnalysis.ts`: Client-side MAF analysis (zone %, drift, decoupling, cadence, EF, qualifying)
- Vite + React + Tailwind + Recharts
- Vite proxy already configured: `/api` → `http://localhost:8787`

**Infrastructure**:
- Cloudflare Pages project: `marliin`
- Production worker: `maf-machine` on `maf.marliin.com`
- KV namespaces: `MAF_TOKENS`, `MAF_ACTIVITIES`, `MAF_SETTINGS`
- `MAF_GAME` KV namespace exists (ID: `da4c031c54784e1d878b087294a76421`) but not bound to production worker
- Strava webhook subscription: ID 331008, callback `https://maf.marliin.com/api/webhook`
- Secrets on production: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`
- No `ANTHROPIC_API_KEY` secret yet

**Env interface** (v1):
```typescript
export interface Env {
  MAF_TOKENS: KVNamespace;
  MAF_ACTIVITIES: KVNamespace;
  MAF_SETTINGS: KVNamespace;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
}
```

**Settings shape** (stored in KV as `{athleteId}:settings`):
```typescript
{
  age: number;
  modifier: number;        // -10, -5, 0, or 5
  units: 'km' | 'mi';
  maf_hr: number;          // 180 - age + modifier
  maf_zone_low: number;    // maf_hr - 5
  maf_zone_high: number;   // maf_hr + 5
  qualifying_tolerance: number;  // default 10
  start_date: string | null;
}
```

**Git branches**:
| Branch | State | Deploys to |
|---|---|---|
| `main` | v1 clean (414-line index.ts) | `maf.marliin.com` (production) |
| `pro` | v1 + logout fix | `maf.marliin.com` (Cloudflare Pages alias) |
| `v2` | Abandoned recovery attempt — stash conflicts, mismatched interfaces | Nowhere |

### What Needs to Happen

1. Create a clean `v2` branch off `main`
2. Set up dev environment (separate worker, auth bypass)
3. Build v2 modules one at a time, each compiling before the next
4. Never touch production until Strava approval completes

---

## Part 1: Dev Environment Setup

### Step 1: Clean Up Git

```bash
# Delete the broken v2 branch
git checkout main
git branch -D v2

# Create fresh v2 from clean main
git checkout -b v2
git push -u origin v2
```

### Step 2: Create Dev Worker Config

Create `worker/wrangler.dev.toml`:

```toml
name = "maf-machine-dev"
main = "src/index.ts"
compatibility_date = "2024-12-01"

routes = [
  { pattern = "maf-dev.marliin.com/*", zone_name = "marliin.com" }
]

[assets]
directory = "../app/dist"
binding = "ASSETS"

# All KV namespaces point to PRODUCTION data (no preview_id needed)
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

[vars]
DEV_MODE = "true"
DEV_ATHLETE_ID = "9127290"
```

### Step 3: Create DNS Record

In Cloudflare Dashboard → `marliin.com` → DNS:

| Type | Name | Content | Proxy |
|---|---|---|---|
| AAAA | maf-dev | 100:: | Proxied ☁️ |

### Step 4: Set Secrets on Dev Worker

```bash
cd worker
npx wrangler secret put STRAVA_CLIENT_ID --config wrangler.dev.toml
npx wrangler secret put STRAVA_CLIENT_SECRET --config wrangler.dev.toml
npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.dev.toml
```

### Step 5: Add DEV_MODE Auth Bypass

In `worker/src/index.ts`, update `resolveSession`:

```typescript
async function resolveSession(request: Request, env: Env): Promise<string | null> {
  // Dev mode: bypass auth
  if ((env as any).DEV_MODE === 'true') {
    return (env as any).DEV_ATHLETE_ID || null;
  }

  const sessionId = getAthleteIdFromCookie(request);
  if (!sessionId) return null;
  return await env.MAF_TOKENS.get(`session:${sessionId}`);
}
```

### Step 6: Verify Local Dev Works

```bash
# Terminal 1: Worker
cd worker
npx wrangler dev --remote --config wrangler.dev.toml

# Terminal 2: Frontend
cd app
npm run dev
```

Open `http://localhost:5173`. Dashboard should load with your real data (auth bypassed). If it works, commit:

```bash
git add -A
git commit -m "Dev environment: wrangler.dev.toml, DEV_MODE auth bypass"
```

---

## Part 2: Build Plan

### Ground Rules

- **Every step must compile** before moving to the next (`npx tsc --noEmit`)
- **Test locally** with `wrangler dev` + `npm run dev` at each step
- **Commit after each step** — never lose work again
- **Do NOT deploy to production** — local + dev URL only
- **The v1 `index.ts` is the foundation** — we extend it, not rewrite it

### Module Architecture

```
worker/src/
  index.ts              ← Main handler (extends v1 with new routes + webhook)
  lib/
    mafAnalysis.ts      ← Analysis engine (v2 enhanced metrics)
    gameTypes.ts        ← Type definitions, constants, level tables
    xpEngine.ts         ← Per-run XP calculation
    questEngine.ts      ← Quest progression logic
    streakEngine.ts     ← Streak tracking + weekly goals
    gameState.ts        ← Orchestrator: ties XP/quest/streak together, KV read/write
    coachingPayload.ts  ← Builds context payload for Claude API
    coachingEngine.ts   ← Claude API calls, response parsing, caching
```

### Phase 1: Analysis Engine (Step 7)

**File**: `worker/src/lib/mafAnalysis.ts`

Move analysis from frontend (`app/src/lib/mafAnalysis.ts`) to worker, then enhance with v2 metrics:

**Existing v1 metrics** (already computed client-side):
- `time_in_maf_zone_pct` — % of run in MAF zone
- `cardiac_drift` — HR creep first half vs second half
- `aerobic_decoupling` — pace:HR ratio drift
- `cadence_in_zone` — average cadence while in MAF zone
- `efficiency_factor` — meters/min per bpm
- `qualifying` — boolean (≥20 min, ≥60% in zone)

**New v2 metrics to add**:
- `zone_minutes` — absolute minutes in MAF zone (not percentage)
- `longest_zone_streak_minutes` — longest continuous run of in-zone seconds
- `zone_entries` — number of times HR re-entered zone after leaving
- `warmup_score` (0–100) — % of first 600s where HR ≤ (maf_hr - 10)
- `negative_split` — boolean, second half ≥2% faster
- `pace_steadiness_score` (0–100) — 100 - (CV of velocity × 500)

**Key**: The `MAFActivity` interface must be the single source of truth. Every downstream module imports from here. Get this right first.

**Export**: `analyzeActivity(activity, streams, settings) → MAFActivity`

### Phase 2: Game Types (Step 8)

**File**: `worker/src/lib/gameTypes.ts`

Pure type definitions and constants. No logic, no imports from other lib files.

- XP breakdown interface
- Level table (1–10 with XP thresholds)
- Streak multiplier tiers
- Quest definitions (7 quests)
- Milestone definitions (~25 milestones)
- `GameState` master interface
- Helper functions: `getLevelFromXP()`, `getXPToNextLevel()`, `getStreakMultiplier()`, `createInitialGameState()`

### Phase 3: XP Engine (Step 9)

**File**: `worker/src/lib/xpEngine.ts`

Imports: `MAFActivity` from mafAnalysis, `XPBreakdown` from gameTypes.

Pure function: `calculateRunXP(activity: MAFActivity) → { base_xp, breakdown, qualifying }`

No KV access. No side effects. Easy to unit test.

### Phase 4: Quest Engine (Step 10)

**File**: `worker/src/lib/questEngine.ts`

Imports: `MAFActivity`, `GameState`, `QuestId`, quest definitions.

Pure function: `checkQuestProgress(activity, gameState) → { quest_completed, quest_progress_update }`

### Phase 5: Streak Engine (Step 11)

**File**: `worker/src/lib/streakEngine.ts`

Imports: `MAFActivity`, `GameState`, weekly types.

Functions:
- `updateWeeklyProgress(activity, gameState) → updated weekly state`
- `evaluateWeekEnd(gameState) → streak updates + weekly bonus XP`

### Phase 6: Game State Orchestrator (Step 12)

**File**: `worker/src/lib/gameState.ts`

The glue. Imports from all engines above.

Functions:
- `loadGameState(kv, athleteId) → GameState`
- `processNewRun(kv, athleteId, activity) → { xp_earned, breakdown, milestones, quest_completed }`
- `undoRun(kv, athleteId, activity) → void` (for activity delete)
- `buildGameAPIResponse(gameState) → API response shape`
- `backfillGameState(kv, athleteId, activities[]) → GameState`

### Phase 7: Wire Game Into Index (Step 13)

Update `worker/src/index.ts`:
- Extend `Env` with `MAF_GAME: KVNamespace` and `ANTHROPIC_API_KEY: string`
- Add `POST /api/webhook` handler (verify + process activities)
- Add `GET /api/game` endpoint
- Add `POST /api/backfill` endpoint
- Wire `processNewRun` into webhook handler

**Test**: Trigger webhook locally with curl, check game state response.

### Phase 8: Coaching Payload (Step 14)

**File**: `worker/src/lib/coachingPayload.ts`

Imports: `MAFActivity`, `GameState`, `UserSettings`.

Builds the structured JSON context sent to Claude API. Must match the `MAFActivity` interface exactly (this is where the last attempt broke).

### Phase 9: Coaching Engine (Step 15)

**File**: `worker/src/lib/coachingEngine.ts`

- Claude API caller (non-streaming for post-run, streaming for chat)
- System prompts
- Response parsing (JSON extraction with markdown fence stripping)
- KV caching helpers
- Chat state management

### Phase 10: Wire Coaching Into Index (Step 16)

- `GET /api/coaching/latest`
- `GET /api/coaching/:activityId`
- `GET /api/coaching/weekly`
- `POST /api/coaching/weekly` (manual trigger)
- `POST /api/coaching/chat`
- Coaching generation in webhook handler (fires after game state update)

**Test**: Debug endpoint to generate coaching for any existing activity.

### Phase 11: Frontend — Coach-First UI (Steps 17–22)

- CoachCard component (hero position)
- Level/XP bar
- Streak display
- Weekly progress bar
- Chat UI (collapsible)
- Run detail modal with XP breakdown
- Integrate above dashboard (coach card on top, existing data below)

### Phase 12: Backfill + Onboarding (Step 23)

- Training start date picker in settings
- Backfill engine: process historical cached activities
- Progress indicator during backfill
- Quest chain activation

### Phase 13: Polish (Step 24)

- Error states, loading states
- Graceful degradation if Claude API is down
- Rate limiting on chat
- Streak freeze logic
- Missing HR data handling

### Phase 14: Payments (Step 25)

- Stripe integration
- Feature gating (free v1 dashboard, paid v2 coach + gamification)
- Trial period
- Subscription management UI

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

Open `http://localhost:5173`.

### Deploy to Dev URL

```bash
cd app && npx vite build
cd ../worker && npx wrangler deploy --config wrangler.dev.toml
```

Visit `https://maf-dev.marliin.com`.

### Test Webhook Locally

```bash
curl -X POST http://localhost:8787/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"aspect_type":"create","object_type":"activity","object_id":ACTIVITY_ID,"owner_id":9127290}'
```

### Check Results

```bash
curl http://localhost:8787/api/game
curl http://localhost:8787/api/coaching/latest
```

---

## Decisions & Constraints

1. **DO NOT deploy to `maf.marliin.com`** until Strava approves v1
2. **Local testing only** (`wrangler dev` + `npm run dev`) unless explicitly deploying to dev URL
3. **Every module compiles independently** — no forward references to unbuilt modules
4. **`MAFActivity` interface is the contract** — defined once in `mafAnalysis.ts`, used everywhere
5. **Webhook handler is the orchestration point** — analysis → game state → coaching, all server-side
6. **Coaching fires for every qualifying run** — not gated behind game progression
