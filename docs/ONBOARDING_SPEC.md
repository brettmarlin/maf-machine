# MAF Machine — Onboarding Experience

## The Promise

MAF training is simple: run below your heart rate ceiling. The hard part isn't the method — it's sticking with it long enough to see results. MAF Machine removes every obstacle between you and consistent MAF training. Connect Strava. Set your age. Follow the prompts. That's it.

The onboarding exists to prove this promise in under 60 seconds.

---

## Design Principles

1. **Zero friction to value.** The runner should feel momentum from the first tap. No walls of text, no tutorials, no "learn how the app works" screens. The app teaches itself through the Next Step Engine.

2. **The onboarding IS the game.** The Committed badge fires during setup. Backfill surprises them with progress they already earned. The first run triggers a celebration. Three dopamine hits before they've broken a sweat.

3. **No-brainer positioning.** The messaging isn't "here's a complex training system." It's "this is the easiest way to do MAF training right." Connect Strava. Follow the prompts. Get faster.

4. **Confidence through simplicity.** Every screen has one job. One question. One action. The runner never wonders "what am I supposed to do here?"

---

## Screen 1: Landing (Pre-Auth)

**When**: User visits maf.marliin.com for the first time, not authenticated.

**Layout**: Full-screen, dark background, centered content. No nav, no header, no footer.

**Content**:

```
🔥

The easiest way to do MAF training right.

Connect your Strava. Follow the prompts.
Watch your aerobic engine build itself.

[ Connect with Strava ]

Already connected? Log in →
```

**Details**:
- The fire emoji is large, animated (subtle pulse or glow)
- Headline is the entire pitch: "The easiest way to do MAF training right."
- Subtext reinforces simplicity: connect, follow, watch
- Single CTA button: "Connect with Strava" (Strava orange, their brand guidelines)
- Small "Already connected? Log in" link below for returning users
- No feature list, no screenshots, no "how it works" section. Curiosity drives the click.
- Optional: one line of social proof if we have it later ("Trusted by X MAF runners")

**Mobile**: Same layout, works naturally because it's centered single-column.

---

## Screen 2: Strava OAuth

**When**: User clicks "Connect with Strava"

Standard Strava OAuth redirect. Nothing custom here — the user sees Strava's authorization page, approves, and is redirected back.

**On callback**:
- Extract `athlete.firstname`, `athlete.lastname` from the Strava response
- Store name in settings KV
- Create initial game state (Level 1 · Spark)
- Redirect to Screen 3

---

## Screen 3: Setup (30 Seconds)

**When**: Authenticated user with no settings saved yet (first time).

**Layout**: Clean card, centered. Still no full dashboard — just the setup flow.

**Content**:

```
Welcome, Brett. 👋

Let's set up your MAF ceiling. This takes 10 seconds.

AGE
[ 49 ]

MODIFIER
[ Standard (healthy, training consistently) ▾ ]

  ℹ️ Subtract 5 if recovering from illness or on medication.
     Subtract 10 if recovering from major illness or surgery.
     Add 5 if you've trained consistently for 2+ years injury-free.

UNITS
◉ Miles  ○ Kilometers

─────────────────────────────────

Your MAF ceiling: 131 bpm
Everything at or below this heart rate builds your aerobic engine.
Just run. Keep it under 131. That's the whole method.

[ Start Building 🔥 ]
```

**Details**:
- "Welcome, Brett" uses the name from Strava OAuth (Fix 6)
- Age input: number field, auto-focuses on load
- Modifier: dropdown with the 5 options (-10, -5, 0, +5). Default is Standard (0). Brief explainer text below — not a wall, just enough to choose correctly
- Units: simple radio toggle
- **Live MAF ceiling calculation**: updates as age/modifier change. "Your MAF ceiling: 131 bpm" is prominent, shown below the inputs
- The one-line explainer: "Just run. Keep it under 131. That's the whole method." This is the entire education. No links to articles, no Maffetone biography. Just the instruction.
- CTA: "Start Building 🔥" — fires the save, triggers Committed badge, advances to Screen 4
- No "Skip" option — these three fields are required and take 10 seconds

**On save**:
- PUT /api/settings with age, modifier, units, name
- Award ✅ **Committed** badge + 50 points
- Update game state

---

## Screen 4: Committed Badge Celebration

**When**: Immediately after settings save.

**Layout**: Full-screen overlay or modal. Brief. Joyful.

**Content**:

```
✅ Committed

You committed. That's the biggest step.

Level 1 · Spark
████░░░░░░░░░░░░░░░░  17%
→ Go-Getter

[ Continue ]
```

**Details**:
- Confetti animation (subtle, not obnoxious — a brief burst)
- Badge icon large and centered
- The message from the badge definition
- Show their level + progress bar — they're already 17% to Level 2 (50/300 points). The bar is NOT at zero. Endowed progress.
- Brief pause (1-2 seconds) before the Continue button appears — let the moment land
- Continue advances to Screen 5

---

## Screen 5: Training Start Date

**When**: After Committed badge celebration.

**Layout**: Same clean card style as Screen 3.

**Content**:

```
One more thing — when did you start MAF training?

If you've been doing MAF runs, we'll analyze your history
and you might already be a few levels in.

[ Date picker: _________ ]

◉ I'm just getting started (that's great — we'll track from today)

[ Let's Go ]
```

