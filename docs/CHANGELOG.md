# Phase B: Frontend Ceiling Model Refactor — Changelog

## Summary

Replaced the symmetric zone model (MAF ±5) with the ceiling model across all 6 frontend files. MAF HR is now a hard ceiling — everything at or below is good, going over is the only failure state.

## Files Changed

### 1. `app/src/lib/mafAnalysis.ts` (foundation)

**Interface changes:**
- `MAFActivity` adds: `time_below_ceiling_pct`, `time_over_ceiling_pct`, `time_controlled_pct`, `time_easy_pct`, `time_recovery_pct`, `zone_minutes`, `longest_zone_streak_minutes`, `zone_entries`, `warmup_score`, `negative_split`, `pace_steadiness_score`
- Backward compat aliases kept: `time_in_maf_zone_pct = time_below_ceiling_pct`
- New exports: `MAFTiers`, `computeMAFTiers()`

**`analyzeActivity()` signature change:**
- Old: `(activity, streams, mafHr, mafZoneLow, mafZoneHigh, qualifyingTolerance, units, excluded)`
- New: `(activity, streams, mafHr, units, excluded)`

**Analysis logic:**
- Zone check `hr >= low && hr <= high` → `hr <= ceiling`
- Added: tier bucketing (single pass), below-ceiling minutes, ceiling streaks, warmup score, negative split, pace steadiness
- Qualifying: `≥20 min AND ≥60% below ceiling AND avg_hr ≤ ceiling` (no tolerance)
- `computeTrends()`: reads `time_below_ceiling_pct` instead of `time_in_maf_zone_pct`
- `computeSummary()`: `zoneDiscipline` computed from `time_below_ceiling_pct`

### 2. `app/src/components/Dashboard.tsx` (orchestrator)

- **Removed vars:** `mafZoneLow`, `mafZoneHigh`, `qualifyingTolerance`, `qualifyingHigh`
- **`analyzeActivity()` call:** 8 args → 5 args `(activity, streams, mafHr, units, excluded)`
- **Header:** `{age} YRs = {mafHr} BPM ±5` → `MAF Ceiling: {mafHr} bpm ({age} yrs)`
- **Child props:** Removed `mafZoneLow`, `mafZoneHigh`, `qualifyingHigh` from SummaryCards, TrendChart, RunAdvisor
- **Run list:** HR coloring `above/below ceiling` instead of zone band; column header "Zone" → "Below"; reads `time_below_ceiling_pct`
- **`toggleExclude()`:** qualifying check uses `time_below_ceiling_pct >= 60 && avg_hr <= mafHr`

### 3. `app/src/components/TrendChart.tsx` (chart)

- **Props:** Removed `mafZoneLow`, `mafZoneHigh`, `qualifyingHigh`
- **Zone bands removed:** No more green band (low→high) or yellow band (high→qualifying)
- **Ceiling line:** Red dashed line at `mafHr` labeled "Ceiling {X}"
- **Tier shading:** Controlled tier = light green, Easy tier = light blue, Over ceiling = light red
- **Tier boundaries:** Subtle dashed lines at controlled_low and easy_low
- **Default overlays:** HR + Pace on by default (was all off)
- **Tooltip:** "Zone: X% in target" → "Below ceiling: X%"; HR colored red/green based on above/below ceiling
- **Legend:** Updated to show Ceiling, Controlled range, Easy range

### 4. `app/src/components/SummaryCards.tsx`

- **Props:** Removed `mafZoneLow`, `mafZoneHigh`
- **"Time in Zone" card:** Title → "Below Ceiling"; subtitle `In {low}–{high}` → `≤ {mafHr} bpm`
- **HR deviation:** "above/below target" → "above/below ceiling"; green if below ceiling (not band-centered)

### 5. `app/src/components/RunAdvisor.tsx`

- **Props:** Removed `mafZoneLow`, `mafZoneHigh`
- **All advice text:** "zone" → "ceiling"; e.g., "keep HR in 126–136 zone" → "keep HR under 131 bpm"
- **Zone discipline text:** "MAF zone" → "MAF ceiling"
- **`generateAdvice()` signature:** 6 params → 4 params

### 6. `app/src/components/SettingsModal.tsx`

- **Removed:** Qualifying tolerance slider and all tolerance state/logic
- **Save payload:** No longer sends `qualifying_tolerance`
- **MAF Preview:** "Zone: {low}–{high} · Qualifying: to {qual}" → Ceiling model showing tier breakdown (Controlled, Easy, Recovery ranges)
- **Settings interface:** Legacy zone fields typed but ignored

## Backward Compatibility

- `time_in_maf_zone_pct` and `time_in_qualifying_zone_pct` still exist as aliases pointing to `time_below_ceiling_pct`
- Settings interface still accepts legacy `maf_zone_low` / `maf_zone_high` / `qualifying_tolerance` from KV (just ignores them)
- localStorage cache (`maf_activities`) will be invalidated on next settings change, causing full re-analysis with ceiling model

## What to Test

1. `npm run dev` — verify no TypeScript errors
2. Load dashboard — summary cards should show "Below Ceiling" and "≤ X bpm"
3. Trend chart — red ceiling line, green/blue tier shading, no green zone band
4. Settings modal — no tolerance slider, shows tier breakdown
5. Run list — HR colored green (≤ ceiling) or red (> ceiling)
6. Sync activities — `analyzeActivity` processes with ceiling model
7. Toggle exclude — qualifying recalculates with ceiling logic
