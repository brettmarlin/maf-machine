# MAF Machine — Game Mechanics v2

## Design Philosophy

The game never says "XP." The runner sees **levels**, **badges**, and **what to do next**. That's it. Everything else is internal math. The system reveals itself one step at a time — you only see the next thing you can achieve, not the whole tree. As you get closer to a milestone, it fades into view.

The metaphor: **you're building a fire.** Early on, you're gathering kindling and getting a spark going. It's fragile. It needs constant tending. But if you keep showing up, it catches — and eventually it's a bonfire that sustains itself. Every level name, every badge, every message reinforces this: you're building something real, and it takes patience.

---

## Levels

Levels replace all "XP" language in the UI. The runner sees "Level 4 · Steady Flame" — never "3,500 XP." Internally, runs still earn points that drive level progression, but the number is hidden behind a progress bar labeled with the next level name.

| Level | Internal Points | Name | What It Means |
|-------|----------------|------|---------------|
| 1 | 0 | **Spark** | You showed up. That's the hardest part. |
| 2 | 300 | **Go-Getter** | You came back. Most people don't. |
| 3 | 1,000 | **Commitment Maker** | You've decided this matters. |
| 4 | 2,500 | **Steady Flame** | The habit is forming. Your body is adapting. |
| 5 | 5,000 | **Foundation Builder** | Your aerobic base is taking shape. |
| 6 | 9,000 | **Heartwise** | You're learning to listen to your body. |
| 7 | 15,000 | **Endurance Rising** | The engine is getting stronger. You can feel it. |
| 8 | 25,000 | **Lion Heart** | You stayed the course when it was hard. |
| 9 | 40,000 | **Heart Beast** | Your aerobic machine is a force. |
| 10 | 65,000 | **Distance King** | You built the fire. Now it burns on its own. |

### Progression feel

- **Levels 1–3** come fast (first 2–3 weeks). The runner levels up multiple times before they have a chance to doubt the method.
- **Levels 4–6** come at a pace that matches real aerobic adaptation (weeks 4–12). Each level-up coincides roughly with when their body is actually changing.
- **Levels 7–10** are earned over months. These are aspirational — the runner sees "Lion Heart" in the distance and wants to get there. By the time they do, MAF has transformed their running.

### What the runner sees

```
┌──────────────────────────────────────┐
│  Level 4 · Steady Flame              │
│  ████████████░░░░░░░░  58%           │
│  → Foundation Builder                │
└──────────────────────────────────────┘
```

The arrow shows the next level name. No numbers. Just "you're 58% of the way to Foundation Builder." When they get within 10%, the messaging shifts: "Almost there — 2 more runs to Foundation Builder."

---

## Badges (Trophy Case)

Badges are visual, collectible, and permanent. They appear in a trophy case on the runner's profile. Each badge has a name, an icon, and a one-line description of what they did to earn it.

### First 6 Runs — Guaranteed Celebration

Every runner earns at least one badge per run for their first 6 interactions, even if the run was terrible by MAF standards. The system finds *something* to celebrate. The first badge fires on setup — before they even run.

| Badge | Trigger | Message |
|-------|---------|---------|
| ✅ **Committed** | Committed to Greatness (setup complete) | "You committed. That's the biggest step!" |
| 🔥 **First Spark** | Completed first run after setup | "You lit the fire. Everything starts here." |
| 👟 **Took the Initiative** | Completed run #2 | "You came back. That's what separates builders from dreamers." |
| 🎯 **Three for Three** | Completed run #3 | "Three runs. The habit is starting to form." |
| 💪 **Showing Up** | Completed run #4 | "Four runs in. Your body is already adapting — even if you can't feel it yet." |
| ⭐ **First Five** | Completed run #5 | "Five runs. You're not trying anymore — you're doing." |

These fire regardless of heart rate, pace, or zone compliance. Getting out the door is the achievement.

### Discipline Badges

These unlock as the runner demonstrates MAF-specific skills. They appear one at a time — the runner sees only the next achievable badge, not the full list.

