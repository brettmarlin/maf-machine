# UI Fixes — Round 2

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages. These fixes apply to both mobile (375-430px) and desktop viewports.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Commit after each numbered fix group.**

---

## Fix 1: Chart — Maximize Width & Improve Toggle Pills

**Files**: `app/src/components/TrendChart.tsx`, possibly parent container in `Dashboard.tsx`

### Chart width
- [ ] Remove excessive left/right padding on the chart container — the chart should use nearly the full viewport width on both mobile and desktop
- [ ] Reduce Recharts `YAxis` width and padding — metric labels (bpm values on left, pace values on right) should nearly bleed to the container edges
- [ ] On mobile especially, the chart is severely compressed horizontally — maximize every pixel

### Toggle pills
- [ ] Shorten labels for mobile: "Efficiency" → "Eff", "Cadence" → "Cad". Keep "HR", "Pace", "Avg" as-is (already short)
- [ ] Alternatively, make the pill row horizontally scrollable on mobile with `overflow-x-auto`
- [ ] Fix the on/off color scheme: currently HR (on) looks almost identical to off state because it's a very light gray. Use a consistent scheme:
  - **Off state**: outline/border only, no fill, muted text
  - **On state**: filled background with clear contrast. Use the same fill treatment for all active pills (don't make HR white and Pace orange — pick one scheme)
  - Suggestion: off = transparent with border, on = semi-transparent white fill with white text (or use the orange accent consistently)

### "Since start" dropdown
- [ ] On mobile, ensure this doesn't crowd the right edge — add right padding or let it sit on its own row below the pills

---

## Fix 2: Metric Cards — Restructure Layout

**Files**: `app/src/components/SummaryCards.tsx`, `Dashboard.tsx`

### Current state
- Top row: Heart Rate + MAF Pace (2 cards, large)
- Below: "Below Ceiling" (full width, with sparkline)
- Below that: Cadence + Efficiency (2 cards, smaller)

### New layout
- [ ] **Keep Heart Rate and MAF Pace as the two primary cards** — side by side, same size
- [ ] **Below Ceiling, Cadence, and Efficiency**: all three should be full-width stacked cards at the same height, same visual treatment
  - Match the compact style of current Cadence/Efficiency cards (label, value, trend indicator — no sparkline)
  - Remove the sparkline from Below Ceiling card
- [ ] Fix inconsistent label colors: "4 below ceiling" and "-76.1s/wk" should be the same color (use green for positive/improving, use the orange accent sparingly)
- [ ] Sparkline in the Below Ceiling card (if kept anywhere) should use green, not the current color

---

## Fix 3: Chart — Ceiling Line & Zone Colors

**File**: `app/src/components/TrendChart.tsx`

### Ceiling line
- [ ] Change the ceiling dotted line from orange to **green** — green = safe boundary, psychologically reinforces "stay below this"
- [ ] The "Ceiling 131" label should also be green

### Zone shading
- [ ] Both zones below the ceiling line should be **shades of green with progressive alpha**:
  - Controlled zone (just below ceiling): green with ~15% opacity
  - Easy zone (further below): green with ~8% opacity
  - The visual effect is a gradient that fades into the dark background
- [ ] **Remove the gap between the ceiling line and the top of the controlled zone** — the ceiling line should sit exactly on the top edge of the controlled zone, not float above it
- [ ] The gap between controlled and easy zones can be slightly smaller than current

### Breathing room on the right
- [ ] Add ~10% extra space to the right of the last data point so the most recent run's dot/diamond isn't jammed against the right axis
- [ ] This also creates visual room for a future trend projection line

### Legend
- [ ] Update legend to show the green ceiling line color (currently shows orange)

---

## Fix 4: Run List Table — Header & Badges

**File**: `app/src/components/Dashboard.tsx` (run list section)

### Column header fix
- [ ] "RUNS (12)" is wrapping to two lines — move the count out of the header. Options:
  - Put the run count in a subtle label above or below the table: "12 runs"
  - Or just use "RUNS" as the header with no count
- [ ] All column headers must fit on one line at all viewports

### Runner icon
- [ ] Keep the runner icon for now, but it's expendable if space is tight on mobile

### Run quality badges
- [ ] For runs that are exceptionally good (e.g., zone % > 85%, or cardiac drift < 3%, or earned bonus XP), show a small badge/icon in the row
- [ ] Suggestion: a small star ⭐ or flame 🔥 icon next to the run name or in the Q column
- [ ] This ties into the game mechanics — outstanding runs should feel special in the list
- [ ] Define "outstanding" threshold: zone > 85% AND qualifying = true (can refine later)

---

## Fix 5: Coach Card — Condense & Restructure

**File**: `app/src/components/CoachCard.tsx`

### Header
- [ ] Replace "Latest run" with the actual run date and name: e.g., "MAF 12 — Mar 2" so the user knows exactly which run is being coached
- [ ] Keep "Strava ↗" link on the right

### Content structure
- [ ] **Summary line**: 1-2 sentences max at the top, always visible. This is the TL;DR of the coaching.
- [ ] **Show more** expands to reveal the full assessment (2-4 paragraphs)
- [ ] **Remove the sparkle (✦) highlight and arrow (→) focus lines** at the bottom — these are redundant with a good summary line. Or, repurpose that space for:

### Runner notes area
- [ ] Below the coaching text, add a "How did this run feel?" prompt or "Add notes" text input
- [ ] This is a lightweight way to capture runner context (how they felt, conditions, etc.)
- [ ] Store notes per activity in KV alongside the coaching cache
- [ ] These notes feed into the coaching context for future runs — the coach can reference "you mentioned feeling tired last run"
- [ ] This replaces the ✦/→ lines and adds real value

### Previous coaching
- [ ] Add a way to access previous run coaching — either a "Previous" link/arrow that loads the prior run's assessment, or make the run list rows tappable to see that run's coaching

---

## Fix 6: Game Card — Clean Up Layout

**File**: `app/src/components/GameCard.tsx`

### Desktop layout (the stacked columns issue)
- [ ] Current: quest card (left, tall) + streak card (right, short) + weekly progress (right, short) — looks uneven
- [ ] Fix: stack all three items vertically at equal width, OR use a 3-column grid where each gets equal space
- [ ] Recommended: single column stack on all viewports — Quest → Streak → Weekly Progress, each full width
- [ ] This is simpler, scans top-to-bottom, and avoids the awkward height mismatch

### Level display
- [ ] "Lvl 2" is cryptic — change to "Level 2" (spell it out)
- [ ] The dot-based progress indicator is unreadable — replace with a simple progress bar (already noted in prior fixes)

### XP display
- [ ] "653 XP · 847 to Jogger" is good info but could be clearer
- [ ] Consider: "653 / 1,500 XP" with "Level 3: Jogger" as the label, showing the absolute target

---

## Verification

After each fix:
1. Check at 400px (mobile), 768px (tablet), and 1200px+ (desktop)
2. `npx tsc --noEmit` — no TypeScript errors
3. Visual check that no content overflows or clips
4. Commit with descriptive message

## Execution Order

1. Fix 2 (metric cards) — restructures the foundation
2. Fix 3 (chart colors/zones) — visual improvements
3. Fix 1 (chart width/pills) — layout optimization
4. Fix 6 (game card) — layout cleanup
5. Fix 5 (coach card) — content restructure
6. Fix 4 (run list) — polish

This order avoids conflicts — metric cards and chart changes are independent, game card and coach card are independent, run list is isolated.