**Details**:
- Date picker defaults to empty
- "I'm just getting started" radio option sets start_date to today
- If they pick a past date: show a teaser — "We'll look at your runs since [date]. You might be surprised."
- This is optional in the sense that "just getting started" is a valid answer, but the screen always shows — it's one tap either way
- CTA: "Let's Go" — triggers backfill if applicable, or goes straight to dashboard

**On submit**:
- Store training_start_date in settings
- If start_date is in the past → trigger backfill (Screen 6)
- If start_date is today → skip to Screen 7 (Dashboard)

---

## Screen 6: Backfill (If Applicable)

**When**: User set a training start date in the past and has cached Strava activities.

**Layout**: Full-screen, centered.

**Content**:

```
🔥 Analyzing your history...

████████████░░░░░░░░  14 / 23 runs

Crunching the numbers on your aerobic training.
This'll just take a moment.
```

**Then, when complete**:

```
🎉 Look at that.

You've already logged 842 zone minutes across 23 runs.

Level 3 · Commitment Maker
████████████████░░░░  78%
→ Steady Flame

🔥 First Spark  👟 Took the Initiative  🎯 Three for Three
💪 Showing Up  ⭐ First Five  🎯 Dialed In  🌱 Seedling

You've already built a foundation. Let's keep the fire going.

[ See Your Dashboard ]
```

**Details**:
- Progress bar animates as runs are processed
- When complete, show the surprise: their level, earned badges, zone minutes total
- Badge icons displayed in a row — the ones they earned light up
- The message reframes their history: "You've already built a foundation." They didn't know they were playing, but they were winning.
- This is the biggest dopamine hit of onboarding. A runner who's been slogging through MAF training alone suddenly sees Level 3 with 7 badges. That's the moment they're hooked.
- CTA: "See Your Dashboard"

**Edge cases**:
- No runs with HR data → skip backfill, go to dashboard with "Your first MAF run will light the fire"
- Very few qualifying runs → still show what they earned, even if it's just Level 1 with First Spark
- Error during backfill → graceful fallback, go to dashboard, backfill can retry later

---

## Screen 7: Dashboard (First Load)

**When**: After onboarding flow completes (with or without backfill).

**Layout**: Full dashboard — this is the normal app from now on.

**First-load differences** (only on very first dashboard view):

### With backfill (has history):
- Game card shows their level, badges, streak status
- Next Step Engine shows the most relevant action: "Run by Sunday to start a 2-week streak" or "28 more zone minutes to hit your weekly target"
- Coach card shows the teaser/upsell (Fix 7 — coaching defaults to off)
- Everything feels alive — the dashboard is populated, there's history in the chart, runs in the list

### Without backfill (brand new):
- Game card shows Level 1 · Spark, Committed badge glowing
- Streak section shows the first-week progress bar at 0/90 min: "Hit your weekly target to start a streak"
- Next Step Engine: "Go for your first MAF run. Keep your heart rate under 131 bpm. Walk if you need to — that counts."
- The chart is empty but the ceiling line is drawn — "Your runs will appear here"
- Run list is empty: "Your first run will show up here after you sync with Strava"

### No tooltip tour. No walkthrough.
The Next Step Engine IS the onboarding from here. Every time they open the app, it tells them exactly what to do next. The Rules of the Game page is linked from the game card for the curious. The app teaches itself.

---

## Returning User Flow

**When**: Authenticated user with settings already saved.

- Skip all onboarding screens
- Go directly to dashboard
- If they haven't set a training start date yet, show a subtle prompt in the game card: "Set your training start date to unlock your history" (not blocking, not a modal)

---

## Summary of Dopamine Hits

| Moment | What Happens | Emotional Payload |
|--------|-------------|-------------------|
| Screen 3: Set age | MAF ceiling calculates live | "Oh, it's that simple?" |
| Screen 4: Badge | ✅ Committed + confetti + progress bar at 17% | "I already have progress!" |
| Screen 6: Backfill | Level reveal + badge cascade | "I was already winning!" |
| Screen 7: Dashboard | Next Step Engine tells them exactly what to do | "I know what to do next" |
| First run | 🔥 First Spark + level-up to Go-Getter + surprise bonuses | "This is actually fun" |

The entire flow is designed so the runner never asks "what do I do?" or "is this working?" The app answers both questions before they're asked.

---

## Implementation Notes

### New components needed:
- `LandingPage.tsx` — pre-auth screen
- `OnboardingSetup.tsx` — age/modifier/units form (Screen 3)
- `BadgeCelebration.tsx` — reusable badge unlock overlay (Screen 4, and for future badge unlocks)
- `TrainingStartDate.tsx` — date picker screen (Screen 5)
- `BackfillProgress.tsx` — progress bar + results reveal (Screen 6)

### Routing logic:
```
if (!authenticated) → LandingPage
if (authenticated && !settings.age) → OnboardingSetup
if (authenticated && settings.age && !settings.training_start_date) → TrainingStartDate
if (authenticated && settings.age && backfill_pending) → BackfillProgress
else → Dashboard
```

### What already exists:
- Strava OAuth flow (worker handles this)
- Settings save endpoint (PUT /api/settings)
- Game state initialization (createInitialGameState)
- Badge system (from Game Mechanics v2 implementation)
- Backfill engine (processNewRun can be called in a loop)

### What's new:
- Landing page component
- Onboarding flow components (3 screens)
- BadgeCelebration overlay (reusable for all future badge unlocks)
- Backfill trigger from frontend (POST /api/backfill)
- Routing logic to detect onboarding state
- Confetti animation (use a lightweight library like canvas-confetti)
