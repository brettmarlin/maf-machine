# Onboarding — Claude Code Implementation Plan

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages. The onboarding flow replaces the current "cold start" experience where an authenticated user lands directly on the dashboard.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after every step**: `npx tsc --noEmit`
**Commit after each numbered step.**

## Design Spec Reference

Full onboarding spec is in the project file `ONBOARDING_SPEC.md`. Key principles:
- Zero friction to value — the app teaches itself through the Next Step Engine
- The onboarding IS the game — Committed badge fires during setup, backfill reveals earned progress
- No-brainer positioning — "The easiest way to do MAF training right"
- One job per screen, one question, one action

---

## Step 1: Routing Logic — Detect Onboarding State

**File**: `app/src/components/Dashboard.tsx` (or create `app/src/App.tsx` router if one doesn't exist)

### Current state
- Authenticated users go straight to Dashboard
- Unauthenticated users see a login/connect screen

### New routing
- [ ] Add state detection logic that checks onboarding progress:

```typescript
type AppState =
  | 'landing'           // Not authenticated
  | 'setup'             // Authenticated, no settings saved (age is null/undefined)
  | 'start_date'        // Settings saved, no training_start_date set
  | 'backfill'          // Start date set in the past, backfill not yet run
  | 'dashboard'         // Fully onboarded

function getAppState(authenticated: boolean, settings: Settings | null, gameState: GameState | null): AppState {
  if (!authenticated) return 'landing'
  if (!settings?.age) return 'setup'
  if (!settings?.training_start_date) return 'start_date'
  if (settings.training_start_date && gameState && !gameState.backfill_complete) return 'backfill'
  return 'dashboard'
}
```

- [ ] Add `backfill_complete: boolean` field to GameState (default: `false` for new users, `true` for existing users who skip backfill)
- [ ] Render the appropriate screen based on state
- [ ] Each screen advances to the next state on completion — no back navigation during onboarding

### Compile check, then commit.

---

## Step 2: Landing Page (Pre-Auth)

**File**: New `app/src/components/LandingPage.tsx`

### Layout
- [ ] Full-screen, dark background, vertically centered content
- [ ] No header, no nav, no footer — clean slate

### Content
```
🔥  (large, animated — subtle pulse/glow CSS animation)

The easiest way to do MAF training right.

Connect your Strava. Follow the prompts.
Watch your aerobic engine build itself.

[ Connect with Strava ]     (Strava orange button, their brand color #FC4C02)

Already connected? Log in →  (small text link below)
```

### Details
- [ ] Fire emoji: large (48-64px), CSS animation `@keyframes pulse` with subtle scale + glow
- [ ] Headline: largest text on screen, white, bold
- [ ] Subtext: muted gray, smaller
- [ ] "Connect with Strava" button triggers the existing OAuth flow (`/api/auth`)
- [ ] "Already connected? Log in" also triggers OAuth (same endpoint — Strava handles the difference)
- [ ] No other content. No feature list. No screenshots. Curiosity drives the click.
- [ ] Mobile: same layout, naturally responsive since it's centered single-column

### Compile check, then commit.

---

## Step 3: Setup Screen (Age + Modifier + Units)

**File**: New `app/src/components/OnboardingSetup.tsx`

### Layout
- [ ] Clean card, centered on dark background
- [ ] Same visual style as landing page — no dashboard chrome

### Content structure
```
Welcome, {firstName}. 👋

Let's set up your MAF ceiling. This takes 10 seconds.

AGE
[ number input, auto-focused ]

MODIFIER
[ dropdown with 5 options ]
  ℹ️ Brief explainer text

UNITS
◉ Miles  ○ Kilometers

───────────────────

Your MAF ceiling: {computed} bpm
Everything at or below this heart rate builds your aerobic engine.
Just run. Keep it under {computed}. That's the whole method.

[ Start Building 🔥 ]
```

### Details
- [ ] Pull `firstName` from settings (populated during OAuth in Fix 6). Fallback to "there" if not available.
- [ ] Age input: `type="number"`, min 16, max 99, auto-focus on mount
- [ ] Modifier dropdown options:
  - `-10` — "Recovering from major illness or surgery"
  - `-5` — "Recovering from illness, or on medication"
  - `0` — "Standard (healthy, training consistently)" ← default
  - `+5` — "2+ years consistent training, injury-free"
- [ ] Units: radio toggle, default to whatever is in settings or "mi"
- [ ] **Live MAF ceiling calculation**: updates in real-time as age/modifier change
  - `maf_hr = 180 - age + modifier`
  - Display prominently below the form: "Your MAF ceiling: 131 bpm"
  - Green text, large number
- [ ] The one-line method summary: "Just run. Keep it under 131. That's the whole method." — this IS the tutorial
- [ ] CTA button: "Start Building 🔥"
  - On click: `PUT /api/settings` with age, modifier, units, name
  - On success: advance to Screen 4 (badge celebration)
  - Disable button during save, show loading state

### On save, worker side:
- [ ] Settings save should trigger the Committed badge if not already earned
- [ ] This may already happen if `checkSetupBadge()` is wired into the settings PUT handler (from Game Mechanics implementation)
- [ ] If not wired yet: add a call to award the 'committed' badge when settings are saved for the first time

### Compile check, then commit.

---

## Step 4: Badge Celebration Overlay (Committed Badge)

**File**: Uses existing `BadgeCelebration.tsx` from Round 4 Fix 6

### Flow
- [ ] After settings save succeeds, immediately show the BadgeCelebration overlay for the ✅ Committed badge
- [ ] The celebration shows:
  - ✅ icon (large, centered)
  - "Committed"
  - "You committed. That's the biggest step."
  - Confetti burst
  - Level progress bar: Level 1 · Spark, 17% (50/300 points)
  - "→ Go-Getter" below the bar
- [ ] "Continue" button appears after 1-2 second delay
- [ ] On continue: advance to Screen 5 (training start date)

### Implementation
- [ ] OnboardingSetup component manages state: `showCelebration: boolean`
- [ ] After PUT /api/settings returns success, fetch game state to get updated badge data
- [ ] Set `showCelebration = true` to render the BadgeCelebration overlay
- [ ] BadgeCelebration's `onDismiss` callback advances to the next onboarding screen

### Level progress in celebration
- [ ] The celebration overlay needs to show level info — may need to extend BadgeCelebration props:
  - `level?: number`
  - `levelName?: string`
  - `levelProgress?: number` (0-100 percentage)
  - `nextLevelName?: string`
- [ ] Or create a small `LevelProgressMini` component used inside the celebration

### Compile check, then commit.

---

## Step 5: Training Start Date Screen

**File**: New `app/src/components/TrainingStartDate.tsx`

### Layout
- [ ] Same clean card style as setup screen

### Content
```
One more thing — when did you start MAF training?

If you've been doing MAF runs, we'll analyze your history
and you might already be a few levels in.

[ Date picker input ]

◉ I'm just getting started (that's great — we'll track from today)

[ Let's Go ]
```

### Details
- [ ] Date picker: HTML `<input type="date">` with max set to today
- [ ] Radio option: "I'm just getting started" — when selected, disables date picker and sets start_date to today's date
- [ ] Default state: "I'm just getting started" selected
- [ ] When a date is picked: show a teaser line — "We'll look at your runs since {date}. You might be surprised."
- [ ] CTA: "Let's Go"
  - On click: `PUT /api/settings` with `training_start_date`
  - If start date is in the past → advance to backfill screen
  - If start date is today → skip backfill, set `backfill_complete = true`, advance to dashboard

### Compile check, then commit.

---

## Step 6: Backfill Screen

**File**: New `app/src/components/BackfillProgress.tsx`

### Two phases: progress → reveal

**Phase 1: Processing**
```
🔥 Analyzing your history...

████████████░░░░░░░░  14 / 23 runs

Crunching the numbers on your aerobic training.
This'll just take a moment.
```

**Phase 2: Results reveal**
```
🎉 Look at that.

You've already logged {zoneMinutes} zone minutes across {runCount} runs.

Level {X} · {LevelName}
████████████████░░░░  {pct}%
→ {NextLevelName}

[badge icons in a row — earned ones lit up]

You've already built a foundation. Let's keep the fire going.

[ See Your Dashboard ]
```

### Details

**Phase 1:**
- [ ] On mount, trigger backfill: `POST /api/backfill`
- [ ] Backfill endpoint should return progress updates OR the frontend polls `GET /api/game` periodically to check status
- [ ] Show animated progress bar with run count
- [ ] Spinner or pulse animation while processing

**Phase 2:**
- [ ] When backfill completes, fetch final game state
- [ ] Display results: level, level name, progress bar, earned badges, lifetime zone minutes, run count
- [ ] Badge icons displayed in a horizontal row — earned ones full color with green glow, unearned ones hidden (only show earned)
- [ ] One confetti burst for the reveal moment (not per-badge — this is the bulk celebration)
- [ ] "See Your Dashboard" button advances to dashboard
- [ ] Mark `backfill_complete = true` in game state

**Edge cases:**
- [ ] No runs with HR data → skip to dashboard with message: "Your first MAF run will light the fire. Just keep it under {ceiling}."
- [ ] Zero qualifying runs → show what they earned anyway (First Spark etc. still fire for any run)
- [ ] API error → graceful fallback: "Something went wrong analyzing your history. No worries — we'll track from here." → advance to dashboard

### Backfill endpoint (`POST /api/backfill`):
- [ ] If this doesn't exist yet, create it in `worker/src/index.ts`
- [ ] Loads all cached activities from `MAF_ACTIVITIES` KV
- [ ] Filters to runs after `training_start_date`
- [ ] Sorts chronologically
- [ ] Processes each through `processNewRun()` (which handles analysis, XP, badges)
- [ ] Sets `backfill_complete = true` in game state
- [ ] Returns: `{ processed: number, game: GameState }`

### Compile check, then commit.

---

## Step 7: Dashboard — First Load State

**File**: `app/src/components/Dashboard.tsx`, `app/src/components/GameCard.tsx`

### With backfill (has history):
- [ ] Dashboard loads normally with populated data
- [ ] Game card shows level, all earned badges, streak status
- [ ] Next Step Engine shows the relevant next action
- [ ] No special first-load treatment needed — the data speaks for itself

### Without backfill (brand new runner):
- [ ] Game card shows Level 1 · Spark, Committed badge
- [ ] Streak section: first-week progress bar at 0/90 min
- [ ] Next Step Engine message: "Go for your first MAF run. Keep your heart rate under {ceiling} bpm. Walk if you need to — that counts."
- [ ] Chart area: ceiling line drawn, no data points. Subtle text: "Your runs will appear here"
- [ ] Run list: empty state message: "Your first run will show up after syncing with Strava"

### Implementation
- [ ] Add empty states to chart and run list components (may already exist)
- [ ] Ensure Next Step Engine produces the "first run" message when `lifetime_total_runs === 0`

### Compile check, then commit.

---

## Step 8: Returning User Bypass

**File**: Routing logic from Step 1

### Behavior
- [ ] If user is authenticated AND has settings (age set) AND has `backfill_complete === true`: skip all onboarding, go directly to dashboard
- [ ] If user has settings but no `training_start_date`: show a subtle, non-blocking prompt in the game card: "Set your training start date to unlock your history" — NOT a modal, NOT a gate. Just a link that opens the date picker.
- [ ] This handles the case of existing v2 testers who already have settings — they shouldn't see the full onboarding flow

### Migration for existing users
- [ ] If a user already has settings + game state but no `backfill_complete` field: treat as `backfill_complete = true` (they're an existing user, don't force them through onboarding)
- [ ] In `getAppState()`: if `settings.age` exists, default `backfill_complete` to `true` if the field is undefined

### Compile check, then commit.

---

## Testing Guide

### Test the full onboarding flow:

**Option A: Reset your onboarding state**

```bash
# Clear your settings to simulate a new user
curl -X DELETE http://localhost:8787/api/debug/reset-onboarding

# Or manually via KV (if debug endpoint doesn't exist):
# Remove settings for your athlete ID so age is null
```

Add a debug endpoint to the worker:

```typescript
// In worker/src/index.ts, add:
if (url.pathname === '/api/debug/reset-onboarding' && request.method === 'DELETE') {
  const athleteId = await resolveSession(request, env)
  if (!athleteId) return json({ error: 'Not authenticated' }, 401)

  // Clear settings (keeps tokens so auth still works)
  await env.MAF_SETTINGS.delete(athleteId)

  // Reset game state
  const { createInitialGameState } = await import('./lib/gameTypes')
  await env.MAF_GAME.put(`${athleteId}:game`, JSON.stringify(createInitialGameState()))

  return json({ reset: true, athleteId })
}
```

Then:
1. `curl -X DELETE http://localhost:8787/api/debug/reset-onboarding`
2. Reload `localhost:5173`
3. You should see the Landing Page (or Setup screen if auth is bypassed in dev mode)

**Option B: Test each screen independently**

Force the app state by temporarily overriding `getAppState()`:

```typescript
// Temporary: force a specific screen
// return 'landing'    // See landing page
// return 'setup'      // See setup screen
// return 'start_date' // See date picker
// return 'backfill'   // See backfill progress
return 'dashboard'     // Normal dashboard
```

### Test specific scenarios:

**Scenario 1: Brand new user**
1. Reset onboarding (Option A)
2. Walk through: Landing → OAuth → Setup → Committed badge → Start date → "Just getting started" → Dashboard
3. Verify: Level 1, Committed badge, empty chart, "first run" next step message

**Scenario 2: Experienced MAF runner joins**
1. Reset onboarding (Option A)
2. Walk through: Landing → OAuth → Setup → Committed badge → Start date → Pick a date 3 months ago → Backfill
3. Verify: Backfill processes runs, results screen shows level + badges + zone minutes, dashboard is populated

**Scenario 3: Returning user**
1. Don't reset anything
2. Reload the app
3. Verify: goes straight to dashboard, no onboarding screens

**Scenario 4: Existing user missing start date**
1. Manually remove `training_start_date` from settings but keep age
2. Reload
3. Verify: goes to dashboard (not blocked), shows subtle prompt to set start date

### Test the celebration:

```javascript
// In browser console — reset seen badges to re-trigger celebrations
localStorage.removeItem('maf_seen_badges')
```

### Test backfill:

```bash
# Trigger backfill directly
curl -X POST http://localhost:8787/api/backfill

# Check results
curl http://localhost:8787/api/game | python3 -m json.tool
```

---

## New Files Summary

| File | Purpose |
|------|---------|
| `app/src/components/LandingPage.tsx` | Pre-auth screen with Strava connect CTA |
| `app/src/components/OnboardingSetup.tsx` | Age/modifier/units form with live MAF ceiling |
| `app/src/components/TrainingStartDate.tsx` | Date picker with "just getting started" option |
| `app/src/components/BackfillProgress.tsx` | Progress bar → results reveal with confetti |

## Modified Files

| File | Changes |
|------|---------|
| `app/src/components/Dashboard.tsx` (or App.tsx) | Routing logic, app state detection |
| `app/src/components/GameCard.tsx` | Empty state for new users, next step "first run" message |
| `app/src/components/BadgeCelebration.tsx` | Level progress props (optional extension) |
| `worker/src/index.ts` | Debug reset endpoint, backfill endpoint (if not exists) |
| `worker/src/lib/gameTypes.ts` | `backfill_complete` field on GameState |

## Execution Order

1. **Step 1** (routing logic) — foundation for all screens
2. **Step 8** (returning user bypass) — do this right after routing so existing testing isn't disrupted
3. **Step 2** (landing page) — first screen in the flow
4. **Step 3** (setup screen) — second screen
5. **Step 4** (badge celebration) — extends existing component
6. **Step 5** (training start date) — third input screen
7. **Step 6** (backfill) — most complex, depends on all prior steps
8. **Step 7** (dashboard first load) — polish

This order ensures the app stays functional at every step — existing users hit the bypass (Step 8) and never see incomplete onboarding screens.
