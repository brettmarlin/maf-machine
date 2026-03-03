# Streak Rules

> Streaks reward the most important behavior in MAF training: showing up consistently week after week. The streak system is deliberately forgiving to avoid punishing injury or life events.

## How Streaks Work

A streak counts **consecutive weeks where the runner hits their weekly time-below-ceiling target** (default: 90 minutes, user-adjustable).

### Weekly Evaluation

Evaluated at the end of each ISO week (Monday → Sunday):

| Outcome | Streak Effect |
|---|---|
| Hit weekly target | Streak increments by 1 |
| Missed target but ran at least 1 qualifying run | Streak **freezes** (no increment, no reset) |
| Zero qualifying runs | Streak **resets** to 0 |

### Streak Freeze Rationale

- Runners get injured, get sick, go on vacation
- A single deload week shouldn't destroy months of consistency
- The freeze means they don't earn the weekly bonus, but keep their streak multiplier
- Only a complete zero-run week breaks the streak — that signals true disengagement

## Multiplier Tiers

| Consecutive Weeks | Multiplier on Weekly XP |
|---|---|
| 1 week | 1.0× (no bonus) |
| 2 weeks | 1.1× |
| 4 weeks | 1.25× |
| 8 weeks | 1.5× |
| 12 weeks | 2.0× |
| 16+ weeks | 2.5× |

The multiplier applies to the **weekly goal XP** (the 100 XP for hitting target + any weekly bonuses), not to per-run XP.

## State Tracking

```typescript
interface StreakState {
  current_weeks: number;          // consecutive weeks hitting target
  longest_ever: number;           // personal record streak
  multiplier: number;             // current multiplier (from table above)
  last_qualified_week: string;    // ISO week string, e.g., "2025-W07"
  frozen_last_week: boolean;      // true if last week was a freeze (ran but missed target)
}
```

## Weekly History

Each completed week is stored in the `weekly_history` array of GameState:

```typescript
interface WeeklyRecord {
  week: string;                   // ISO week, e.g., "2025-W07"
  zone_minutes: number;           // total minutes below ceiling
  runs: number;                   // total runs
  qualifying_runs: number;        // runs that earned XP
  target_met: boolean;            // hit the weekly target
  xp_earned: number;              // total XP this week (runs + weekly + streak bonus)
  pure_maf: boolean;              // all runs had avg HR ≤ ceiling + 5
}
```

## Edge Cases

- **User changes weekly target mid-week**: New target applies starting next week
- **Activity deleted**: Recalculate weekly totals, potentially un-meet target
- **Backfill of historical runs**: Streaks are computed retroactively from training start date
- **First week**: No streak bonus, but hitting target starts the streak at 1
