# UI Fixes — Round 5

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages. Collected from live testing session.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after every fix**: `npx tsc --noEmit`
**Commit after each numbered fix.**

---

## Fix 1: "Since Start" Date Picker Broken

**File**: `app/src/components/TrendChart.tsx` (or wherever the date range dropdown lives)

- [ ] The "Since start" date range picker/dropdown is not functioning — investigate and fix
- [ ] It should allow selecting time ranges: "Since start", "Last 4 weeks", "Last 8 weeks", etc.
- [ ] Verify the dropdown opens, options are selectable, and the chart updates accordingly

---

## Fix 2: Heart Icon Squashed

**File**: `app/src/components/TrendChart.tsx` (custom SVG dot for HR data points)

- [ ] The heart-shaped data point for HR is vertically squashed — not symmetrical
- [ ] Increase the vertical height of the heart SVG path so it looks like a proper heart shape
- [ ] Should be roughly equal width and height — symmetrical proportions
- [ ] Test at multiple chart sizes to ensure it scales correctly

---

## Fix 3: Submetric Cards — Reorder + Fix Efficiency Layout

**Files**: `app/src/components/SummaryCards.tsx`, `app/src/components/Dashboard.tsx`

### Reorder
- [ ] Current order: Time in Zone, Cadence, Efficiency
- [ ] New order: **Cadence → Time in Zone → Efficiency**

### Fix Efficiency card layout
- [ ] The Efficiency card has a different internal layout than the other two (trend indicator "↗ Improving" is positioned differently)
- [ ] Make all three cards use the same layout: label top-left, trend indicator below label (same position as Cadence and Time in Zone), value below that
- [ ] All three should be visually identical in structure

---

## Fix 4: Chart — Hide Y-Axis Labels on Mobile + Remove Tap Outline

**File**: `app/src/components/TrendChart.tsx`

### Hide Y-axis on mobile
- [ ] On viewports < 500px, hide both left (HR/bpm) and right (pace) Y-axis tick labels
- [ ] The data is available via tooltip on tap — axis labels aren't needed on mobile
- [ ] Keep axis labels visible on desktop (≥500px)
- [ ] The ceiling label "131" on the left can stay (it's part of the reference line, not the axis)

### Remove tap outline
- [ ] When tapping a data point on mobile, there's an orange outline/highlight box around the chart area (visible in screenshot)
- [ ] Remove this — likely a CSS `outline` or `focus` style on the Recharts container or an `activeDot` stroke
- [ ] The tooltip should appear without any bounding box highlight on the chart

---

## Fix 5: Training Start Date — Reset Confirmation

**File**: `app/src/components/SettingsSidebar.tsx`

- [ ] When a user changes their MAF Training Start Date in settings, check if they have existing progress:
  - `badges_earned.length > 1` (more than just Committed)
  - OR `streak.current_weeks > 0`
  - OR `lifetime_qualifying_runs > 0`
- [ ] If they have existing progress, show a confirmation dialog before saving:
  - "Changing your start date will reset your streaks, badges, and level progress. Your Strava data won't be affected. Are you sure?"
  - Two buttons: "Cancel" and "Reset & Recalculate"
- [ ] If confirmed: save the new start date, trigger a re-backfill from the new date
- [ ] If cancelled: revert the date picker to the previous value

---

## Fix 6: Training Start Date — Future Date Option

**File**: `app/src/components/TrainingStartDate.tsx` (onboarding screen)

- [ ] Add a third option to the training start date screen:

```
◉ I started on a specific date
  [ date picker — past dates only ]

○ I'm just getting started
  That's great — we'll track from today

○ I'm starting on a future date
  [ date picker — future dates only ]
  We'll be ready when you are.
```

- [ ] When "future date" is selected: save the date, skip backfill, set `backfill_complete = true`, go to dashboard
- [ ] Dashboard should show a welcome state: "Your MAF training starts on {date}. We'll start tracking when you run."
- [ ] Runs before the future start date should be ignored (same as runs before a past start date)

---

## Fix 7: Chart Colors — HR and Pace

**File**: `app/src/components/TrendChart.tsx`

### HR color
- [ ] Change HR line + data points from current gray/white to **coral/salmon** (`#FF6B6B`)
- [ ] Heart-shaped dots: fill with coral/salmon
- [ ] HR trend line (if using rolling average): same coral color, slightly transparent
- [ ] This gives maximum contrast against the green zone shading

### Pace color
- [ ] Change Pace line + diamonds from orange to **white/light gray** (`#E0E0E0`)
- [ ] Pace becomes the secondary visual — the outcome metric, not the one you manage
- [ ] Pace trend line: same light gray

### Toggle pills
- [ ] Update the HR pill icon/color indicator to match coral
- [ ] Update the Pace pill icon/color indicator to match white/gray
- [ ] Ceiling stays green
- [ ] Eff, Cad remain their current muted colors

---

## Fix 8: Settings Sidebar — Not Populated After Onboarding

**File**: `app/src/components/SettingsSidebar.tsx`

- [ ] After completing onboarding (setup screen saves age, modifier, units, name), the settings sidebar shows empty/default values
- [ ] The sidebar should fetch current settings from `/api/settings` on open and populate all fields:
  - Name: populated with the name entered during onboarding (or from Strava OAuth)
  - Age: populated with the age set during onboarding
  - Training Status (modifier): populated with the modifier chosen during onboarding
  - MAF Training Start Date: populated with the date chosen during onboarding
  - Units: populated with the units chosen during onboarding
- [ ] If the sidebar is caching settings from an earlier fetch, force a re-fetch when the sidebar opens

---

## Fix 9: Settings Sidebar — Remove "Runs Before This Date" Text

**File**: `app/src/components/SettingsSidebar.tsx`

- [ ] Remove the subtitle text "Runs before this date are ignored" from the MAF Training Start Date field
- [ ] The label "MAF TRAINING START DATE" is sufficient on its own

---

## Execution Order

1. **Fix 8** (settings population) — fixes data flow, may reveal other issues
2. **Fix 9** (remove subtitle text) — trivial, do it with Fix 8
3. **Fix 3** (submetric card reorder + layout) — independent
4. **Fix 2** (heart icon) — quick SVG fix
5. **Fix 7** (chart colors) — visual, independent
6. **Fix 4** (mobile Y-axis + tap outline) — chart polish
7. **Fix 1** (date picker broken) — investigate and fix
8. **Fix 5** (start date reset confirmation) — settings logic
9. **Fix 6** (future date option) — onboarding addition

## Verification

After each fix:
1. Check at 400px (mobile) and 1200px+ (desktop)
2. `npx tsc --noEmit` — no TypeScript errors
3. Test the onboarding flow: `curl -X DELETE http://localhost:8787/api/debug/reset-onboarding` then reload
4. Test settings sidebar: open after onboarding, verify all fields populated
5. Test chart: verify colors, heart icon proportions, mobile Y-axis hidden
6. Commit with descriptive message
