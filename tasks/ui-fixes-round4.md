# UI Fixes — Round 4

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages. Follow-up to Round 3 fixes based on live testing with real data (11-12 runs, 2-week streak).

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after every fix**: `npx tsc --noEmit`
**Commit after each numbered fix.**

---

## Fix 1: Gamification Color — Green Gradients, Not Gold

**Files**: `app/src/components/GameCard.tsx`, any shared color constants

### Current state
- Gamification elements (streak bar, level bar, badge borders) use gold/amber accent
- Doesn't feel energetic enough, clashes with the existing palette

### New behavior
- [ ] Replace all gamification accent colors with **green** — the same green family used for the ceiling line and positive indicators
- [ ] Level progress bar: green gradient (darker green on left → brighter green on right as it fills)
- [ ] Streak progress bar: same green gradient treatment
- [ ] Badge borders (earned): bright green glow or border
- [ ] Badge borders (unearned): no border, just dimmed
- [ ] "Level 4 · Steady Flame" text: green
- [ ] Streak text ("🔥 2-week streak"): keep the fire emoji, text can stay white but the progress bar is green
- [ ] This unifies the visual language: green = good, green = progress, green = stay below ceiling

---

## Fix 2: Badge Backfill — Award All Earned Badges from History

**Files**: `worker/src/lib/badgeEngine.ts`, `worker/src/lib/gameState.ts`, `worker/src/index.ts`

### Problem
- With 11-12 runs, user should have 7-8 badges but only has 1 (Committed)
- The badge engine isn't retroactively evaluating existing runs
- Backfill processes runs through XP/analysis but doesn't run badge checks

### Fix
- [ ] Update backfill logic in `gameState.ts` to call `checkBadges()` for each run during backfill
- [ ] Backfill must process runs in chronological order so first-run badges (First Spark, Took the Initiative, etc.) fire correctly based on `lifetime_total_runs` count
- [ ] After backfill, the runner with 11-12 runs should have at minimum:
  - ✅ Committed (setup)
  - 🔥 First Spark (run 1)
  - 👟 Took the Initiative (run 2)
  - 🎯 Three for Three (run 3)
  - 💪 Showing Up (run 4)
  - ⭐ First Five (run 5)
  - 🎯 Dialed In (if any run ≥70% below ceiling)
  - 🌱 Seedling (if cumulative zone minutes ≥100)
- [ ] Add a **debug re-badge endpoint**: `POST /api/debug/rebadge`
  - Loads all cached activities for the athlete
  - Resets badges_earned to just ['committed']
  - Resets lifetime counters
  - Re-processes all runs chronologically through `checkBadges()` + `detectSurpriseBonuses()`
  - Returns the updated game state with all newly awarded badges
  - This endpoint is for testing only — can be removed or gated later

### Verification
- [ ] After hitting `/api/debug/rebadge`, `GET /api/game` should show 7-8 badges
- [ ] Dashboard should display them all in the trophy case

---

## Fix 3: Bigger Badges in Trophy Case

**File**: `app/src/components/GameCard.tsx` (or `BadgeTrophyCase.tsx`)

### Current state
- Badge icons are tiny — feel like an afterthought
- "BADGES · 1/29" header with a row of small icons
- Earned badges don't feel special enough

### New behavior
- [ ] Increase badge icon size significantly — at least 32x32px, ideally 40x40px
- [ ] Earned badges: full color, slight green glow/border, maybe a subtle shadow
- [ ] Unearned badges: 15-20% opacity, no glow, slightly smaller than earned (visual hierarchy)
- [ ] Show earned badges first in the row, then unearned — earned badges shouldn't be buried
- [ ] On desktop, if space allows, show 2 rows instead of 1 scrolling row
- [ ] On mobile, keep horizontal scroll but with larger icons
- [ ] "BADGES · 7/29" counter updates correctly after backfill
- [ ] On tap/click of an earned badge: show a small popup with badge name + message + date earned
- [ ] On tap/click of an unearned badge: show badge name + what they need to do to earn it (trigger description)

---

## Fix 4: Streak — Weekly Segments, Not One Bar

**File**: `app/src/components/GameCard.tsx`

### Current state
- 2-week streak shows as one continuous progress bar (88/90 min)
- No visual distinction between weeks
- Doesn't communicate "2 discrete weeks of hitting your target"

### New behavior
- [ ] Replace the single bar with a row of **discrete week blocks**
- [ ] Each block represents one week in the streak
- [ ] **Completed weeks**: fully filled green block (matching the new green accent)
- [ ] **Current week**: partially filled block showing progress (e.g., 88/90 min filled)
- [ ] **Future weeks**: empty/outlined blocks (show 1-2 upcoming to create pull — "fill the next block")

