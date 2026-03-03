# XP Calculation Rules

> Defines how XP is earned per run, per week, and via streak multipliers. These values are consumed by `xpEngine.ts`. Changing values here should be reflected in the engine.

## Per-Run XP Components

Only **qualifying runs** earn XP. A qualifying run requires:
- Duration ≥ 20 minutes
- Time below ceiling ≥ 60%
- Average HR ≤ ceiling

| Component | Calculation | Max XP |
|---|---|---|
| **Time Below Ceiling** | 1 XP per minute below ceiling | ~60–90 |
| **Zone Lock Bonus** | Longest continuous streak below ceiling: 10+ min = 10 XP, 20+ = 25 XP, 30+ = 50 XP, 45+ = 75 XP | 75 |
| **Warm-Up Bonus** | warmup_score ≥ 80 = 15 XP | 15 |
| **Cadence Bonus** | Avg cadence 168–172 = 10 XP, 173–178 = 15 XP | 15 |
| **Low Drift Bonus** | Cardiac drift < 3% = 20 XP, < 5% = 10 XP | 20 |
| **Negative Split** | Second half faster by ≥2% = 15 XP | 15 |
| **Pace Steadiness** | steadiness_score ≥ 80 = 10 XP | 10 |
| **Duration Bonus** | 45+ min = 10 XP, 60+ = 20 XP, 90+ = 35 XP | 35 |

**Typical qualifying run: 60–120 XP. Exceptional run: 150–200+ XP.**

Non-qualifying runs earn 0 XP. This is intentional — the game rewards MAF discipline, not just running.

## Weekly Goal XP

User sets a weekly time-below-ceiling target (default: 90 min/week, adjustable).

| Achievement | XP |
|---|---|
| Hit weekly target | 100 XP |
| Exceed target by 50% | 50 bonus XP |
| Pure MAF Week (no runs with avg HR above ceiling + 5) | 50 bonus XP |
| 3+ qualifying runs this week | 25 bonus XP |

Weekly goals reset every Monday (ISO week).

## Streak Multipliers

Consecutive weeks hitting the weekly target:

| Streak | Multiplier on weekly XP |
|---|---|
| 2 weeks | 1.1× |
| 4 weeks | 1.25× |
| 8 weeks | 1.5× |
| 12 weeks | 2.0× |
| 16+ weeks | 2.5× |

### Streak Freeze
- Miss a week but ran at least once → streak **pauses** (no bonus) but doesn't reset
- Miss entirely (0 runs) → streak **resets** to 0
- This prevents injury-shaming while rewarding true consistency
