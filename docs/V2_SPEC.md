# MAF Machine v2 â€” Pro Spec

## Vision

MAF training is a 3â€“6 month patience game. Most runners quit within 4â€“8 weeks because progress is invisible day-to-day and running slow feels humiliating. MAF Machine v2 solves this by making the invisible visible: an AI coach that understands your history, celebrates micro-progress, and gamifies the discipline that the method demands.

The LLM coach is the primary UX. Data cards and charts support the narrative â€” they don't lead it.

---

## Architecture Overview

```
Strava Webhook â†’ Worker receives event
  â†’ Fetch activity + streams from Strava API
  â†’ Run analysis engine (zone time, drift, decoupling, cadence, EF, warm-up quality)
  â†’ Compute XP, check milestone unlocks, update streak
  â†’ Build LLM context payload (this run + history + milestones + streak state)
  â†’ Call Claude API â†’ generate coaching assessment
  â†’ Cache everything in KV (analysis, XP, milestones, coaching text)
  â†’ User opens app â†’ instant personalized coaching + gamification state
```

### Why Server-Side LLM

- Webhook-triggered: coaching is ready before the user opens the app
- Context assembly requires full history â€” too large for client
- XP/milestone integrity: can't trust client for leaderboard fairness
- Caching: one LLM call per activity, served instantly to frontend

### Tech Stack Additions

- **Claude API** (claude-sonnet-4-5-20250929): coaching assessments via Anthropic API
- **KV namespaces**: existing MAF_ACTIVITIES + new MAF_GAME (XP, milestones, streaks, coaching cache)
- **Branch**: `pro` branch off `main` (v1 stays stable on main)

---

## Analysis Engine Enhancements

The existing `mafAnalysis.ts` already computes per-run:
- `time_in_maf_zone_pct` â€” % of run in MAF zone
- `cardiac_drift` â€” HR creep first half vs second half
- `aerobic_decoupling` â€” pace:HR ratio drift
- `cadence_in_zone` â€” average cadence while in MAF zone
- `efficiency_factor` â€” meters/min per bpm
- `qualifying` â€” boolean (â‰¥20 min, â‰¥60% in zone)

### New Metrics to Add

**1. Zone Minutes (absolute)**
```
zone_minutes = count of seconds where HR in [maf_low, maf_high] / 60
```
This is the core currency of the game. Not percentage â€” raw minutes.

**2. Continuous Zone Streaks (within a run)**
```
Scan HR stream for consecutive seconds in zone.
Record longest_continuous_zone_minutes.
Record zone_entries (number of times HR re-entered zone after leaving).
Fewer entries + longer streaks = better discipline.
```

**3. Warm-Up Quality Score (0â€“100)**
From the MAF tips: "Spend the first 10â€“15 minutes warming up gradually, keeping HR â‰¥10 bpm below MAF max."
```
First 10 minutes of HR stream:
- warmup_score = % of first 600 seconds where HR â‰¤ (maf_hr - 10)
- Penalize if HR spikes above maf_high in first 5 minutes
```

**4. Negative Split Detection**
```
Compare avg pace in second half vs first half.
negative_split = true if second half is â‰¥2% faster
```

**5. Pace Steadiness (coefficient of variation)**
```
CV of velocity_smooth within MAF zone segments.
Lower CV = more even pacing = better discipline.
pace_steadiness_score = max(0, 100 - (CV * 500))
```

**6. Weekly Aggregates**
```
Per ISO week:
- total_zone_minutes
- total_runs
- qualifying_runs
- avg_zone_pct
- weekly_goal_met (boolean, based on user's target)
```

**7. Pure MAF Week**
```
All runs in the week had avg HR â‰¤ maf_high + 5.
No anaerobic sessions detected (from tip #2: put speedwork on hold).
```

---

## Gamification System

### Three Tiers of Reward

#### Tier 1 â€” Per-Run Rewards

Each qualifying run earns XP based on:

