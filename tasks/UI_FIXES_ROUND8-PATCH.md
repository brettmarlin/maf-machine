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

Non-run activities (walks, cycles, swims) are being included in pace, efficiency factor, and cadence averages. Walking pace in particular tanks the MAF Pace average significantly. These metrics are only meaningful for running.

### The Rule (Simple)

```
Runs only   → HR, Pace, EF, Cadence, Zone minutes
Everything else → HR and Zone minutes only
```

A "run" is any activity where `sport_type` maps to the running category:
`Run`, `TrailRun`, `VirtualRun`

### Eligibility Helpers

```typescript
const isRun = (a: MAFActivity): boolean =>
  ['run', 'trailrun', 'virtualrun']
    .includes((a.sport_type ?? a.type ?? '').toLowerCase())

const hasHR = (a: MAFActivity): boolean =>
  a.avg_hr > 0

// Pace, EF, Cadence — runs only
const isPaceEligible = (a: MAFActivity): boolean =>
  isRun(a) && a.avg_pace > 0

const isEFEligible = (a: MAFActivity): boolean =>
  isRun(a) && hasHR(a) && a.efficiency_factor > 0

const isCadenceEligible = (a: MAFActivity): boolean =>
  isRun(a) && a.avg_cadence > 0

// HR and Zone — all activity types with HR data
const isHREligible = (a: MAFActivity): boolean =>
  hasHR(a)

const isZoneEligible = (a: MAFActivity): boolean =>
  hasHR(a)
```

### Apply Eligibility Everywhere Averages Are Computed

Replace any averaging logic that operates on all activities:

```typescript
const runActivities       = activities.filter(isPaceEligible)   // pace avg
const efActivities        = activities.filter(isEFEligible)     // EF avg
const cadenceActivities   = activities.filter(isCadenceEligible) // cadence avg
const hrActivities        = activities.filter(isHREligible)     // HR avg
const zoneActivities      = activities.filter(isZoneEligible)   // zone minutes
```

### MAFActivity Interface

- [ ] Ensure `MAFActivity` carries a `sport_type: string` field populated from the Strava activity object
- [ ] If not already present, add it and pass it through from the Strava fetch → analysis pipeline
- [ ] This is the field used by `isRun()` and all eligibility checks above

### Summary Cards

- [ ] **Heart Rate card**: averages from `hrActivities` (all activity types with HR)
- [ ] **MAF Pace card**: averages from `runActivities` only
- [ ] **Efficiency Factor card**: averages from `efActivities` (runs with HR + pace)
- [ ] **Cadence card**: averages from `cadenceActivities` (runs with cadence data)
- [ ] **Time in Zone / Below Ceiling card**: totals from `zoneActivities` (all activity types with HR)

### Trend Chart

- [ ] HR line: all activities with HR — show a dot/point for every activity type
- [ ] Pace line: runs only — non-run activities produce no dot and a gap in the line
- [ ] EF line: runs only
- [ ] Cadence line: runs only
- [ ] Use `null` for missing values in the Recharts data array so gaps render as breaks, not zeros (`connectNulls={false}`)

### Zone Minutes / Streak / Level Progression

- [ ] Zone minutes accumulation counts ALL activity types with HR data below ceiling
- [ ] A 45-minute swim or cycle entirely below ceiling counts toward zone minutes, weekly target, streak, and level progression
- [ ] Only pace-derived metrics (Pace, EF, Cadence) are restricted to runs

---

## Verification

1. Check MAF Pace average — should only reflect runs, not walks or rides
2. Check HR average — should include all activity types with HR data
3. Check zone minutes — a non-run activity below ceiling should contribute to the total
4. Trend chart pace line — non-run activities should produce gaps, not data points
5. `npx tsc --noEmit` — zero errors
