# UI Fixes — Round 7

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after every fix group**: `npx tsc --noEmit`
**Commit after each numbered fix group.**

---

## Fix 1: Date Picker — "Since MAF Start Date" Option

**File**: `app/src/components/DateRangePicker.tsx` (or wherever the date range dropdown lives)

- [ ] Add "Since MAF Start Date" as a new option in the dropdown
- [ ] Position: between "Custom" and "Last 7 days"
- [ ] Apply the same divider/border treatment below it that "Custom" has (i.e., a visible separator line beneath this option before "Last 7 days")
- [ ] When selected, set the date range start to the user's `start_date` from settings (from KV: `settings.start_date`), end to today
- [ ] If `start_date` is null, disable or hide this option

**Dropdown order:**
```
Custom          ← divider below
Since MAF Start Date  ← divider below
Last 7 days
Last 28 days
Last 3 months
Last 6 months
Last year
All time
```

---

## Fix 2: Onboarding — Personalized Headline

**File**: `app/src/components/Onboarding.tsx` (or the first onboarding screen component)

- [ ] The Strava OAuth flow completes before this screen is shown. The athlete object is available in app state.
- [ ] Change headline from `"Welcome, there. 👋"` to `"Welcome, [firstname] 👋"` using `athlete.firstname` from the Strava OAuth/athlete payload
- [ ] If `firstname` is unavailable for any reason, fall back to `"Welcome 👋"`

---

## Fix 3: Onboarding — Remove Email from Settings Screen, Add as Final Step

**Part A — Remove email from settings screen**

**File**: `app/src/components/Onboarding.tsx` (settings form step)

- [ ] Remove the EMAIL field and its label, input, and helper text entirely from the settings form
- [ ] The settings form now only contains: Age, Modifier, Units, and the "Start Building 🔥" button

**Part B — Add email capture as the final onboarding step**

This step appears AFTER the "Committed" badge celebration modal (the confetti screen). The flow is:
```
Settings form → Loading/analysis screen → "Committed" badge celebration → Email capture → Dashboard
```

- [ ] Create a new screen/step that appears after the "Committed" badge modal is dismissed (after clicking "Continue")
- [ ] Centered layout, consistent with onboarding visual style
- [ ] Copy: `"What is your email so we can keep you updated on important enhancements?"`
- [ ] Single email input field, required, with basic email format validation
- [ ] CTA button: `"See your dashboard"` — disabled until a valid email is entered
- [ ] On submit: POST the email to `PUT /api/settings` alongside existing settings, then navigate to dashboard
- [ ] No "skip" option — this is required

---

## Fix 4: Loading Screen — Live Activity Counter

**File**: The loading/analysis screen component (used during both onboarding backfill and dashboard re-sync)

This component is shared — it appears during:
1. Onboarding: after settings are saved, while historical activities are fetched and analyzed
2. Dashboard: when the user manually re-syncs

- [ ] The loading screen currently shows a static progress bar and "Analyzing your runs from Strava..."
- [ ] Update to show a live counter: `"Analyzing run 12 of 47..."` that increments as each activity is processed
- [ ] The API should emit progress (either via polling a `/api/sync/progress` endpoint, or by the frontend counting fetched activities as they come in)
- [ ] If total count isn't known yet, show: `"Fetching your activities..."` until count is determined, then switch to `"Analyzing run X of Y..."`
- [ ] Progress bar fill should track X/Y percentage
- [ ] Reuse this exact component (same props interface) for both onboarding and dashboard re-sync — do not duplicate it

---

## Fix 5: Header — Avatar, Firstname, BPM, Type Scale

**File**: `app/src/components/Dashboard.tsx` or the header component

### Avatar placeholder
- [ ] Replace the `?` circle with a proper avatar placeholder — use a person silhouette SVG or initials-based circle (first letter of firstname on a dark background)
- [ ] When `athlete.profile` (Strava profile image URL) is available, display it as a circular `<img>` in the same slot
- [ ] Size: ~28–32px diameter

### Firstname in header pill
- [ ] Replace the text "Settings" with `athlete.firstname`
- [ ] Pill now reads: `[avatar] [firstname] · 131 bpm ⚙️`

### "How it works" type size
- [ ] The "How it works" link text is one size too small
- [ ] Increase by one step on the Tailwind type ramp (e.g., `text-xs` → `text-sm`, or `text-sm` → `text-base` — match whatever the current size is and go one up)

---

## Fix 6: Chart Toggle Pills — Icon Size Normalization

**File**: `app/src/components/TrendChart.tsx`

- [ ] The heart icon (♥) in the HR toggle pill is larger than the diamond icon (◆) in the Pace toggle pill
- [ ] Normalize both to ~12px (w-3 h-3 in Tailwind, or explicit `style={{ width: 12, height: 12 }}`)
- [ ] All other toggle pill icons should also be checked and normalized to the same size
- [ ] The heart icon is rendered as a filled span with `rotate-45` — ensure the bounding box is consistently 12×12

---

## Fix 7: Run List — Column Header + Activity Type Filter

**File**: `app/src/components/Dashboard.tsx` (run list section)

### Column header rename
- [ ] Change column header `"BELOW"` → `"IN ZONE"`

### Activity type filter pills
- [ ] Add a filter pill row directly above the run list table
- [ ] Pills: `All` · `Running` · `Walking` · `Swimming` · `Cycling` · `Other`
- [ ] Default: `All` selected
- [ ] Single-select — clicking a pill deselects the current one and selects the new one
- [ ] `Other` captures all Strava activity types not in the explicit list (e.g., yoga, elliptical, weight training, etc.)

**Strava activity type mapping:**
```
Running   → type === 'Run' || type === 'TrailRun' || type === 'VirtualRun'
Walking   → type === 'Walk' || type === 'Hike'
Swimming  → type === 'Swim'
Cycling   → type === 'Ride' || type === 'VirtualRide' || type === 'EBikeRide' || type === 'MountainBikeRide'
Other     → everything else
```

- [ ] When a non-All filter is active, the run count subheader updates: e.g., "4 runs" (filtered count)
- [ ] MAF analysis still applies to all activity types — zone compliance is calculated the same way for cycling, swimming, etc.

---

## Execution Order

1. Fix 1 (date picker) — isolated, no dependencies
2. Fix 2 (onboarding headline) — isolated
3. Fix 3 (email flow refactor) — depends on knowing onboarding step order
4. Fix 4 (loading counter) — shared component, do after onboarding flow is settled
5. Fix 5 (header) — isolated
6. Fix 6 (icon size) — isolated, 5-minute fix
7. Fix 7 (run list) — isolated

## Verification

After all fixes:
1. Check at 430px mobile, 768px tablet, 1200px+ desktop
2. `npx tsc --noEmit` — zero errors
3. Walk the full onboarding flow: OAuth → settings → loading → Committed badge → email → dashboard
4. Verify date picker "Since MAF Start Date" uses correct start date from settings
5. Verify activity filter pills correctly bucket Strava activity types