| Component | Calculation | Max XP |
|---|---|---|
| **Zone Minutes** | 1 XP per minute in MAF zone | ~60â€“90 |
| **Zone Lock Bonus** | Longest continuous zone streak: 10+ min = 10 XP, 20+ = 25 XP, 30+ = 50 XP, 45+ = 75 XP | 75 |
| **Warm-Up Bonus** | warmup_score â‰¥ 80 = 15 XP | 15 |
| **Cadence Bonus** | Avg cadence 168â€“172 = 10 XP, 173â€“178 = 15 XP | 15 |
| **Low Drift Bonus** | Cardiac drift < 3% = 20 XP, < 5% = 10 XP | 20 |
| **Negative Split** | Second half faster = 15 XP | 15 |
| **Pace Steadiness** | steadiness_score â‰¥ 80 = 10 XP | 10 |
| **Duration Bonus** | 45+ min = 10 XP, 60+ = 20 XP, 90+ = 35 XP | 35 |

**Typical qualifying run: 60â€“120 XP. Exceptional run: 150â€“200+ XP.**

Non-qualifying runs (too much time above zone, too short) earn 0 XP. This is intentional â€” the game rewards MAF discipline, not just running.

#### Tier 2 â€” Weekly Goals

User sets a weekly zone-minutes target (default: 90 min/week, adjustable).

| Achievement | XP |
|---|---|
| Hit weekly target | 100 XP |
| Exceed target by 50% | 50 bonus XP |
| Pure MAF Week (no anaerobic runs) | 50 bonus XP |
| 3+ qualifying runs this week | 25 bonus XP |

Weekly goals reset every Monday. Displayed as a progress bar.

#### Tier 3 â€” Streaks

Consecutive weeks hitting your weekly zone-minutes target.

| Streak | Multiplier on weekly XP |
|---|---|
| 2 weeks | 1.1Ã— |
| 4 weeks | 1.25Ã— |
| 8 weeks | 1.5Ã— |
| 12 weeks | 2.0Ã— |
| 16+ weeks | 2.5Ã— |

**Streak freeze**: Miss a week but ran at least once? Streak pauses (no bonus) but doesn't reset. Miss entirely? Streak resets. This prevents injury-shaming while rewarding true consistency.

### Onboarding Quests

New users get a quest chain that frontloads early wins:

| Quest | Trigger | Reward |
|---|---|---|
| **First Steps** | Configure MAF settings (age, modifier) | 50 XP + ðŸƒ badge |
| **First MAF Run** | Complete 1 qualifying run | 200 XP + ðŸŽ¯ badge |
| **Finding Your Pace** | Complete a run with >70% zone time | 100 XP |
| **MAF Five** | 5 qualifying runs within 10 days | 500 XP + â­ badge |
| **First Full Week** | Hit weekly zone-minutes target | 150 XP + ðŸ“… badge |
| **Warm-Up Pro** | 3 runs with warmup_score â‰¥ 80 | 100 XP + ðŸ”¥ badge |
| **Zone Locked** | 20+ continuous minutes in zone | 150 XP + ðŸ”’ badge |

Quests appear one at a time. Completing one reveals the next. The first ~2 weeks are guided.

### Milestones (Ongoing)

Lifetime achievements that unlock as you accumulate:

**Zone Minutes Milestones**: 100, 500, 1000, 2500, 5000, 10000 total zone minutes
**Run Count Milestones**: 10, 25, 50, 100, 250, 500 qualifying runs
**Streak Milestones**: 4, 8, 12, 26, 52 consecutive weeks
**Pace Progress**: First MAF Test improvement (pace faster at same HR vs 4 weeks ago)
**Efficiency**: First time decoupling drops below 5%, below 3%
**Long Run**: First 60-min qualifying run, first 90-min, first 120-min

Each milestone awards XP and a badge. Badges displayed on profile.

### Levels

| Level | XP Required | Name |
|---|---|---|
| 1 | 0 | Beginner |
| 2 | 500 | Walker |
| 3 | 1,500 | Jogger |
| 4 | 3,500 | Runner |
| 5 | 7,000 | Aerobic Base |
| 6 | 12,000 | Zone Master |
| 7 | 20,000 | Fat Burner |
| 8 | 32,000 | MAF Disciple |
| 9 | 50,000 | Endurance Engine |
| 10 | 75,000 | MAF Legend |

At ~100 XP per run, 3 runs/week + weekly bonuses: roughly 400â€“500 XP/week. Level 5 at ~14 weeks (when MAF starts really paying off). Level 10 is a multi-year commitment.

---

## LLM Coach

### Role

