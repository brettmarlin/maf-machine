# UI Fixes — Round 8

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after all fixes**: `npx tsc --noEmit`

---

## Fix 1: Metric-Specific Activity Eligibility

**Files**: `app/src/lib/mafAnalysis.ts`, `worker/src/lib/mafAnalysis.ts`

### The Problem

Activities without pace data (swims, some cycling sessions) are currently being included in pace, efficiency factor, and other metric averages. This corrupts the averages because null or zero values are being factored in.

### The Fix: Per-Metric Eligibility Flags

Each metric average should only include activities that have the relevant data available. Apply this logic in `computeTrends()` and `computeSummary()` wherever averages are calculated.

### Eligibility Rules

```typescript
// HR metrics — include if activity has HR data
const hasHR = (a: MAFActivity): boolean =>
  a.avg_hr > 0

// Pace metrics — include if activity has pace data AND is not cycling
// Cycling pace is not comparable to running pace — exclude entirely
const hasPace = (a: MAFActivity): boolean =>
  a.avg_pace > 0 &&
  !['ride', 'virtualride', 'ebike_ride', 'ebikeride', 'mountainbikeride', 'handcycle', 'velomobile']
    .includes((a.sport_type ?? a.type ?? '').toLowerCase())

// Efficiency Factor — requires both pace AND HR, and not cycling
const hasEF = (a: MAFActivity): boolean =>
  hasHR(a) && hasPace(a) && a.efficiency_factor > 0

// Cadence — only if cadence was recorded
const hasCadence = (a: MAFActivity): boolean =>
  a.avg_cadence > 0

// Zone / below-ceiling minutes — requires HR only
const hasZone = (a: MAFActivity): boolean =>
  hasHR(a)
```

### Apply Eligibility in Averages

Replace any averaging logic that operates on all activities with filtered sets:

```typescript
// HR trend — all activities with HR
const hrActivities = activities.filter(hasHR)

// Pace trend — non-cycling activities with pace
const paceActivities = activities.filter(hasPace)

// EF trend — activities with both HR and pace, non-cycling
const efActivities = activities.filter(hasEF)

// Cadence average — activities with cadence data
const cadenceActivities = activities.filter(hasCadence)

// Zone minutes / time below ceiling — all activities with HR
const zoneActivities = activities.filter(hasZone)
```

### MAFActivity Interface

- [ ] Ensure `MAFActivity` has a `sport_type` or `type` field that carries the Strava activity type through to the analysis layer
- [ ] If not already present, add `sport_type: string` to `MAFActivity` and populate it from the Strava activity object during analysis
- [ ] This field is needed for the cycling exclusion check above

### Summary Cards

- [ ] **Heart Rate card**: averages from `hrActivities` only
- [ ] **MAF Pace card**: averages from `paceActivities` only — cycling excluded
- [ ] **Efficiency Factor card**: averages from `efActivities` only
- [ ] **Cadence card**: averages from `cadenceActivities` only
- [ ] **Time in Zone / Below Ceiling card**: totals and averages from `zoneActivities` only

### Trend Chart

- [ ] HR line: plot only data points where `hasHR(activity)` is true
- [ ] Pace line: plot only data points where `hasPace(activity)` is true — cycling activities show no pace dot
- [ ] EF line: plot only data points where `hasEF(activity)` is true
- [ ] Missing data points should produce a gap in the line, not a zero — use `null` for missing values in the Recharts data array (Recharts handles null as a gap with `connectNulls={false}`)

### Zone Minutes / Streak Calculation

- [ ] Zone minutes accumulation: include ALL activity types that have HR data — a 45-minute swim entirely below ceiling absolutely counts toward zone minutes, streak, and level progression
- [ ] Only pace-derived metrics (MAF Pace, EF) exclude cycling and no-pace activities

---

## Verification

1. Add a cycling or swimming activity to your Strava test account (or mock one in local data)
2. Verify: HR average includes it, pace average does NOT include it
3. Verify: zone minutes for a below-ceiling swim/cycle session ARE counted toward totals
4. Verify: EF card only reflects runs and walks with valid pace + HR
5. Verify: trend chart shows a gap (not zero) where pace data is missing for a non-run activity
6. `npx tsc --noEmit` — zero errors
