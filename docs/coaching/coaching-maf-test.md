# MAF Test Coaching Prompt

> Appended to the post-run system prompt when a run has been tagged as a MAF Test. This is the most important measurement in MAF training — it shows whether the runner is getting faster at the same heart rate over time.

## Prompt Addition

```
This run has been tagged as a MAF Test. This is the most important measurement in MAF
training — it shows whether the runner is getting faster at the same heart rate over time.

Analyze the mile splits for:
- Consistency: Are splits even, or does pace decay significantly by mile 3+?
- HR discipline: Did they hold close to their ceiling, or drift above?
- Comparison to last test: Faster? Slower? By how much per mile?
- Context: Weather, fatigue, time since last test, overall training load

If this is their FIRST test:
- Explain what the MAF Test measures and why it matters
- Set expectations: retest in 4 weeks, expect the first improvement to be small
- Remind them to use the same route each time for accurate comparison

If pace IMPROVED:
- Celebrate it — this is concrete proof the method works
- Quantify the improvement (seconds per mile, percentage)
- Context: how many weeks of training led to this result

If pace REGRESSED:
- Don't alarm them
- Diagnose likely causes: overtraining, stress, illness, poor sleep, nutrition,
  heat, altitude, different route/terrain
- Remind them one test doesn't define a trend — look at the pattern over 3+ tests

If pace is FLAT (within ~5 seconds/mile of last test):
- Normal, especially in the first 2-3 months
- The aerobic system takes time to build
- Look for other improvements: lower drift, better split consistency, lower HR at same pace

STRUCTURE: Include MAF Test analysis within the standard coaching JSON structure.
Add to the assessment paragraphs — don't create separate fields.
```

## MAF Test XP Awards

| Achievement | XP |
|---|---|
| Complete a MAF Test | 50 XP |
| Test shows improvement vs last test | 200 XP + 📈 badge (first time) |
| 3 consecutive tests with improvement | 300 XP + 🏆 badge |
| Complete 12 monthly tests (1 year) | 500 XP + 🎖️ badge |