### Visual example (2-week streak, current week nearly complete):
```
🔥 2-week streak

[████] [████] [███░] [    ] [    ]
 Wk 1   Wk 2   Wk 3

88/90 min this week · 2 min to go
```

- [ ] Each filled block could show a subtle checkmark or the week number
- [ ] The current week's block animates as zone minutes accumulate
- [ ] Show enough empty blocks to hint at the next streak milestone (e.g., if they're at 2 weeks, show blocks up to 4 — the next consistency badge)
- [ ] When a week block completes (target met), it fills with a quick animation
- [ ] Below the blocks: "88/90 min this week · 2 min to go" — the specific current-week status

### Streak milestones on the blocks
- [ ] At week 2, 4, 8, 12, 26: show the streak badge icon above that week's block position
- [ ] These appear dimmed until earned — creates a visual trail of what's coming

---

## Fix 5: Header Redesign — Logo + How It Works + Upgrade

**File**: `app/src/components/Dashboard.tsx` (header section)

### Current state
- Left: "MAF Machine" text + "How it works" link (small, easy to miss)
- Right: "Brett · 131 bpm · 49 yrs >" settings block

### New layout
```
┌──────────────────────────────────────────────────────────────┐
│ [🔥] MAF Machine     How it works · Upgrade    Brett · 131 >│
└──────────────────────────────────────────────────────────────┘
```

- [ ] **Far left**: Logo placeholder — a fire icon (🔥 or custom SVG) + "MAF Machine" wordmark. This area will get a designed logo later, but for now use the fire emoji or a simple SVG flame at ~24px
- [ ] **Center-right**: "How it works" link (routes to Rules of the Game page) — make it more visible, slightly larger text, not buried
- [ ] **Center-right**: "Upgrade to Pro" link/button — subtle but present. Could be a small pill-shaped button or just a text link with the green accent. Links to future Stripe page (no-op for now)
- [ ] **Far right**: "Brett · 131 bpm · 49 yrs >" settings block (from Round 3 Fix 1)
- [ ] On mobile, "How it works" and "Upgrade" can collapse into the settings sidebar or be accessible from a small menu

---

## Fix 6: Badge Celebration Animation + Confetti

**Files**: New `app/src/components/BadgeCelebration.tsx`, `app/src/components/GameCard.tsx`, `package.json`

### Install
- [ ] Add `canvas-confetti` package: `npm install canvas-confetti` + `npm install -D @types/canvas-confetti`

### BadgeCelebration component
- [ ] Create a reusable overlay/modal component that fires when a badge is awarded
- [ ] Shows:
  - Badge icon (large, centered, ~80px)
  - Badge name
  - Badge message
  - Confetti burst animation (using canvas-confetti)
  - "Continue" or auto-dismiss after 3 seconds
- [ ] Confetti config: burst from center, green + white particles (matching our accent), moderate intensity (not a snowstorm)
- [ ] Component accepts: `badge: BadgeDefinition`, `onDismiss: () => void`

### Trigger points
- [ ] When the dashboard loads and new badges are detected in game state that weren't shown before:
  - Compare `game.badges_earned` to a locally stored "last_seen_badges" list (use React state or component-level tracking)
  - For each new badge, queue the celebration
  - Show one at a time — if 3 badges were earned, show them in sequence with a brief pause between
- [ ] When backfill completes (if we re-run badges), show a summary celebration instead of 8 individual ones: "You earned 7 badges!" with all icons displayed together + one confetti burst

### Testing with existing data
- [ ] After Fix 2 (badge backfill), hit the `/api/debug/rebadge` endpoint
- [ ] Reload the dashboard
- [ ] The badge celebration should fire for all newly awarded badges
- [ ] For ongoing testing: add a temporary debug button in the game card (dev mode only) that simulates awarding a badge — calls the BadgeCelebration component with a sample badge

### Dev-mode debug helpers
- [ ] If `DEV_MODE` env var is set, show a small "🎉 Test Badge" button in the game card
- [ ] Clicking it triggers the BadgeCelebration overlay with a random unearned badge
- [ ] This lets you iterate on the animation without needing to earn a real badge

---

## Execution Order

1. **Fix 2** (badge backfill + debug endpoint) — foundational, everything else depends on correct badge data
2. **Fix 1** (green color scheme) — quick visual pass
3. **Fix 3** (bigger badges) — depends on Fix 2 for data
4. **Fix 4** (streak segments) — independent
5. **Fix 5** (header redesign) — independent
6. **Fix 6** (confetti + celebration) — depends on Fix 2 for testing, Fix 3 for badge display

## Verification

After each fix:
1. Check at 400px (mobile), 768px (tablet), 1200px+ (desktop)
2. `npx tsc --noEmit` — no TypeScript errors
3. `GET /api/game` returns correct badge count after Fix 2
4. Badge celebration fires on dashboard reload after new badges are awarded
5. Streak shows correct number of week segments
6. Commit with descriptive message
