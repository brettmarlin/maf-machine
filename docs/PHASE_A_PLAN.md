# Phase A: MAF Ceiling Model Refactor

## The Problem

The current code treats MAF HR as the **center** of a symmetric zone (MAF ± 5). This is wrong. MAF HR is a **ceiling** — a maximum you should not exceed. Everything below it is good, with tiers of quality.

### Current Model (Wrong)

```
maf_hr = 131
maf_zone_low = 126   (maf_hr - 5)
maf_zone_high = 136  (maf_hr + 5)   ← lets runner go 5 over ceiling!
qualifying_tolerance = 10            ← even more headroom above
```

The chart draws a green band from 126–136 with 131 as the midline. This tells the runner that 135 bpm is "in zone" when it's actually **over** their aerobic ceiling.

### New Model (Correct)

```
maf_hr = 131 (ceiling — do not cross)

Tiers below ceiling:
  Controlled:  125–130  (ceiling-6 to ceiling-1)  — quality aerobic work
  Easy:        118–124  (ceiling-13 to ceiling-7)  — easy aerobic development
  Recovery:    below 118 (below ceiling-13)         — recovery / brisk walking

Over ceiling:
  131+ = over  — not aerobic training, defeats the purpose
```

---

## What Changes

### Step 1: Update `UserSettings` Interface

**File**: `worker/src/lib/mafAnalysis.ts`

Replace zone fields with ceiling model:

```typescript
export interface UserSettings {
  age: number;
  modifier: number;
  units: 'km' | 'mi';
  maf_hr: number;            // 180 - age + modifier = ceiling
  // REMOVE: maf_zone_low, maf_zone_high, qualifying_tolerance
  // ADD: derived tier boundaries (computed from maf_hr)
  start_date: string | null;
}
```

Add a helper to compute tier boundaries:

```typescript
export interface MAFTiers {
  ceiling: number;              // maf_hr (e.g., 131)
  controlled_low: number;       // ceiling - 6 (e.g., 125)
  controlled_high: number;      // ceiling - 1 (e.g., 130)
  easy_low: number;             // ceiling - 13 (e.g., 118)
  easy_high: number;            // ceiling - 7 (e.g., 124)
  recovery_below: number;       // ceiling - 13 (e.g., 118)
}

export function computeMAFTiers(maf_hr: number): MAFTiers {
  return {
    ceiling: maf_hr,
    controlled_low: maf_hr - 6,
    controlled_high: maf_hr - 1,
    easy_low: maf_hr - 13,
    easy_high: maf_hr - 7,
    recovery_below: maf_hr - 13,
  };
}
```

### Step 2: Update `MAFActivity` Interface

Replace symmetric zone metrics with ceiling-based metrics:

```typescript
export interface MAFActivity {
  // Identity — no change
  id: number;
  date: string;
  name: string;
  duration_seconds: number;
  distance_meters: number;
  elevation_gain: number;

  // Core HR metrics
  avg_hr: number;
  avg_cadence: number;
  avg_pace: number;
  efficiency_factor: number;

  // Ceiling compliance (replaces zone %)
  time_below_ceiling_pct: number;     // % of run at or below ceiling (the main number)
  time_over_ceiling_pct: number;      // % of run above ceiling (the bad number)
  time_controlled_pct: number;        // % in controlled tier (125–130)
  time_easy_pct: number;              // % in easy tier (118–124)
  time_recovery_pct: number;          // % in recovery tier (<118)

  // Pace metrics
  maf_pace: number;                   // avg pace while below ceiling
  cardiac_drift: number | null;
  aerobic_decoupling: number | null;
  cadence_in_zone: number | null;     // cadence while below ceiling
  negative_split: boolean;
  pace_steadiness_score: number;      // CV of velocity while below ceiling

  // Discipline metrics
  zone_minutes: number;               // minutes below ceiling (renamed from zone concept)
  longest_zone_streak_minutes: number; // longest continuous stretch below ceiling
  zone_entries: number;               // times HR dropped back below ceiling after spiking
  warmup_score: number;

  // Status
  qualifying: boolean;
  excluded: boolean;

  // KEEP for backward compat during transition (frontend still reads these)
  time_in_maf_zone_pct: number;       // alias → time_below_ceiling_pct
  time_in_qualifying_zone_pct: number; // alias → time_below_ceiling_pct
}
```

### Step 3: Update Compute Functions

**`computeZoneMinutes`** → `computeBelowCeilingMinutes`
- Count seconds where `hr[i] <= ceiling` (not a band, just under the cap)

**`computeZoneStreaks`** → `computeCeilingStreaks`
- Streak = consecutive seconds where `hr[i] <= ceiling`
- Entry = HR drops back below ceiling after being over