| Badge | Trigger | Message |
|-------|---------|---------|
| 🎯 **Dialed In** | First run with ≥70% below ceiling | "You held the line. Your heart rate listened." |
| 🔒 **Zone Locked** | 20+ continuous minutes below ceiling | "20 minutes locked in. That's real aerobic work." |
| 🧘 **Patience Practice** | 3 runs with warmup score ≥ 80 | "Slow starts build fast finishes." |
| 📉 **Drift Buster** | Cardiac drift < 3% on a qualifying run | "Your heart barely had to work harder in the second half. That's fitness." |
| ⚡ **Negative Splitter** | Second half faster than first on a qualifying run | "You got faster without trying harder. The method is working." |
| 🏔️ **Long Haul** | First 60+ minute qualifying run | "An hour below ceiling. Your aerobic engine just leveled up." |
| 🦁 **Ultra Steady** | 45+ continuous minutes below ceiling | "45 minutes locked. Most runners never achieve this." |

### Consistency Badges

| Badge | Trigger | Message |
|-------|---------|---------|
| 📅 **Full Week** | Hit weekly target for the first time | "You set a goal and hit it. Week one: done." |
| 🔥 **Two-Week Fire** | 2 consecutive weeks hitting target | "Two weeks. The fire's catching." |
| 🔥🔥 **Month Strong** | 4 consecutive weeks | "A full month of consistency. Your body is rewriting itself." |
| 🔥🔥🔥 **Eight-Week Wall** | 8 consecutive weeks | "Most people quit by now. You didn't." |
| 💎 **The Commitment** | 12 consecutive weeks | "Three months. This isn't a phase — it's who you are." |
| 👑 **Half-Year Club** | 26 consecutive weeks | "Six months of discipline. You've built something most runners never will." |

### Volume Badges

Cumulative below-ceiling minutes. These are the long-game milestones that appear in the distance and slowly get closer.

| Badge | Trigger (cumulative below-ceiling minutes) | Message |
|-------|---------------------------------------------|---------|
| 🌱 **Seedling** | 100 minutes | "100 minutes of aerobic building. The roots are growing." |
| 🌿 **Taking Root** | 500 minutes | "500 minutes. The foundation is real." |
| 🌳 **Deep Roots** | 1,000 minutes | "1,000 minutes below ceiling. Your aerobic base is solid." |
| 🏔️ **Summit Seeker** | 2,500 minutes | "2,500 minutes. You're in rare territory." |
| 🌋 **Bonfire** | 5,000 minutes | "The fire you built? It's a bonfire now." |
| ☀️ **Eternal Flame** | 10,000 minutes | "10,000 minutes. You are the method." |

### MAF Test Badges

| Badge | Trigger | Message |
|-------|---------|---------|
| 📊 **First Benchmark** | Completed first MAF Test | "Your starting line is drawn. Now we watch the pace drop." |
| 📈 **Proof Positive** | MAF Test shows improvement vs. previous | "Faster at the same heart rate. This is the proof." |
| 🏆 **Triple Proof** | 3 consecutive improving MAF Tests | "Three tests, three improvements. The trend is undeniable." |
| 🎖️ **Year of Tests** | 12 MAF Tests over 12 months | "A full year of tracking. You have data most coaches would envy." |

---

## Streak System

### How it works

A streak counts **consecutive weeks** where the runner hits their weekly below-ceiling minutes target. Default target: 90 minutes/week (adjustable).

### What the runner sees

The streak is the #1 thing in the gamification display. It's always visible, always current. The first week of the first streak shows a progress bar of the week filling up with the required number of minutes and runs to encourage the runner in the No Streak Yet context.

**Active streak:**
```
🔥 6-week streak · Run by Sunday to keep it alive
   This week: 62 / 90 min · 2 runs · 28 min to go
```

**Streak at risk (target not yet met, ≤2 days left):**
```
⚠️ 6-week streak at risk!
   22 min to go · Run tomorrow to keep the fire alive
```

