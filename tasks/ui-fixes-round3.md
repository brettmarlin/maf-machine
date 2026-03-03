# UI Fixes — Round 3

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages. These fixes apply to both mobile and desktop.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after every fix**: `npx tsc --noEmit`
**Commit after each numbered fix.**

---

## Fix 1: Unified Header Block — Settings + Identity

**Files**: `app/src/components/Dashboard.tsx`, `app/src/components/SettingsSidebar.tsx` (or equivalent)

### Current state
- Left side: "131 bpm (49 yrs)" badge
- Right side: hamburger menu icon (☰)
- Two separate elements, disconnected

### New behavior
- [ ] Remove the separate hamburger menu icon
- [ ] Remove the separate "131 bpm (49 yrs)" badge from the left
- [ ] Create a single unified block on the **far right** of the header
- [ ] Block displays: **First Name · 131 bpm · 49 yrs** (e.g., "Brett · 131 bpm · 49 yrs")
- [ ] The entire block is tappable — opens the settings sidebar
- [ ] Style: subtle border or pill shape, looks like a settings affordance (maybe a small gear or chevron icon to hint it's tappable)
- [ ] If no name is stored yet, show "Settings · 131 bpm · 49 yrs"
- [ ] On mobile, can abbreviate to "Brett · 131" if space is tight

### Depends on
- Fix 6 (athlete name) — but can stub with "Settings" fallback initially

---

## Fix 2: Unified Chart Legend + Toggle Controls

**File**: `app/src/components/TrendChart.tsx`

### Current state
- Top of chart: toggle pills (HR, Pace, Eff, Cad, Avg)
- Bottom of chart: separate legend showing symbols (— Ceiling, ● Heart Rate, ◆ Pace)
- Redundant — two UI elements doing related jobs

### New behavior
- [ ] Remove the separate legend below the chart
- [ ] Replace the toggle pills with a unified toggle row where each item shows:
  - Its **symbol/color** (e.g., green dashed line for ceiling, heart icon for HR, diamond for pace)
  - Its **short label** (HR, Pace, Eff, Cad, Avg)
  - **Tappable** to toggle the data series on/off
- [ ] Active state: full opacity symbol + label, subtle filled background
- [ ] Inactive state: dimmed symbol + label, no fill
- [ ] Ceiling is always shown (not toggleable) — displayed as a reference item in the row but not interactive
- [ ] On mobile, row should be horizontally scrollable if it overflows

---

## Fix 3: Mobile Chart Overhaul + Heart-Shaped HR Dots

**File**: `app/src/components/TrendChart.tsx`, possibly `Dashboard.tsx` for container

### Chart breathing room (mobile)
- [ ] Reduce container padding on mobile — chart should use nearly full viewport width
- [ ] Slim down or conditionally hide the **right Y-axis** (pace labels) on mobile viewports (<500px)
  - Option A: hide right axis entirely on mobile, show pace values on tooltip only
  - Option B: show abbreviated labels (e.g., "12:45" instead of "12:45 /mi")
- [ ] Reduce left Y-axis width — tighter labels, less padding
- [ ] The combined legend/toggle from Fix 2 should save vertical space vs current pills + legend

### Heart-shaped HR data points
- [ ] Replace the gray circle (●) for Heart Rate data points with a **small heart shape**
- [ ] Implement as a custom Recharts dot using SVG path for a heart shape
- [ ] Keep the same gray/white color as current circles
- [ ] Size should match the current diamond size used for Pace
- [ ] The heart shape reinforces the "heart rate" concept visually

---

## Fix 4: Submetric Cards — Cadence Filter + Rename "Time in Zone"

**Files**: `app/src/components/SummaryCards.tsx`, `app/src/lib/mafAnalysis.ts`

### Cadence: filter out walking
- [ ] In the analysis engine, when computing average cadence, **exclude walking intervals**
- [ ] Walking detection: use velocity/speed data from Strava streams. If pace is slower than a threshold (suggest ~16:00/mi or ~10:00/km, or speed < ~1.7 m/s), classify as walking
- [ ] Only average cadence from running intervals
- [ ] The card subtitle should reflect this: "spm (running)" or similar subtle indicator
- [ ] Add a **trend indicator** (↑ improving / ↓ declining) comparing to recent runs, same style as Efficiency card's "↗ Improving"

### Rename "Below Ceiling" → "Time in Zone"
- [ ] Card title: **TIME IN ZONE**
- [ ] Subtitle stays: "≤ 131" (or "≤ {mafHr} bpm")
- [ ] Add a **trend indicator** (↑ improving / ↓ declining) comparing to recent 4-week average
- [ ] Use green for improving, muted/gray for declining

---

## Fix 5: Gamification Accent Color + Badge Trophy Case

**Files**: `app/src/components/GameCard.tsx`, possibly new `BadgeTrophyCase.tsx`

### New gamification accent color
- [ ] Introduce a **purple or gold** accent color for all gamification elements
- [ ] Apply to: streak progress bar, level progress bar, streak text highlights, badge borders
- [ ] This visually separates game mechanics from data metrics (which use orange/green)
- [ ] Suggested: gold (`#D4A84B` or similar warm gold) — fits the "fire" metaphor
- [ ] Update the level progress bar from current orange to the new accent color
- [ ] Update streak progress bar similarly

### Badge trophy case
- [ ] Add a horizontally scrolling badge strip within the game card area
- [ ] Show **all achievable badges** (from the BADGES array in gameTypes.ts)
- [ ] **Earned badges**: full color, full opacity, icon displayed proudly
- [ ] **Unearned badges**: grayed out, low alpha (~20-30%), icon still visible but muted
- [ ] On tap/click, show a small tooltip or modal with badge name + message (earned) or badge name + trigger hint (unearned, e.g., "Run 20+ continuous minutes below ceiling")
- [ ] Order: First Run badges first, then Discipline, Consistency, Volume, MAF Test
- [ ] Row scrolls horizontally on both mobile and desktop if badges overflow

---

## Fix 6: Settings — Pull Athlete Name from Strava

**Files**: `app/src/components/SettingsSidebar.tsx`, `worker/src/index.ts`

### Current state
- Name field shows "Strava Athlete" as static placeholder text
- Not editable, not pulling real data

### New behavior
- [ ] **Worker side**: During OAuth callback, extract `athlete.firstname` and `athlete.lastname` from the Strava auth response
- [ ] Store athlete name in settings KV alongside age/modifier/units: `{ name: "Brett", ... }`
- [ ] If name already exists in settings, don't overwrite on subsequent logins (user may have edited it)
- [ ] **Frontend side**: Settings sidebar Name field shows the real name from settings
- [ ] Make the field **editable** — user can change their name if they want
- [ ] Save name with the rest of settings on the PUT /api/settings call
- [ ] This name feeds into Fix 1 (unified header block)

---

## Fix 7: Coach Card — Pro Upsell Gate

**Files**: `app/src/components/CoachCard.tsx`, possibly `Dashboard.tsx`

### Current state
- Coach card shows full AI coaching assessment for every run
- Runner notes input below coaching text
- Claude API fires on every webhook (costs ~$0.42/month/user)

### New behavior (free/default mode)
- [ ] Add a feature flag: `COACHING_ENABLED` (default: `false`)
- [ ] When **disabled** (free tier):
  - Coach card shows a **teaser**: the run name + date header stays, but assessment is replaced with an upsell message
  - Suggested copy: "**Unlock AI Coaching** — Get personalized insights for every run, powered by an AI coach that learns your patterns and gets smarter over time."
  - Show a CTA button: "Upgrade to Pro" (links to future Stripe page, can be a no-op for now)
  - Runner notes input is **hidden**
  - No Claude API calls fire from webhooks
- [ ] When **enabled** (Pro tier):
  - Full coaching assessment as it works today
  - Runner notes input visible
  - Claude API fires normally
- [ ] The flag can be a simple env var (`COACHING_ENABLED=true/false`) or stored per-user in settings for future Stripe integration
- [ ] For now, default to **off** so we can launch without API costs

---

## Execution Order

1. **Fix 6** (athlete name) — foundational, feeds into Fix 1
2. **Fix 1** (unified header) — depends on Fix 6
3. **Fix 4** (submetric cards) — independent, quick
4. **Fix 2** (chart legend/toggles) — independent
5. **Fix 3** (mobile chart + heart dots) — builds on Fix 2
6. **Fix 5** (game accent color + badges) — independent
7. **Fix 7** (coach card gate) — independent

## Verification

After each fix:
1. Check at 400px (mobile), 768px (tablet), 1200px+ (desktop)
2. `npx tsc --noEmit` — no TypeScript errors
3. No content overflow or clipping
4. Commit with descriptive message