The coach replaces the template-based RunAdvisor with a context-aware AI that:
1. **Assesses each run** in the context of the runner's full history
2. **Celebrates progress** that the runner can't see (micro-improvements)
3. **Diagnoses problems** with specific, actionable advice rooted in MAF methodology
4. **Contextualizes data** â€” translates numbers into meaning
5. **Maintains voice** â€” encouraging but honest, never patronizing

### When It Fires

- **Post-run** (webhook): Analyze run â†’ generate coaching â†’ cache in KV
- **Weekly summary** (cron or on-demand): Recap the week, preview next week's goal
- **Milestone unlocks**: Celebrate with context about what it means

### Context Payload (sent to Claude API)

```json
{
  "runner": {
    "age": 50,
    "maf_hr": 130,
    "maf_zone": [125, 135],
    "units": "mi",
    "weekly_target_zone_minutes": 90,
    "training_start_date": "2024-11-01",
    "weeks_in_training": 14
  },
  "this_run": {
    "date": "2025-02-18",
    "name": "Tuesday Easy Run",
    "duration_minutes": 42,
    "distance_miles": 4.1,
    "avg_hr": 131,
    "zone_minutes": 34.2,
    "zone_pct": 81.4,
    "longest_zone_streak_minutes": 18.5,
    "zone_entries": 4,
    "warmup_score": 72,
    "cardiac_drift_pct": 3.8,
    "aerobic_decoupling_pct": 2.1,
    "avg_cadence": 168,
    "pace_at_maf": "11:42/mi",
    "negative_split": false,
    "pace_steadiness_score": 74,
    "elevation_gain_ft": 180,
    "xp_earned": 112,
    "xp_breakdown": {
      "zone_minutes": 34,
      "zone_lock": 10,
      "warmup": 0,
      "cadence": 10,
      "low_drift": 10,
      "negative_split": 0,
      "pace_steadiness": 0,
      "duration": 0,
      "weekly_bonus": 0,
      "streak_multiplier": 1.25
    },
    "milestones_unlocked": [],
    "quest_completed": null
  },
  "recent_history": {
    "last_5_runs": [
      {
        "date": "2025-02-15",
        "zone_minutes": 28.1,
        "zone_pct": 74.2,
        "pace_at_maf": "11:55/mi",
        "cardiac_drift_pct": 5.2,
        "warmup_score": 65,
        "xp_earned": 87
      }
      // ... 4 more
    ],
    "this_week": {
      "zone_minutes": 62.3,
      "target": 90,
      "runs": 2,
      "qualifying_runs": 2,
      "days_remaining": 5
    },
    "streak": {
      "current_weeks": 6,
      "multiplier": 1.25,
      "longest_ever": 8
    }
  },
  "trends": {
    "pace_at_maf_4wk_avg": "11:48/mi",
    "pace_at_maf_8wk_avg": "12:15/mi",
    "pace_improvement_pct": 3.7,
    "hr_trend": "improving",
    "ef_trend": "improving",
    "avg_zone_discipline_4wk": 78.3,
    "avg_cardiac_drift_4wk": 4.1,
    "total_zone_minutes_lifetime": 1842,
    "total_qualifying_runs": 47,
    "total_xp": 8420,
    "level": 5,
    "level_name": "Aerobic Base",
    "xp_to_next_level": 4580
  }
}
```

### System Prompt

```
You are the MAF Coach inside MAF Machine, a running app built on Dr. Phil Maffetone's
Maximum Aerobic Function method.

Your job: analyze this runner's latest run in the context of their training history, then
give them a coaching assessment that is specific, honest, and encouraging.

METHODOLOGY RULES (never contradict these):
- The 180-Formula sets the target HR. It is not negotiable.
- If hills, heat, or fatigue spike HR: slow down or walk. Do not adjust the target.
- First 10-15 minutes should be a gradual warm-up, HR at least 10 bpm below MAF max.
- Put speedwork on hold until base is built (3-6 months of steady improvement).
- Cardiac drift < 5% indicates good aerobic fitness. < 3% is excellent.
- Aerobic decoupling < 5% means the aerobic system is handling the load well.
- Cadence target: 170+ spm. Higher cadence = lighter steps = less injury risk.
- Consistency beats intensity. 3-4 runs per week in zone trumps 1 hard run.
- Progress is measured in pace at the same HR over months, not days.
- Nutrition, sleep, and stress directly affect aerobic performance.
- Patience is the hardest part. Reframe slow as "building" not "failing."

VOICE:
- Talk like a knowledgeable running coach who genuinely cares.
- Be specific â€” reference actual numbers from this run.
- Celebrate micro-progress that the runner might miss.
- Be honest about problems but always pair with actionable advice.
- Never patronize. Never use toxic positivity. Never lecture.
- Keep it conversational. 3-4 short paragraphs max.
- Reference their streak, XP, or upcoming milestone when motivating.

STRUCTURE your response as JSON:
{
  "headline": "Short punchy title (5-8 words)",
  "assessment": "2-4 paragraphs of coaching. Reference specific numbers. Compare to recent runs. Highlight what improved, what to work on, and what's next.",
  "highlight": "One specific thing they did well this run (1 sentence)",
  "focus_next_run": "One specific thing to focus on next run (1 sentence)",
  "xp_note": "Brief note contextualizing their XP/level/streak (1 sentence, optional)"
}
```

