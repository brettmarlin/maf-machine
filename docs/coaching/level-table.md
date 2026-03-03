# Level Table

> Levels provide long-term progression. At ~100 XP per run, 3 runs/week + weekly bonuses: roughly 400–500 XP/week. Level 5 arrives around week 14 (when MAF starts really paying off). Level 10 is a multi-year commitment.

## Levels

| Level | XP Required | Name | Approx. Timeline |
|---|---|---|---|
| 1 | 0 | Beginner | Day 1 |
| 2 | 500 | Walker | ~Week 1-2 |
| 3 | 1,500 | Jogger | ~Week 3-4 |
| 4 | 3,500 | Runner | ~Week 7-8 |
| 5 | 7,000 | Aerobic Base | ~Week 14 |
| 6 | 12,000 | Zone Master | ~Week 24 |
| 7 | 20,000 | Fat Burner | ~Week 40 |
| 8 | 32,000 | MAF Disciple | ~Week 64 |
| 9 | 50,000 | Endurance Engine | ~Week 100 |
| 10 | 75,000 | MAF Legend | ~Week 150+ |

## Design Notes

- Level 5 ("Aerobic Base") intentionally aligns with the 3-month mark where MAF training starts showing real pace improvements — the name reinforces the message
- Level names progress from identity ("Walker") to achievement ("MAF Legend")
- The XP curve is exponential — early levels come fast for motivation, later levels require sustained commitment
- Level is displayed prominently in the Game Card and header

## Helper Functions

```typescript
function getLevelFromXP(xp: number): number
function getLevelName(level: number): string
function getXPToNextLevel(xp: number): number
function getXPProgressPercent(xp: number): number  // 0-100 within current level
```
