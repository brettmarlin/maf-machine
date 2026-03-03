# Milestone Definitions

> Milestones are lifetime achievements that unlock as the runner accumulates volume, consistency, and fitness improvements. Each awards XP and a badge displayed on profile.

## Time Below Ceiling Milestones

| Milestone ID | Name | Trigger | XP |
|---|---|---|---|
| `zone_100` | Century Club | 100 total minutes below ceiling | 100 |
| `zone_500` | Five Hundred | 500 total minutes below ceiling | 250 |
| `zone_1000` | Thousand Strong | 1,000 total minutes below ceiling | 500 |
| `zone_2500` | Iron Aerobic | 2,500 total minutes below ceiling | 750 |
| `zone_5000` | Aerobic Machine | 5,000 total minutes below ceiling | 1,000 |
| `zone_10000` | MAF Legend | 10,000 total minutes below ceiling | 2,000 |

## Run Count Milestones

| Milestone ID | Name | Trigger | XP |
|---|---|---|---|
| `runs_10` | Getting Started | 10 qualifying runs | 100 |
| `runs_25` | Quarter Century | 25 qualifying runs | 250 |
| `runs_50` | Fifty Strong | 50 qualifying runs | 500 |
| `runs_100` | Centurion | 100 qualifying runs | 750 |
| `runs_250` | Dedicated | 250 qualifying runs | 1,000 |
| `runs_500` | Lifetime Runner | 500 qualifying runs | 2,000 |

## Streak Milestones

| Milestone ID | Name | Trigger | XP |
|---|---|---|---|
| `streak_4` | Month Strong | 4 consecutive weeks hitting target | 200 |
| `streak_8` | Two Month Warrior | 8 consecutive weeks | 400 |
| `streak_12` | Quarter Year | 12 consecutive weeks | 600 |
| `streak_26` | Half Year | 26 consecutive weeks | 1,000 |
| `streak_52` | Full Year | 52 consecutive weeks | 2,500 |

## Fitness Milestones

| Milestone ID | Name | Trigger | XP |
|---|---|---|---|
| `first_improvement` | Pace Progress | First MAF Test improvement vs previous test | 500 |
| `decoupling_5` | Aerobic Efficiency | Aerobic decoupling drops below 5% | 200 |
| `decoupling_3` | Elite Aerobic | Aerobic decoupling drops below 3% | 400 |
| `drift_5` | Steady Heart | Cardiac drift below 5% on a 45+ min run | 200 |
| `drift_3` | Iron Heart | Cardiac drift below 3% on a 45+ min run | 400 |

## Long Run Milestones

| Milestone ID | Name | Trigger | XP |
|---|---|---|---|
| `long_60` | Hour Power | First 60-min qualifying run | 200 |
| `long_90` | Ninety Minutes | First 90-min qualifying run | 300 |
| `long_120` | Two Hours | First 120-min qualifying run | 500 |

## Detection Logic

- Milestones are checked after every run in `gameState.ts`
- Each milestone can only be awarded once
- Milestone unlocks are included in the coaching context payload so the coach can celebrate them
- The `milestones` array in GameState stores IDs of unlocked milestones