### Example Output

```json
{
  "headline": "Your Zone Lock Is Getting Stronger",
  "assessment": "34 minutes in zone today â€” that's 6 more than Saturday's run, and your longest continuous stretch hit 18.5 minutes. That's real progress. Your body is learning to hold that 125-135 bpm range without fighting it.\n\nCardiac drift came in at 3.8%, down from 5.2% on your last run. That tells me your aerobic engine is handling the load better â€” your heart isn't having to work harder in the second half to maintain the same effort. That's exactly what we want to see at week 14.\n\nOne thing to work on: your warm-up scored 72. You're getting into zone a bit too quickly â€” your first 10 minutes should feel almost embarrassingly easy, keeping HR under 120. A slower start sets up better zone stability for the rest of the run.\n\nYou're 28 minutes away from your weekly target with 5 days left. One more solid run wraps the week and keeps your 6-week streak alive.",
  "highlight": "18.5 minutes of continuous zone time â€” your longest unbroken MAF stretch yet.",
  "focus_next_run": "Slow your first mile to a walk/jog â€” aim for a warm-up score above 80.",
  "xp_note": "112 XP today puts you at 8,420 total â€” 580 XP from Level 6: Zone Master."
}
```

### Weekly Summary (generated Sunday night or Monday morning)

Same Claude API call, different prompt section:

```
Generate a weekly training summary. Cover:
- Total zone minutes vs target
- Streak status
- Best run of the week and why
- Comparison to same metrics from the prior week
- What to focus on this coming week
- Any milestone they're approaching

Keep it warm, specific, and forward-looking. 3-4 paragraphs.
```

---

## Data Model (KV Storage)

### Game State

Key: `{athleteId}:game`

```json
{
  "xp_total": 8420,
  "level": 5,
  "streak_current_weeks": 6,
  "streak_longest": 8,
  "streak_last_qualified_week": "2025-W07",
  "weekly_target_zone_minutes": 90,
  "quests_completed": ["first_steps", "first_maf_run", "finding_pace", "maf_five", "first_full_week"],
  "quest_active": "warmup_pro",
  "quest_progress": { "warmup_pro": 1 },
  "milestones": ["zone_100", "zone_500", "zone_1000", "runs_10", "runs_25", "streak_4"],
  "badges": ["ðŸƒ", "ðŸŽ¯", "â­", "ðŸ“…", "ðŸ”’"],
  "weekly_history": [
    {
      "week": "2025-W07",
      "zone_minutes": 98.4,
      "runs": 3,
      "qualifying_runs": 3,
      "target_met": true,
      "xp_earned": 487,
      "pure_maf": true
    }
  ]
}
```

### Per-Run Analysis (Enhanced)

Key: `{athleteId}:analysis:{activityId}`

The existing `MAFActivity` fields plus:
```json
{
  "zone_minutes": 34.2,
  "longest_zone_streak_minutes": 18.5,
  "zone_entries": 4,
  "warmup_score": 72,
  "negative_split": false,
  "pace_steadiness_score": 74,
  "xp_earned": 112,
  "xp_breakdown": { ... },
  "milestones_unlocked": [],
  "quest_completed": null
}
```

### Coaching Cache

Key: `{athleteId}:coaching:{activityId}`

```json
{
  "headline": "...",
  "assessment": "...",
  "highlight": "...",
  "focus_next_run": "...",
  "xp_note": "...",
  "generated_at": "2025-02-18T19:30:00Z"
}
```