**Streak broken:**
```
Your 6-week streak ended. That's okay — you built something real.
Start a new one today. 🔥
```

**No streak yet:**
```
Hit your weekly target to start a streak.
This week: 34 / 90 min · 1 run · 56 min to go
```

### Streak multiplier

The multiplier is invisible — the runner doesn't see "1.25×". They just notice that their progress bar fills faster when they're on a streak. If asked, the coach can explain: "Your streak is accelerating your progress — consistency compounds."

| Consecutive Weeks | Internal Multiplier |
|---|---|
| 2 | 1.1× |
| 4 | 1.25× |
| 8 | 1.5× |
| 12 | 2.0× |
| 16+ | 2.5× |

### Streak freeze

Miss a week but ran at least once? Streak pauses (no bonus) but doesn't reset. Miss entirely? Streak resets. The coach says: "You ran this week but didn't hit your target. Your streak is on pause — hit it next week to pick back up."

---

## The Next Step Engine

This is the core logic. At any moment, the runner sees **one thing** — the single most important next action. The system picks from this priority stack:

### Priority 1: Streak protection
If a streak is active and the weekly target hasn't been met:
> "28 minutes to go this week. One more run keeps your 6-week streak alive."

### Priority 2: Next badge within reach
If a badge is ≤1-2 runs from unlocking:
> "One more run with warmup score ≥ 80 earns Patience Practice 🧘"

### Priority 3: Level progress
If they're within 10% of the next level:
> "Two more runs to Foundation Builder. You're almost there."

### Priority 4: Weekly target progress
If no streak/badge is imminent:
> "34 / 90 minutes this week. Two solid runs wraps it up."

### Priority 5: General encouragement
If nothing is imminent (rare — means they just leveled up or earned a badge):
> "Great week. Keep the momentum — your next run adds to a strong foundation."

The coach incorporates this "next step" naturally into every post-run assessment. It's also shown as a persistent card in the UI.

---

## Rules of the Game — User-Facing Page

This is a dedicated page in the app (accessible from a "How it works" link). It's visual, warm, and explains the system without jargon.

---

### 🔥 How MAF Machine Works

**You're building a fire.**

MAF training is about building your aerobic engine — slowly, patiently, one run at a time. MAF Machine tracks your progress, celebrates your consistency, and shows you the improvements your body can't feel yet.

Here's how it works:

---

**Levels**

Every run below your MAF ceiling earns progress toward your next level. The more time you spend below your ceiling, the faster you advance.

🔥 Spark → 👟 Go-Getter → 🤝 Commitment Maker → 🕯️ Steady Flame → 🏗️ Foundation Builder → 💚 Heartwise → 📈 Endurance Rising → 🦁 Lion Heart → 🐺 Heart Beast → 👑 Distance King

Early levels come quickly — because showing up IS the achievement. Later levels take longer, matching the real timeline of aerobic adaptation. By the time you reach Lion Heart, you'll feel the difference in every run.

---

**Badges**

Badges mark specific achievements — your first run, your first 20-minute zone lock, your first improving MAF Test. They live in your trophy case permanently.

You don't see all the badges upfront. They reveal themselves as you get close to earning them. Some are easy (just show up). Some take months of consistent work. All of them mean you did something real.

---

**Streaks**

A streak counts consecutive weeks where you hit your below-ceiling minutes target. Your default target is 90 minutes per week — about 3 easy runs.

Streaks are the heartbeat of the game. They reward the thing that actually builds aerobic fitness: consistency over time. A long streak means your fire is burning strong.

Miss your target but still ran? Your streak pauses — it doesn't break. Miss a week entirely? It resets. But every streak you build makes you stronger than the last.

---

**Your Next Step**

MAF Machine always shows you one thing: the most important next step. It might be "run tomorrow to protect your streak" or "one more run to earn Patience Practice." You never have to wonder what to do — just follow the prompt.

---

**The MAF Test**