**`computeWarmupScore`**
- Mostly the same — keep "HR ≤ ceiling - 10" target for first 10 min
- Remove `mafZoneHigh` reference; early spike = above ceiling in first 5 min

**`computePaceSteadiness`**
- Velocity samples while `hr[i] <= ceiling` (not in a band)

**Tier percentages** (new):
- Loop through HR stream once, bucket each second into controlled/easy/recovery/over
- Return all four percentages

**`qualifying` logic**:
- Old: ≥20 min AND ≥60% in qualifying zone (zone + tolerance)
- New: ≥20 min AND ≥60% below ceiling AND avg_hr ≤ ceiling
- Simpler. No tolerance needed — ceiling is ceiling.

### Step 4: Update `analyzeActivity` Main Function

- Accept `UserSettings` (which no longer has zone_low/zone_high)
- Compute tiers from `maf_hr`
- Replace all zone_low/zone_high references with ceiling
- Compute tier percentages in a single pass
- Set backward-compat aliases (`time_in_maf_zone_pct = time_below_ceiling_pct`)
- `maf_pace` = avg pace when HR ≤ ceiling (not when in a band)

### Step 5: Update Downstream Modules

These modules import `MAFActivity` and `UserSettings`:

**`xpEngine.ts`** — Review XP component calculations:
- "Zone Minutes" XP → now based on `zone_minutes` (below ceiling)
- "Zone Lock Bonus" → based on `longest_zone_streak_minutes` (below ceiling)
- Should still work since the field names don't change, just what they measure
- Verify no references to `maf_zone_low`/`maf_zone_high`

**`questEngine.ts`** — Review quest triggers:
- "Finding Your Pace" quest: >70% zone time → >70% below ceiling
- "Zone Locked" quest: 20+ continuous minutes in zone → below ceiling
- Should work if field names stay the same

**`streakEngine.ts`** — Review weekly aggregates:
- `zone_minutes` still exists, just measured differently
- Likely no changes needed

**`gameState.ts`** — No direct analysis references, should be clean

**`coachingPayload.ts`** — Update context payload:
- Add `time_below_ceiling_pct`, tier breakdowns to payload
- Update labels in the context sent to Claude
- Coach should reference "time below ceiling" not "time in zone"

**`coachingEngine.ts`** — Update system prompt:
- Remove "zone" language
- Add ceiling model explanation
- Coach should never say "below zone" as negative
- Tiers inform coaching tone: controlled = good work, easy = building, recovery = fine

### Step 6: Update KV Settings Schema

Current settings stored in KV include `maf_zone_low`, `maf_zone_high`, `qualifying_tolerance`. The settings PUT endpoint and frontend settings modal both need updating.

**Worker `PUT /api/settings`**:
- Accept `age`, `modifier`, `units`, `start_date`
- Compute and store `maf_hr` only (no zone fields)
- Or keep zone fields for backward compat but ignore them in analysis

**Frontend `SettingsModal.tsx`**:
- Remove zone display or update to show "MAF Ceiling: 131"
- Show tier breakdown as informational

---

## Backward Compatibility Strategy

The frontend currently reads `time_in_maf_zone_pct` from the client-side analysis. During the transition:

1. Keep `time_in_maf_zone_pct` as an alias for `time_below_ceiling_pct` in MAFActivity
2. Keep `time_in_qualifying_zone_pct` as same alias
3. Frontend can read the old field names until we update the dashboard components
4. No breaking change to the v1 dashboard while we build v2 UI on top

---

## Execution Order

```
1. Add MAFTiers interface + computeMAFTiers() helper
2. Add tier compute functions (single-pass HR bucketing)
3. Update computeZoneMinutes → below-ceiling model
4. Update computeZoneStreaks → below-ceiling model
5. Update computeWarmupScore → remove zoneHigh param
6. Update computePaceSteadiness → below-ceiling model
7. Update analyzeActivity() main function
8. Set backward-compat aliases
9. Compile check: npx tsc --noEmit
10. Update xpEngine.ts if needed → compile check
11. Update questEngine.ts if needed → compile check
12. Update coachingPayload.ts → compile check
13. Update coachingEngine.ts system prompt
14. Test: trigger webhook locally, verify analysis output
15. Test: verify /api/game still works
16. Test: verify /api/coaching/latest generates correct coaching
17. Commit
```

Each step compiles before the next. No forward references.

---

## What This Does NOT Cover (Phase B/C)

- Frontend chart fixes (green band → red ceiling line + tier shading)
- Dashboard card updates (HR card, cadence → efficiency, tooltips)
- Training start date persistence and friction
- These depend on Phase A being done first