Key: `{athleteId}:coaching:weekly:{week}`

```json
{
  "summary": "...",
  "generated_at": "2025-02-17T08:00:00Z"
}
```

---

## Frontend UX

### Primary View: Coach Card (Hero)

When user opens the app, the first thing they see is the coach's assessment of their latest run. Not a chart. Not numbers. A coach talking to them.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ðŸƒ Level 5 Â· Aerobic Base     8,420 XP        â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘ 63% to Level 6            â”‚
â”‚                                                  â”‚
â”‚  ðŸ”¥ 6-week streak Â· 1.25Ã— multiplier            â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                  â”‚
â”‚  "Your Zone Lock Is Getting Stronger"            â”‚
â”‚                                                  â”‚
â”‚  34 minutes in zone today â€” that's 6 more than   â”‚
â”‚  Saturday's run, and your longest continuous      â”‚
â”‚  stretch hit 18.5 minutes...                     â”‚
â”‚                                                  â”‚
â”‚  âœ… 18.5 min continuous zone â€” longest yet       â”‚
â”‚  ðŸŽ¯ Next run: slow warm-up, aim for 80+ score   â”‚
â”‚                                                  â”‚
â”‚  +112 XP Â· 580 from Zone Master                  â”‚
â”‚                                                  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  This Week: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘ 62/90 zone min    â”‚
â”‚  2 runs Â· 5 days left Â· streak alive             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Secondary: Data Dashboard (Below Coach)

The existing v1 dashboard stays â€” summary cards with sparklines, trend chart, run list. But it's secondary to the coach. The coach *contextualizes* the data so users don't have to interpret charts alone.

### Run Detail View

Tap a run in the list â†’ modal showing:
- XP breakdown (animated bars showing each component)
- Coach assessment for that run
- Zone timeline visualization (HR over time with zone band highlighted)
- Milestones/quests completed on this run
- "View on Strava" link

### Quests Panel

Side panel or tab showing:
- Active quest with progress bar
- Completed quests with badges
- Upcoming quests (locked, shows requirements)

### Weekly Summary View

Accessible from the weekly progress bar. Shows:
- Coach's weekly summary
- Day-by-day zone minutes bar chart
- Comparison to prior week
- Streak history visualization

---

## API Endpoints (New)

### GET /api/game

Returns full game state for the authenticated user.

```json
{
  "xp_total": 8420,
  "level": 5,
  "level_name": "Aerobic Base",
  "xp_to_next_level": 4580,
  "streak": { "current": 6, "longest": 8, "multiplier": 1.25 },
  "weekly": { "zone_minutes": 62.3, "target": 90, "runs": 2, "days_left": 5 },
  "quest_active": { "id": "warmup_pro", "name": "Warm-Up Pro", "progress": 1, "target": 3 },
  "recent_milestones": [...],
  "badges": [...]
}
```

### GET /api/coaching/latest

Returns the coaching assessment for the most recent run.

```json
{
  "activity_id": 12345,
  "headline": "...",
  "assessment": "...",
  "highlight": "...",
  "focus_next_run": "...",
  "xp_note": "...",
  "xp_earned": 112,
  "xp_breakdown": { ... }
}
```

### GET /api/coaching/weekly

Returns the most recent weekly summary.

### GET /api/coaching/{activityId}

Returns coaching for a specific run.

### PUT /api/game/settings

Update weekly target zone minutes.

```json
{ "weekly_target_zone_minutes": 120 }
```

### POST /api/coaching/chat

Send a message to the conversational coach. Returns streamed response.

```json
Request: { "message": "Why was my drift so high today?" }
Response (streamed): { "response": "Your cardiac drift of 3.8% was actually..." }
```

### POST /api/maf-test/{activityId}

Tag a run as a MAF Test. Server extracts per-mile splits from streams.

```json
Response: {
  "activity_id": 12345,
  "splits": [...],
  "avg_pace": "11:48",
  "previous_test": { "date": "2025-01-18", "avg_pace": "12:15" },
  "improvement_pct": 3.8
}
```

### DELETE /api/maf-test/{activityId}

Remove MAF Test tag from a run.

### GET /api/maf-tests

Returns full MAF Test history for the authenticated user.

### PUT /api/settings (enhanced)

Add `training_start_date` field. When set, triggers historical backfill.

