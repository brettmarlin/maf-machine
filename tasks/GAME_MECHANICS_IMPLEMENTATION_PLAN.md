# Game Mechanics v2 — Claude Code Implementation Plan

## Context

The game engine chain exists across both `app/src/lib/` and `worker/src/lib/`:
- `gameTypes.ts` — types, constants, level table, quest/milestone definitions
- `xpEngine.ts` — per-run point calculation
- `questEngine.ts` — quest progression + milestone detection
- `streakEngine.ts` — streak tracking + weekly goals
- `gameState.ts` — orchestrator, KV read/write

These were built against the **v1 game spec** (XP-visible, old level names like "Beginner", old quest chain "first_steps", old milestone badges). They need to be updated to match the **new Game Mechanics v2 spec** (this document).

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after every step**: `npx tsc --noEmit`

---

## Reference: New Game Mechanics v2 Spec

The full spec lives in Notion at:
https://www.notion.so/brettmarlin/Coaching-MDs-318f62ff383d80dc91dceb74cd1805dd

Key changes from v1:
- **No XP language** in UI — runner sees levels, badges, progress bars. Never numbers.
- **Level names** updated: Spark → Go-Getter → Commitment Maker → Steady Flame → Foundation Builder → Heartwise → Endurance Rising → Lion Heart → Heart Beast → Distance King
- **Level thresholds** adjusted: 0, 300, 1000, 2500, 5000, 9000, 15000, 25000, 40000, 65000
- **Cadence bonus removed** from per-run points (penalized walk/run intervals)
- **6 guaranteed badges** for first runs (including "Committed" on setup)
- **Quest chain replaced** with badge system — badges reveal one at a time
- **Badge categories**: First Runs (6), Discipline (7), Consistency (6), Volume (6), MAF Test (4)
- **Streak multiplier invisible** — runner doesn't see "1.25×"
- **Next Step Engine** — priority stack showing one action at a time
- **Surprise bonuses** — personal records trigger hidden bonus points + celebration
- **Weather bonuses** — rain, early morning, excessive heat (integrate OpenWeatherMap)

---

## Step 1: Update `gameTypes.ts` — Level Table & Constants

**Files**: `worker/src/lib/gameTypes.ts` AND `app/src/lib/gameTypes.ts`

### Level table
Replace the LEVELS array with:

```typescript
export const LEVELS: LevelInfo[] = [
  { level: 1,  xp_required: 0,      name: 'Spark' },
  { level: 2,  xp_required: 300,    name: 'Go-Getter' },
  { level: 3,  xp_required: 1_000,  name: 'Commitment Maker' },
  { level: 4,  xp_required: 2_500,  name: 'Steady Flame' },
  { level: 5,  xp_required: 5_000,  name: 'Foundation Builder' },
  { level: 6,  xp_required: 9_000,  name: 'Heartwise' },
  { level: 7,  xp_required: 15_000, name: 'Endurance Rising' },
  { level: 8,  xp_required: 25_000, name: 'Lion Heart' },
  { level: 9,  xp_required: 40_000, name: 'Heart Beast' },
  { level: 10, xp_required: 65_000, name: 'Distance King' },
]
```

### Replace QUESTS with BADGES

Remove the old QUESTS array. Replace with badge definitions organized by category:

```typescript
export type BadgeCategory = 'first_run' | 'discipline' | 'consistency' | 'volume' | 'maf_test'

export interface BadgeDefinition {
  id: string
  category: BadgeCategory
  name: string
  icon: string
  message: string
  trigger: string            // Human-readable trigger description
  points_reward: number      // Internal points (hidden from user)
}

export const BADGES: BadgeDefinition[] = [
  // First Run badges (guaranteed, one per run)
  { id: 'committed',        category: 'first_run', name: 'Committed',          icon: '✅', message: 'You committed. That\'s the biggest step!',                                    trigger: 'setup_complete',        points_reward: 50 },
  { id: 'first_spark',      category: 'first_run', name: 'First Spark',        icon: '🔥', message: 'You lit the fire. Everything starts here.',                                     trigger: 'run_1',                 points_reward: 200 },
  { id: 'took_initiative',  category: 'first_run', name: 'Took the Initiative', icon: '👟', message: 'You came back. That\'s what separates builders from dreamers.',                  trigger: 'run_2',                 points_reward: 100 },
  { id: 'three_for_three',  category: 'first_run', name: 'Three for Three',    icon: '🎯', message: 'Three runs. The habit is starting to form.',                                     trigger: 'run_3',                 points_reward: 100 },
  { id: 'showing_up',       category: 'first_run', name: 'Showing Up',         icon: '💪', message: 'Four runs in. Your body is already adapting — even if you can\'t feel it yet.',   trigger: 'run_4',                 points_reward: 100 },
  { id: 'first_five',       category: 'first_run', name: 'First Five',         icon: '⭐', message: 'Five runs. You\'re not trying anymore — you\'re doing.',                          trigger: 'run_5',                 points_reward: 100 },

  // Discipline badges
  { id: 'dialed_in',        category: 'discipline', name: 'Dialed In',         icon: '🎯', message: 'You held the line. Your heart rate listened.',                                   trigger: 'first_70pct_below_ceiling', points_reward: 100 },
  { id: 'zone_locked',      category: 'discipline', name: 'Zone Locked',       icon: '🔒', message: '20 minutes locked in. That\'s real aerobic work.',                                trigger: '20min_continuous',       points_reward: 150 },
  { id: 'patience_practice', category: 'discipline', name: 'Patience Practice', icon: '🧘', message: 'Slow starts build fast finishes.',                                              trigger: '3_warmup_80plus',        points_reward: 100 },
  { id: 'drift_buster',     category: 'discipline', name: 'Drift Buster',      icon: '📉', message: 'Your heart barely had to work harder in the second half. That\'s fitness.',       trigger: 'drift_under_3pct',       points_reward: 150 },
  { id: 'negative_splitter', category: 'discipline', name: 'Negative Splitter', icon: '⚡', message: 'You got faster without trying harder. The method is working.',                   trigger: 'negative_split_qualifying', points_reward: 100 },
  { id: 'long_haul',        category: 'discipline', name: 'Long Haul',         icon: '🏔️', message: 'An hour below ceiling. Your aerobic engine just leveled up.',                    trigger: '60min_qualifying',       points_reward: 150 },
  { id: 'ultra_steady',     category: 'discipline', name: 'Ultra Steady',      icon: '🦁', message: '45 minutes locked. Most runners never achieve this.',                             trigger: '45min_continuous',        points_reward: 200 },

  // Consistency badges
  { id: 'full_week',        category: 'consistency', name: 'Full Week',        icon: '📅', message: 'You set a goal and hit it. Week one: done.',                                     trigger: 'first_weekly_target',    points_reward: 150 },
  { id: 'two_week_fire',    category: 'consistency', name: 'Two-Week Fire',    icon: '🔥', message: 'Two weeks. The fire\'s catching.',                                                trigger: '2_week_streak',          points_reward: 100 },
  { id: 'month_strong',     category: 'consistency', name: 'Month Strong',     icon: '🔥', message: 'A full month of consistency. Your body is rewriting itself.',                     trigger: '4_week_streak',          points_reward: 200 },
  { id: 'eight_week_wall',  category: 'consistency', name: 'Eight-Week Wall',  icon: '🔥', message: 'Most people quit by now. You didn\'t.',                                          trigger: '8_week_streak',          points_reward: 300 },
  { id: 'the_commitment',   category: 'consistency', name: 'The Commitment',   icon: '💎', message: 'Three months. This isn\'t a phase — it\'s who you are.',                          trigger: '12_week_streak',         points_reward: 500 },
  { id: 'half_year_club',   category: 'consistency', name: 'Half-Year Club',   icon: '👑', message: 'Six months of discipline. You\'ve built something most runners never will.',      trigger: '26_week_streak',         points_reward: 1000 },

  // Volume badges (cumulative below-ceiling minutes)
  { id: 'seedling',         category: 'volume', name: 'Seedling',              icon: '🌱', message: '100 minutes of aerobic building. The roots are growing.',                         trigger: '100_zone_minutes',       points_reward: 50 },
  { id: 'taking_root',      category: 'volume', name: 'Taking Root',           icon: '🌿', message: '500 minutes. The foundation is real.',                                            trigger: '500_zone_minutes',       points_reward: 100 },
  { id: 'deep_roots',       category: 'volume', name: 'Deep Roots',            icon: '🌳', message: '1,000 minutes below ceiling. Your aerobic base is solid.',                        trigger: '1000_zone_minutes',      points_reward: 200 },
  { id: 'summit_seeker',    category: 'volume', name: 'Summit Seeker',         icon: '🏔️', message: '2,500 minutes. You\'re in rare territory.',                                      trigger: '2500_zone_minutes',      points_reward: 300 },
  { id: 'bonfire',          category: 'volume', name: 'Bonfire',               icon: '🌋', message: 'The fire you built? It\'s a bonfire now.',                                        trigger: '5000_zone_minutes',      points_reward: 500 },
  { id: 'eternal_flame',    category: 'volume', name: 'Eternal Flame',         icon: '☀️', message: '10,000 minutes. You are the method.',                                             trigger: '10000_zone_minutes',     points_reward: 1000 },

  // MAF Test badges
  { id: 'first_benchmark',  category: 'maf_test', name: 'First Benchmark',    icon: '📊', message: 'Your starting line is drawn. Now we watch the pace drop.',                        trigger: 'first_maf_test',         points_reward: 50 },
  { id: 'proof_positive',   category: 'maf_test', name: 'Proof Positive',     icon: '📈', message: 'Faster at the same heart rate. This is the proof.',                                trigger: 'maf_test_improved',      points_reward: 200 },
  { id: 'triple_proof',     category: 'maf_test', name: 'Triple Proof',       icon: '🏆', message: 'Three tests, three improvements. The trend is undeniable.',                        trigger: '3_consecutive_improvements', points_reward: 300 },
  { id: 'year_of_tests',    category: 'maf_test', name: 'Year of Tests',      icon: '🎖️', message: 'A full year of tracking. You have data most coaches would envy.',                 trigger: '12_tests_12_months',     points_reward: 500 },
]
```