The MAF Test is the gold standard. Run 3–5 miles at your MAF ceiling heart rate on a flat course, and record your per-mile pace. Repeat every 4 weeks. Over months, your pace at the same heart rate gets faster — and that's the proof that the method is working.

Tag any run as a MAF Test and MAF Machine will track your splits, compare to your last test, and celebrate your progress.

---

**Why it feels slow**

MAF training feels like losing for the first few months. You're running slower than you want. Your ego is screaming. But underneath, your aerobic system is rebuilding itself — capillary density, fat oxidation, cardiac efficiency. These changes are invisible day to day.

MAF Machine makes the invisible visible. We show you the cardiac drift improving, the efficiency climbing, the pace trend bending downward. Every run is adding a log to the fire. Trust the process.

---

## Internal: Point Values (Hidden from User)

These drive the level progress bar but are never shown as numbers.

### Per-Run Points

| Component | Calculation | Max |
|---|---|---|
| Below-ceiling minutes | 1 point per minute | ~90 |
| Continuous lock bonus | 10+ min = 10, 20+ = 25, 30+ = 50, 45+ = 75 | 75 |
| Warm-up bonus | Score ≥ 80 = 15 | 15 |
| Low drift bonus | < 3% = 20, < 5% = 10 | 20 |
| Negative split | Yes = 15 | 15 |
| Pace steadiness | Score ≥ 80 = 10 | 10 |
| Duration bonus | 45+ min = 10, 60+ = 20, 90+ = 35 | 35 |

**Removed from v1 spec:** Cadence bonus. Cadence is tracked but not rewarded — it penalized walk/run intervals, which are valid MAF behavior.

**Typical qualifying run: 50–120 points. Exceptional run: 150–200+.**

### Weekly Bonus Points

| Trigger | Points |
|---|---|
| Hit weekly target | 100 |
| Exceed target by 50% | 50 bonus |
| 3+ qualifying runs | 25 bonus |

### Surprise Bonuses (Variable Reward)

The system checks for personal records and unexpected achievements after each run. These are NOT listed anywhere — they appear as surprises.

| Trigger | Points | Coach message |
|---|---|---|
| New longest continuous below-ceiling streak | 50 | "New record! You held below ceiling for X minutes straight." |
| Best cardiac drift ever | 30 | "Your lowest cardiac drift yet — X%. Your engine is getting efficient." |
| Best warmup score ever | 20 | "Perfect warm-up — your best start yet." |
| First run of the week (when no runs in 5+ days) | 25 | "Welcome back. The fire was waiting." |
| Ran in rain | 30 | "You ran in the rain. That's commitment." |
| Ran in excessive heat (>85°F) | 30 | "You ran in X°F heat. That's grit." |
| Ran in cold (<35°F) | 30 | "You ran in X°F cold. The fire burns inside." |
| Ran before 6 AM | 20 | "Out before dawn. The early miles are the best miles." |

These surprise bonuses are the variable reward mechanism. The runner doesn't know they're coming. They just see a celebration pop up and bonus progress on their level bar.

Weather bonuses use OpenWeatherMap API (free tier: 1000 calls/day). Activity lat/lng from Strava. Early bird detection from Strava's `start_date_local` field — no API needed.

---

## Implementation Notes

### What to build first

1. **Level system** — progress bar, level names, internal point tracking
2. **First 6 runs celebration** — guaranteed badges regardless of performance (including "Committed" on setup)
3. **Streak display** — top of gamification stack, "next step" messaging
4. **Next Step Engine** — priority logic that picks the one thing to show
5. **Badge trophy case** — visual display of earned badges
6. **Surprise bonuses** — personal record detection + celebration
7. **Weather bonuses** — OpenWeatherMap integration for rain/heat/cold + early bird from Strava timestamps
8. **Rules of the Game page** — static content, linked from game UI
9. **Discipline + consistency badges** — unlock as runner progresses
10. **Volume badges** — long-game milestones that fade into view
11. **MAF Test badges** — tied to test feature

### What's deferred

- Leaderboards (v2.1)
- Badge sharing / social features
- Custom badge icons (use emoji for now)
