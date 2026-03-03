# Quest Definitions

> Quests are the onboarding system — they frontload early wins during the hardest first 2 weeks of MAF training. Quests appear one at a time. Completing one reveals the next.

## Quest Chain

| # | Quest ID | Name | Trigger | Reward | Badge |
|---|---|---|---|---|---|
| 1 | `first_steps` | First Steps | Configure MAF settings (age, modifier) | 50 XP | 🏃 |
| 2 | `first_maf_run` | First MAF Run | Complete 1 qualifying run | 200 XP | 🎯 |
| 3 | `finding_pace` | Finding Your Pace | Complete a run with >70% time below ceiling | 100 XP | — |
| 4 | `maf_five` | MAF Five | 5 qualifying runs within 10 days | 500 XP | ⭐ |
| 5 | `first_full_week` | First Full Week | Hit weekly target (default 90 min below ceiling) | 150 XP | 📅 |
| 6 | `warmup_pro` | Warm-Up Pro | 3 runs with warmup_score ≥ 80 | 100 XP | 🔥 |
| 7 | `zone_locked` | Zone Locked | 20+ continuous minutes below ceiling in a single run | 150 XP | 🔒 |

## Quest Logic

- Only one quest active at a time
- Progress is tracked in `quest_progress` field of GameState
- `maf_five` has a time window: 5 qualifying runs must occur within 10 calendar days
- `warmup_pro` is cumulative: 3 runs total (not necessarily consecutive)
- Quest completion triggers are checked in `questEngine.ts` after each run analysis

## Design Notes

- The first ~2 weeks of MAF training are the hardest psychologically
- Quests provide immediate tangible progress when pace improvements are invisible
- 50 XP for just configuring settings = instant gratification on signup
- 200 XP for first qualifying run = big reward for showing up
- MAF Five at 500 XP is the hook — by 5 runs, habit formation is starting