### Surprise bonus definitions

```typescript
export interface SurpriseBonusDef {
  id: string
  name: string
  points: number
  coach_message_template: string   // Use {value} for the metric
}

export const SURPRISE_BONUSES: SurpriseBonusDef[] = [
  { id: 'pr_zone_streak',    name: 'Zone Streak PR',     points: 50, coach_message_template: 'New record! You held below ceiling for {value} minutes straight.' },
  { id: 'pr_cardiac_drift',  name: 'Drift PR',           points: 30, coach_message_template: 'Your lowest cardiac drift yet — {value}%. Your engine is getting efficient.' },
  { id: 'pr_warmup',         name: 'Warmup PR',          points: 20, coach_message_template: 'Perfect warm-up — your best start yet.' },
  { id: 'comeback',          name: 'Welcome Back',       points: 25, coach_message_template: 'Welcome back. The fire was waiting.' },
  { id: 'weather_rain',      name: 'Rain Runner',        points: 30, coach_message_template: 'You ran in the rain. That\'s commitment.' },
  { id: 'weather_heat',      name: 'Heat Fighter',       points: 30, coach_message_template: 'You ran in {value}°F heat. That\'s grit.' },
  { id: 'weather_cold',      name: 'Cold Warrior',       points: 30, coach_message_template: 'You ran in {value}°F cold. The fire burns inside.' },
  { id: 'early_bird',        name: 'Early Bird',         points: 20, coach_message_template: 'Out before dawn. The early miles are the best miles.' },
]
```

### Update GameState interface

Add fields for the new badge system and surprise bonuses:

```typescript
export interface GameState {
  // Points & Level (internal — never shown as numbers)
  xp_total: number                        // Keep field name for backward compat
  level: number
  level_name: string

  // Streak
  streak: StreakState

  // Weekly target
  weekly_target_zone_minutes: number

  // Badges (replaces quests + milestones)
  badges_earned: string[]                 // Array of badge IDs
  badges_progress: Record<string, number> // { badge_id: progress_count } for multi-step badges

  // Personal records (for surprise bonus detection)
  personal_records: {
    longest_zone_streak_minutes: number
    best_cardiac_drift: number | null     // Lower is better
    best_warmup_score: number
  }

  // Lifetime stats
  lifetime_zone_minutes: number
  lifetime_qualifying_runs: number
  lifetime_total_runs: number             // All runs, not just qualifying

  // Weekly history
  weekly_history: WeeklyRecord[]

  // Training start date
  training_start_date: string | null

  // Metadata
  updated_at: string
}
```

### Update createInitialGameState()

```typescript
export function createInitialGameState(): GameState {
  return {
    xp_total: 0,
    level: 1,
    level_name: 'Spark',
    streak: { current_weeks: 0, longest_ever: 0, last_qualified_week: null, frozen: false },
    weekly_target_zone_minutes: 90,
    badges_earned: [],
    badges_progress: {},
    personal_records: {
      longest_zone_streak_minutes: 0,
      best_cardiac_drift: null,
      best_warmup_score: 0,
    },
    lifetime_zone_minutes: 0,
    lifetime_qualifying_runs: 0,
    lifetime_total_runs: 0,
    weekly_history: [],
    training_start_date: null,
    updated_at: new Date().toISOString(),
  }
}
```

