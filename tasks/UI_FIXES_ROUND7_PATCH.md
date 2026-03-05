# UI Fixes — Round 7 Patch

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages. These are corrections to Round 7 fixes that didn't land correctly.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after all fixes**: `npx tsc --noEmit`

---

## Fix 1: Activity Type Mapping Bug — Runs Bucketing Into "Other"

**File**: `app/src/components/Dashboard.tsx` (or wherever the activity type filter logic lives)

Running activities are incorrectly matching to "Other" instead of "Running". The Strava `type` field mapping is broken.

- [ ] Find the activity type bucketing function
- [ ] Debug why `type === 'Run'` activities are falling through to "Other"
- [ ] The correct mapping is:

```typescript
function getActivityCategory(type: string): 'running' | 'walking' | 'swimming' | 'cycling' | 'other' {
  const t = type?.toLowerCase?.() ?? ''
  if (['run', 'trailrun', 'virtualrun'].includes(t)) return 'running'
  if (['walk', 'hike'].includes(t)) return 'walking'
  if (['swim'].includes(t)) return 'swimming'
  if (['ride', 'virtualride', 'ebike_ride', 'ebikeride', 'mountainbikeride', 'handcycle', 'velomobile'].includes(t)) return 'cycling'
  return 'other'
}
```

- [ ] Note: Strava types are PascalCase (`Run`, `TrailRun`, `VirtualRide`) — normalize to lowercase before comparing to avoid case sensitivity bugs
- [ ] Verify: selecting "Running" shows running activities, "All" shows everything, "Other" only shows non-run/walk/swim/cycle types

---

## Fix 2: API Not Fetching Non-Run Activity Types

**File**: `worker/src/index.ts` (or wherever the Strava activities fetch happens) and/or the frontend fetch logic

The Strava API call is currently filtering to runs only. All activity types need to be fetched.

- [ ] Find the Strava `/athlete/activities` API call
- [ ] Remove any `type=Run` or similar query parameter filter that restricts to running only
- [ ] The fetch should retrieve ALL activity types: `GET https://www.strava.com/api/v3/athlete/activities?per_page=200&page=1` with no type filter
- [ ] Ensure the KV cache key and storage handles mixed activity types (not just `Run`)
- [ ] MAF analysis (`analyzeActivity`) should still run on all activity types — HR zone compliance works the same regardless of sport
- [ ] If any activity type mapping in the analysis makes assumptions about running (e.g., pace units), ensure it degrades gracefully for cycling/swimming (pace still applies to cycling, swimming uses different units but HR analysis is the same)
- [ ] After this fix, re-sync locally and verify activities from Strava other than runs appear in the "All" tab and their correct category tab

---

## Fix 3: Column Header "IN ZONE" → "Zone"

**File**: `app/src/components/Dashboard.tsx` (run list table header)

- [ ] Change the column header from `"IN ZONE"` (or `"IN\nZONE"`) to simply `"Zone"`
- [ ] Single word, no line break, consistent with the other short column headers (HR, PACE, EF, Q, INC.)

---

## Verification

1. Sync activities locally
2. "All" tab shows all activity types from Strava
3. "Running" tab shows only run-type activities (no walks, rides, etc.)
4. "Other" tab shows only activities that don't match run/walk/swim/cycle
5. Column header reads "Zone" on a single line
6. `npx tsc --noEmit` — zero errors