```json
{ "age": 50, "modifier": 0, "units": "mi", "training_start_date": "2024-11-01" }
```

---

## Webhook Enhancement

The existing POST /api/webhook handler expands:

```
1. Receive Strava event (activity create/update)
2. Fetch activity + streams
3. Run enhanced analysis (existing + new metrics)
4. Load game state from KV
5. Calculate XP for this run
6. Check quest progress
7. Check milestone unlocks
8. Update streak state
9. Build LLM context payload
10. Call Claude API â†’ get coaching assessment
11. Save: analysis, game state, coaching cache
12. User opens app â†’ everything is pre-computed and instant
```

For activity delete: remove analysis, recalculate XP (subtract), revert any milestones/quests if they were the triggering run.

---

## Development Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create `pro` branch
- [ ] Add MAF_GAME KV namespace
- [ ] Enhance analysis engine (zone minutes, streaks, warm-up score, pace steadiness, negative splits)
- [ ] Move analysis engine to worker (server-side, shared between webhook and API)
- [ ] Build XP calculation engine
- [ ] Build quest/milestone detection engine
- [ ] Build streak tracking logic
- [ ] Wire into webhook handler
- [ ] GET /api/game endpoint

### Phase 2: LLM Coach (Week 2-3)
- [ ] Claude API integration in worker (ANTHROPIC_API_KEY secret)
- [ ] Build context payload assembler
- [ ] System prompt + structured JSON output
- [ ] Post-run coaching generation (webhook-triggered)
- [ ] Weekly summary generation (manual trigger first, cron later)
- [ ] GET /api/coaching/* endpoints
- [ ] Coaching cache in KV

### Phase 3: Conversational Coach (Week 3-4)
- [ ] POST /api/coaching/chat endpoint
- [ ] Conversation storage in KV (per-athlete, last 10 messages)
- [ ] Context assembly: conversation history + latest run + game state + recent trends
- [ ] Streaming response from Claude API to frontend
- [ ] Conversation reset on new run arrival
- [ ] Rate limiting (20 messages/day)
- [ ] Motivation mode when no recent runs (7+ days)

### Phase 4: MAF Test Feature (Week 4)
- [ ] Per-mile split extraction from distance/time/HR streams
- [ ] MAF Test data model and KV storage
- [ ] Tag/untag run as MAF Test (API + UI)
- [ ] Test history chart (pace over time)
- [ ] Test comparison view (side-by-side splits)
- [ ] MAF Test-specific coaching prompt
- [ ] MAF Test XP awards and badges

### Phase 5: Frontend â€” Coach-First UI (Week 4-5)
- [ ] Coach card component (hero position)
- [ ] Level/XP bar component
- [ ] Streak display component
- [ ] Weekly progress bar component
- [ ] Chat UI component (collapsible, below coach card)
- [ ] Streaming message display
- [ ] Run detail modal with XP breakdown
- [ ] MAF Test detail view
- [ ] Quest panel
- [ ] Integrate with existing dashboard (coach above, data below)

### Phase 6: Onboarding & Historical Backfill (Week 5-6)
- [ ] Training start date picker in onboarding/settings
- [ ] Backfill engine: fetch all runs from start date, analyze, compute retroactive XP
- [ ] Progress bar during backfill ("Analyzing 47 runs...")
- [ ] Quest chain activation for new users
- [ ] Handle edge cases: no HR data, very old runs, deleted activities
- [ ] First-run coaching generation after backfill completes

### Phase 7: Polish & Edge Cases (Week 6-7)
- [ ] Handle missing streams gracefully
- [ ] Handle runs with no HR monitor
- [ ] Streak freeze logic
- [ ] Weekly summary cron trigger
- [ ] Rate limiting on Claude API calls
- [ ] Error states and loading states
- [ ] Graceful degradation if Claude API is down (show data without coaching)

### Phase 8: Payments (Week 7-8)
- [ ] Stripe integration
- [ ] Feature gating (v1 free dashboard, v2 pro = coach + gamification)
- [ ] Trial period (30 days)
- [ ] Subscription management UI

---

## Cost Model

**Claude API (Sonnet):**
- Post-run coaching: ~2,000 input + ~500 output tokens = ~$0.013 per call
- Conversational follow-ups: ~1,500 input + ~300 output per message pair
- Assume 3 runs/week + 3 chat messages per run session + 1 weekly summary
- Post-run: 3 Ã— $0.013 = $0.039/week
- Chat: 9 Ã— $0.006 = $0.054/week
- Weekly summary: $0.013/week
- **Total: ~$0.42/month/user** â€” strong margin at $4.99/month

**Cloudflare Workers:**
- Free tier covers 100K requests/day
- KV: free tier covers 100K reads/day, 1K writes/day
- Well within limits for initial launch

---

## Decisions

1. **Leaderboards**: Deferred to v2.1.
2. **MAF Test Tracking**: Dedicated feature â€” see MAF Test section below.
3. **Notifications**: Coach assessments wait in the app. No email/push for now.
4. **Historical Backfill**: Onboarding lets users pick their MAF training start date. All runs from that date forward get analyzed and earn retroactive XP. Runs before that date are ignored. This respects that many users were already training MAF before discovering the app.
5. **Conversational Coach**: Yes â€” see Conversational Coach section below.

---

## MAF Test Feature

### What Is a MAF Test

The MAF Test is the gold standard for measuring aerobic progress. The runner picks a flat, repeatable route (ideally a track), warms up, then runs 3â€“5 miles holding HR as close to their MAF max as possible. They record mile splits. Over months, the splits should get faster at the same heart rate.

### Tagging a Run as a MAF Test

Users can tag any completed run as a MAF Test from the run detail view. This is post-hoc (after the run uploads from Strava), not pre-declared. The tag is stored in the game state.

When tagged:
- The system extracts per-mile (or per-km) splits from the distance/time/HR streams
- Each split shows: pace, avg HR, and deviation from MAF target
- Results are stored and compared against previous MAF Tests

### MAF Test Data Model

Key: `{athleteId}:maf_tests`

```json
{
  "tests": [
    {
      "activity_id": 12345,
      "date": "2025-02-18",
      "splits": [
        { "mile": 1, "pace": "11:32", "avg_hr": 129, "pace_seconds": 692 },
        { "mile": 2, "pace": "11:48", "avg_hr": 131, "pace_seconds": 708 },
        { "mile": 3, "pace": "12:05", "avg_hr": 132, "pace_seconds": 725 }
      ],
      "avg_pace": "11:48",
      "avg_hr": 131,
      "distance_miles": 3.1,
      "conditions_note": "Warm, 75Â°F, slight wind"
    }
  ]
}
```

### MAF Test UI

**Test History Chart**: Line chart showing average MAF Test pace over time. This is the single most meaningful chart in the app â€” it shows whether the method is working.

**Test Detail**: Side-by-side split comparison between any two tests. Shows pace improvement per mile at the same HR.

**Test Overlay on Coach**: When a user tags a MAF Test, the coach generates a test-specific assessment comparing it to the last test, noting split patterns (positive or negative drift across miles), and projecting progress.

### MAF Test XP

| Achievement | XP |
|---|---|
| Complete a MAF Test | 50 XP |
| Test shows improvement vs last test | 200 XP + ðŸ“ˆ badge (first time) |
| 3 consecutive tests with improvement | 300 XP + ðŸ† badge |
| Complete 12 monthly tests (1 year) | 500 XP + ðŸŽ–ï¸ badge |

### MAF Test Coaching Prompt Addition

When the coach receives a MAF Test run, the system prompt includes:

```
This run has been tagged as a MAF Test. This is the most important measurement in MAF
training â€” it shows whether the runner is getting faster at the same heart rate over time.

Analyze the mile splits for:
- Consistency: Are splits even, or does pace decay significantly by mile 3+?
- HR discipline: Did they hold close to MAF max, or drift above?
- Comparison to last test: Faster? Slower? By how much per mile?
- Context: Weather, fatigue, time since last test, overall training load

If this is their first test, explain what to expect going forward and when they should
retest (4 weeks). If pace improved, celebrate it â€” this is concrete proof the method works.
If pace regressed, diagnose likely causes (overtraining, stress, illness, poor sleep,
nutrition) without alarm.
```

---

## Conversational Coach

### Overview

After reading the post-run assessment, users can ask follow-up questions. This turns the coach from a monologue into a dialogue â€” dramatically increasing engagement and the educational value of the app.

Examples of what users will ask:
- "Why was my cardiac drift higher today?"
- "Should I run tomorrow or take a rest day?"
- "Is it normal to be this slow after 6 weeks?"
- "What should I eat before a long MAF run?"
- "My HR spiked on the hill at mile 2 â€” should I walk all hills?"
- "When can I start doing speedwork again?"
- "I'm feeling discouraged. Is this working?"

### Architecture

```
User sends message in chat UI
  â†’ Frontend sends to POST /api/coaching/chat
  â†’ Worker loads:
      - Conversation history (last 10 messages, from KV)
      - Latest run analysis
      - Game state (XP, streak, quests)
      - Recent training summary (last 4 weeks)
      - MAF Test history (if any)
  â†’ Builds messages array with system prompt + context + conversation
  â†’ Calls Claude API (streaming)
  â†’ Returns streamed response to frontend
  â†’ Saves updated conversation history to KV
```

### Conversation Storage

Key: `{athleteId}:chat`

```json
{
  "messages": [
    { "role": "user", "content": "Why was my drift so high today?", "timestamp": "..." },
    { "role": "assistant", "content": "Your cardiac drift of 5.8% was...", "timestamp": "..." }
  ],
  "last_activity_id": 12345,
  "updated_at": "2025-02-18T20:00:00Z"
}
```

Conversation resets context when a new run arrives (new assessment becomes the anchor). Old conversations are not deleted â€” they just stop being loaded into context. This keeps token usage bounded.

### Chat System Prompt

The same base system prompt as post-run coaching, plus:

```
You are now in a conversation with the runner. They've read your assessment and have
follow-up questions.

RULES:
- Stay grounded in their actual data. Don't speculate beyond what the numbers show.
- For nutrition, sleep, and stress questions: give MAF-methodology-aligned advice but
  note you're an AI coach, not a doctor.
- If they ask about injuries or pain: do not diagnose. Recommend they see a professional.
  You can discuss how to modify training around recovery.
- If they express frustration about being slow: this is the #1 coaching moment. Reframe
  it. Reference their actual progress. Point to specific numbers improving. Remind them
  that every elite MAF runner went through this phase.
- Keep responses concise â€” 1-3 paragraphs. This is a chat, not an essay.
- You can reference their XP, level, streak, and upcoming milestones to motivate.
- If asked something outside running/MAF (politics, coding, etc.): gently redirect.
  "I'm your MAF coach â€” I'm best at helping with your aerobic training. What's on your
  mind about your running?"
```

### Chat UI

Positioned below the coach assessment card. Collapsed by default with a prompt like "Ask your coach anything..."

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ðŸ’¬ Ask your coach                               â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                  â”‚
â”‚  You: Why was my drift higher today than         â”‚
â”‚  Saturday?                                       â”‚
â”‚                                                  â”‚
â”‚  Coach: Your cardiac drift of 3.8% was actually  â”‚
â”‚  an improvement over Saturday's 5.2%. But I      â”‚
â”‚  notice you started faster today â€” your first    â”‚
â”‚  mile was 11:15 vs 11:45 on Saturday. Starting   â”‚
â”‚  even 30 seconds per mile faster can push your   â”‚
â”‚  early HR higher, which leaves less headroom...  â”‚
â”‚                                                  â”‚
â”‚  [Type a message...]                      [Send] â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Cost Impact

- Conversational messages: ~1,500 input tokens (context) + ~300 per message pair
- Assume average 3 follow-up messages per run session
- Additional ~$0.015 per session â†’ ~$0.06/week/user
- **Revised total: ~$0.38/month/user** â€” still strong margin at $4.99/month

### Rate Limiting

- 20 chat messages per day per user (prevents abuse, plenty for real coaching)
- Conversation history loaded: last 10 messages only (keeps context bounded)
- If user hasn't run in 7+ days, chat context shifts to "motivation mode" with lighter context payload

### POST /api/coaching/chat

```
Request:
{
  "message": "Why was my drift so high today?"
}

Response (streamed):
{
  "response": "Your cardiac drift of 3.8% was actually..."
}
```

---

## Success Metrics

- **Retention**: % of users still running MAF after 8 weeks (target: 60%, vs ~30% without gamification)
- **Engagement**: App opens per week (target: 4+, driven by coach check-ins)
- **Streak Length**: Average streak length (target: 6+ weeks)
- **Conversion**: Free â†’ Pro (target: 15% within first month)
- **MAF Progress**: % of users showing pace improvement at 12 weeks (the real measure of the product working)