### Compile check, then commit.

---

## Step 2: Update `xpEngine.ts` — Remove Cadence, Add Surprise Bonuses

**Files**: `worker/src/lib/xpEngine.ts` AND `app/src/lib/xpEngine.ts`

### Changes:
1. **Remove cadence bonus** from `XPBreakdown` and `calculateRunXP()`
2. **Add surprise bonus detection**: new function `detectSurpriseBonuses(activity, gameState)` that returns triggered bonuses
3. **Rename** internal comments from "XP" to "points" for clarity (field names stay for compat)

### New function:

```typescript
export interface SurpriseBonus {
  id: string
  name: string
  points: number
  message: string          // Filled-in template with actual value
}

export function detectSurpriseBonuses(
  activity: MAFActivity,
  personalRecords: GameState['personal_records'],
  lastRunDate: string | null  // For "comeback" detection
): SurpriseBonus[]
```

Logic:
- If `activity.longest_zone_streak_minutes > personalRecords.longest_zone_streak_minutes` → PR bonus
- If `activity.cardiac_drift !== null && (personalRecords.best_cardiac_drift === null || activity.cardiac_drift < personalRecords.best_cardiac_drift)` → PR bonus
- If `activity.warmup_score > personalRecords.best_warmup_score` → PR bonus
- If `lastRunDate` is 5+ days ago → comeback bonus
- Weather bonuses: check if activity has weather data (Step 6)

### Compile check, then commit.

---

## Step 3: Replace `questEngine.ts` → `badgeEngine.ts`

**Files**: `worker/src/lib/badgeEngine.ts` (new), delete or deprecate `questEngine.ts`

### Purpose:
Check each run against all badge triggers. Return newly earned badges.

### Core function:

```typescript
export interface BadgeCheckResult {
  badges_earned: BadgeDefinition[]        // Badges unlocked this run
  progress_updates: Record<string, number> // Updated progress for multi-step badges
  total_points: number                    // Sum of points from new badges
}

export function checkBadges(
  activity: MAFActivity,
  gameState: GameState
): BadgeCheckResult
```

### Badge trigger logic:

**First run badges**: Check `gameState.lifetime_total_runs` against run count thresholds.

**Discipline badges**: Check activity metrics directly:
- `dialed_in`: `activity.time_below_ceiling_pct >= 70` AND not already earned
- `zone_locked`: `activity.longest_zone_streak_minutes >= 20` AND not already earned
- `patience_practice`: increment progress on warmup_score >= 80, trigger at 3
- `drift_buster`: `activity.cardiac_drift !== null && activity.cardiac_drift < 3 && activity.qualifying`
- `negative_splitter`: `activity.negative_split && activity.qualifying`
- `long_haul`: `activity.duration_seconds >= 3600 && activity.qualifying`
- `ultra_steady`: `activity.longest_zone_streak_minutes >= 45`

**Consistency badges**: Checked by streak engine, not here. The streak engine calls back into badge check when streak milestones are hit.

**Volume badges**: Check `gameState.lifetime_zone_minutes + activity.zone_minutes` against thresholds.

**MAF Test badges**: Checked separately when a run is tagged as MAF Test.

### "Committed" badge:
Add a separate function `checkSetupBadge(gameState)` that fires when settings are first saved. Called from the settings PUT handler.

### Compile check, then commit.

---

## Step 4: Update `streakEngine.ts` — Consistency Badge Triggers

### Changes:
1. When `evaluateWeekEnd()` determines a streak milestone (2, 4, 8, 12, 26 weeks), return the corresponding badge ID
2. Add `getStreakBadges(streakWeeks: number, badgesEarned: string[]): string[]` helper

### Compile check, then commit.

---

## Step 5: Update `gameState.ts` — Wire New Badge System

### Changes:
1. Replace quest engine imports with badge engine imports
2. Update `processNewRun()`:
   - Call `checkBadges()` instead of `checkQuestProgress()`
   - Call `detectSurpriseBonuses()`
   - Update personal records
   - Increment `lifetime_total_runs`
   - Apply surprise bonus points to xp_total
3. Update `ProcessRunResult` to include `badges_earned`, `surprise_bonuses`
4. Add `buildNextStep(gameState): NextStep` function (Next Step Engine)

### Next Step Engine:

```typescript
export interface NextStep {
  priority: 'streak' | 'badge' | 'level' | 'weekly' | 'encouragement'
  message: string
  detail?: string
}

export function buildNextStep(gameState: GameState): NextStep {
  // Priority 1: Streak protection
  // Priority 2: Badge within reach
  // Priority 3: Level within 10%
  // Priority 4: Weekly target
  // Priority 5: General encouragement
}
```

### Update `GameAPIResponse` to match new structure:
- Remove quest fields, add badge fields
- Add `next_step: NextStep`
- Add `surprise_bonuses` from latest run
- Level progress as percentage (no XP numbers)

### Compile check, then commit.

---

## Step 6: Weather API Integration

### Approach:
Use OpenWeatherMap "Current Weather" API (free tier: 1000 calls/day, plenty for our scale).

### Where it fires:
In the webhook handler, after fetching the activity from Strava:
1. Get activity start_latlng from Strava activity data
2. Call OpenWeatherMap with lat/lng and activity start_date (use "history" endpoint or approximate with current if recent)
3. Store weather data alongside activity analysis in KV

### Weather conditions that trigger bonuses:
- **Rain**: weather condition code 2xx (thunderstorm), 3xx (drizzle), 5xx (rain)
- **Excessive heat**: temp > 85°F (29°C)
- **Cold**: temp < 35°F (2°C)
- **Early bird**: activity start time before 6:00 AM local time (from Strava timezone field)

### Implementation:
Add to `worker/src/lib/weatherService.ts`:

```typescript
export interface ActivityWeather {
  temp_f: number
  condition: string        // "rain", "clear", "snow", etc.
  condition_code: number   // OpenWeatherMap code
  description: string      // "light rain", "heavy snow", etc.
}

export async function fetchActivityWeather(
  lat: number,
  lng: number,
  apiKey: string
): Promise<ActivityWeather | null>
```

### Secret:
Add `OPENWEATHERMAP_API_KEY` to worker secrets.

### Early bird detection:
No API needed — Strava activity has `start_date_local` and `timezone`. Parse the hour.

### Compile check, then commit.

---

## Step 7: Update Frontend Components

### `GameCard.tsx`:
- Show level name + progress bar (no XP numbers)
- "→ Next level name" below progress bar
- When within 10%: "Almost there — X more runs"
- Show streak as #1 element
- Show next step from Next Step Engine
- Trophy case: grid of earned badge icons
- Next badge preview (greyed out, "1 more run to unlock")

### `CoachCard.tsx`:
- Surprise bonus celebrations inline in coaching text
- Badge unlock animations (confetti moment)

### `Dashboard.tsx`:
- "Rules of the Game" link in nav/settings
- Badge detail modal on tap (icon, name, message, date earned)

### Compile check, then commit.

---

## Step 8: Rules of the Game Page

### New component: `RulesOfTheGame.tsx`

Static content page accessible from a "How it works" link. Uses the copy from the spec:
- Building a fire metaphor
- Levels visual (emoji chain)
- Badges explanation
- Streaks explanation
- Next Step explanation
- MAF Test explanation
- "Why it feels slow" section

### Compile check, then commit.

---

## Step 9: Update Worker Index + Coaching Prompts

### `worker/src/index.ts`:
- Settings PUT handler: call `checkSetupBadge()` for "Committed" badge
- Webhook handler: integrate weather fetch, pass to surprise bonus detection
- Update `/api/game` response shape

### Coaching system prompt updates:
- Coach references levels by name, never XP numbers
- Coach references badges by name when celebrating
- Coach uses Next Step Engine output in every assessment
- Surprise bonus messages woven into coaching text
- Weather acknowledgment in coaching when applicable

### Compile check, then commit.

---

## Execution Order Summary

| Step | What | Files | Dependencies |
|------|------|-------|-------------|
| 1 | Level table + badge defs + GameState | gameTypes.ts | None |
| 2 | Remove cadence, add surprise bonuses | xpEngine.ts | Step 1 |
| 3 | Badge engine (replaces quest engine) | badgeEngine.ts | Steps 1-2 |
| 4 | Streak badge triggers | streakEngine.ts | Steps 1, 3 |
| 5 | Wire new system in orchestrator | gameState.ts | Steps 1-4 |
| 6 | Weather API | weatherService.ts | None (parallel) |
| 7 | Frontend components | GameCard, Coach, Dashboard | Steps 1-5 |
| 8 | Rules of the Game page | RulesOfTheGame.tsx | None (parallel) |
| 9 | Worker index + coaching prompts | index.ts, prompts | Steps 1-6 |

Each step compiles before the next. Commit after each.
