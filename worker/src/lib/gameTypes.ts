// worker/src/lib/gameTypes.ts
// Pure type definitions and constants for the gamification system.
// No imports from other lib files. No side effects. No KV access.

// ─── Points Breakdown (internal — never shown to runner) ─────────────────────

export interface XPBreakdown {
  zone_minutes: number;       // 1 point per minute below ceiling
  zone_lock: number;          // bonus for long continuous zone streaks
  warmup: number;             // warmup_score ≥ 80 → 15
  cadence: number;            // v1 compat — removed in v2 (always 0)
  low_drift: number;          // cardiac drift < 3% → 20, < 5% → 10
  negative_split: number;     // 15
  pace_steadiness: number;    // steadiness ≥ 80 → 10
  duration: number;           // 45+ min → 10, 60+ → 20, 90+ → 35
}

export interface RunXPResult {
  total_xp: number;           // base points before streak multiplier
  breakdown: XPBreakdown;
  qualifying: boolean;
}

// ─── Levels ──────────────────────────────────────────────────────────────────
// Runner sees "Level 4 · Steady Flame" — never point numbers.
// Progress bar shows % to next level name.

export interface LevelDef {
  level: number;
  xp_required: number;
  name: string;
}

export const LEVEL_TABLE: LevelDef[] = [
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
];

export function getLevelFromXP(xp: number): LevelDef {
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_TABLE[i].xp_required) {
      return LEVEL_TABLE[i];
    }
  }
  return LEVEL_TABLE[0];
}

export function getXPToNextLevel(xp: number): number {
  const current = getLevelFromXP(xp);
  const nextIndex = LEVEL_TABLE.findIndex((l) => l.level === current.level + 1);
  if (nextIndex === -1) return 0; // max level
  return LEVEL_TABLE[nextIndex].xp_required - xp;
}

export function getLevelProgressPct(xp: number): number {
  const current = getLevelFromXP(xp);
  const nextIndex = LEVEL_TABLE.findIndex((l) => l.level === current.level + 1);
  if (nextIndex === -1) return 100; // max level
  const currentThreshold = current.xp_required;
  const nextThreshold = LEVEL_TABLE[nextIndex].xp_required;
  const range = nextThreshold - currentThreshold;
  return range > 0 ? Math.min(100, ((xp - currentThreshold) / range) * 100) : 100;
}

// ─── Streaks ─────────────────────────────────────────────────────────────────
// Multiplier is invisible — runner just sees progress bar fill faster.

export interface StreakTier {
  weeks: number;
  multiplier: number;
}

export const STREAK_TIERS: StreakTier[] = [
  { weeks: 16, multiplier: 2.5 },
  { weeks: 12, multiplier: 2.0 },
  { weeks: 8,  multiplier: 1.5 },
  { weeks: 4,  multiplier: 1.25 },
  { weeks: 2,  multiplier: 1.1 },
];

export function getStreakMultiplier(weeks: number): number {
  for (const tier of STREAK_TIERS) {
    if (weeks >= tier.weeks) return tier.multiplier;
  }
  return 1.0;
}

export interface StreakState {
  current_weeks: number;
  longest_ever: number;
  last_qualified_week: string | null;  // "2025-W07"
  frozen: boolean;                     // ran but didn't hit target
}

// ─── Badges ──────────────────────────────────────────────────────────────────
// Badges replace the old quest chain. Visual, collectible, permanent.
// Runner sees one badge at a time (next achievable), not the full list.

export type BadgeCategory = 'first_run' | 'discipline' | 'consistency' | 'volume' | 'maf_test';

export interface BadgeDefinition {
  id: string;
  category: BadgeCategory;
  name: string;
  icon: string;
  message: string;
  trigger: string;            // Human-readable trigger description
  points_reward: number;      // Internal points (hidden from user)
}

export const BADGES: BadgeDefinition[] = [
  // ── First Run badges (guaranteed, one per run) ──
  { id: 'committed',         category: 'first_run',  name: 'Committed',           icon: '✅', message: "You committed. That's the biggest step!",                                              trigger: 'setup_complete',              points_reward: 50 },
  { id: 'first_spark',       category: 'first_run',  name: 'First Spark',         icon: '🔥', message: 'You lit the fire. Everything starts here.',                                               trigger: 'run_1',                       points_reward: 200 },
  { id: 'took_initiative',   category: 'first_run',  name: 'Took the Initiative', icon: '👟', message: "You came back. That's what separates builders from dreamers.",                              trigger: 'run_2',                       points_reward: 100 },
  { id: 'three_for_three',   category: 'first_run',  name: 'Three for Three',     icon: '🎯', message: 'Three runs. The habit is starting to form.',                                               trigger: 'run_3',                       points_reward: 100 },
  { id: 'showing_up',        category: 'first_run',  name: 'Showing Up',          icon: '💪', message: "Four runs in. Your body is already adapting — even if you can't feel it yet.",              trigger: 'run_4',                       points_reward: 100 },
  { id: 'first_five',        category: 'first_run',  name: 'First Five',          icon: '⭐', message: "Five runs. You're not trying anymore — you're doing.",                                     trigger: 'run_5',                       points_reward: 100 },

  // ── Discipline badges ──
  { id: 'dialed_in',         category: 'discipline', name: 'Dialed In',           icon: '🎯', message: 'You held the line. Your heart rate listened.',                                             trigger: 'first_70pct_below_ceiling',   points_reward: 100 },
  { id: 'zone_locked',       category: 'discipline', name: 'Zone Locked',         icon: '🔒', message: "20 minutes locked in. That's real aerobic work.",                                          trigger: '20min_continuous',             points_reward: 150 },
  { id: 'patience_practice', category: 'discipline', name: 'Patience Practice',   icon: '🧘', message: 'Slow starts build fast finishes.',                                                        trigger: '3_warmup_80plus',             points_reward: 100 },
  { id: 'drift_buster',      category: 'discipline', name: 'Drift Buster',        icon: '📉', message: "Your heart barely had to work harder in the second half. That's fitness.",                  trigger: 'drift_under_3pct',            points_reward: 150 },
  { id: 'negative_splitter', category: 'discipline', name: 'Negative Splitter',   icon: '⚡', message: "You got faster without trying harder. The method is working.",                              trigger: 'negative_split_qualifying',   points_reward: 100 },
  { id: 'long_haul',         category: 'discipline', name: 'Long Haul',           icon: '🏔️', message: 'An hour below ceiling. Your aerobic engine just leveled up.',                              trigger: '60min_qualifying',            points_reward: 150 },
  { id: 'ultra_steady',      category: 'discipline', name: 'Ultra Steady',        icon: '🦁', message: '45 minutes locked. Most runners never achieve this.',                                      trigger: '45min_continuous',             points_reward: 200 },

  // ── Consistency badges ──
  { id: 'full_week',         category: 'consistency', name: 'Full Week',          icon: '📅', message: 'You set a goal and hit it. Week one: done.',                                               trigger: 'first_weekly_target',         points_reward: 150 },
  { id: 'two_week_fire',     category: 'consistency', name: 'Two-Week Fire',      icon: '🔥', message: "Two weeks. The fire's catching.",                                                          trigger: '2_week_streak',               points_reward: 100 },
  { id: 'month_strong',      category: 'consistency', name: 'Month Strong',       icon: '🔥', message: 'A full month of consistency. Your body is rewriting itself.',                               trigger: '4_week_streak',               points_reward: 200 },
  { id: 'eight_week_wall',   category: 'consistency', name: 'Eight-Week Wall',    icon: '🔥', message: "Most people quit by now. You didn't.",                                                     trigger: '8_week_streak',               points_reward: 300 },
  { id: 'the_commitment',    category: 'consistency', name: 'The Commitment',     icon: '💎', message: "Three months. This isn't a phase — it's who you are.",                                     trigger: '12_week_streak',              points_reward: 500 },
  { id: 'half_year_club',    category: 'consistency', name: 'Half-Year Club',     icon: '👑', message: "Six months of discipline. You've built something most runners never will.",                 trigger: '26_week_streak',              points_reward: 1000 },

  // ── Volume badges (cumulative below-ceiling minutes) ──
  { id: 'seedling',          category: 'volume',     name: 'Seedling',            icon: '🌱', message: '100 minutes of aerobic building. The roots are growing.',                                   trigger: '100_zone_minutes',            points_reward: 50 },
  { id: 'taking_root',       category: 'volume',     name: 'Taking Root',         icon: '🌿', message: '500 minutes. The foundation is real.',                                                     trigger: '500_zone_minutes',            points_reward: 100 },
  { id: 'deep_roots',        category: 'volume',     name: 'Deep Roots',          icon: '🌳', message: '1,000 minutes below ceiling. Your aerobic base is solid.',                                 trigger: '1000_zone_minutes',           points_reward: 200 },
  { id: 'summit_seeker',     category: 'volume',     name: 'Summit Seeker',       icon: '🏔️', message: "2,500 minutes. You're in rare territory.",                                                 trigger: '2500_zone_minutes',           points_reward: 300 },
  { id: 'bonfire',           category: 'volume',     name: 'Bonfire',             icon: '🌋', message: "The fire you built? It's a bonfire now.",                                                   trigger: '5000_zone_minutes',           points_reward: 500 },
  { id: 'eternal_flame',     category: 'volume',     name: 'Eternal Flame',       icon: '☀️', message: '10,000 minutes. You are the method.',                                                      trigger: '10000_zone_minutes',          points_reward: 1000 },

  // ── MAF Test badges ──
  { id: 'first_benchmark',   category: 'maf_test',   name: 'First Benchmark',    icon: '📊', message: 'Your starting line is drawn. Now we watch the pace drop.',                                  trigger: 'first_maf_test',              points_reward: 50 },
  { id: 'proof_positive',    category: 'maf_test',   name: 'Proof Positive',     icon: '📈', message: 'Faster at the same heart rate. This is the proof.',                                         trigger: 'maf_test_improved',           points_reward: 200 },
  { id: 'triple_proof',      category: 'maf_test',   name: 'Triple Proof',       icon: '🏆', message: 'Three tests, three improvements. The trend is undeniable.',                                  trigger: '3_consecutive_improvements',  points_reward: 300 },
  { id: 'year_of_tests',     category: 'maf_test',   name: 'Year of Tests',      icon: '🎖️', message: 'A full year of tracking. You have data most coaches would envy.',                          trigger: '12_tests_12_months',          points_reward: 500 },
];

export function getBadgeDef(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}

// ─── Surprise Bonuses (variable reward — never listed for runner) ────────────

export interface SurpriseBonusDef {
  id: string;
  name: string;
  points: number;
  coach_message_template: string;   // Use {value} for the metric
}

export const SURPRISE_BONUSES: SurpriseBonusDef[] = [
  { id: 'pr_zone_streak',   name: 'Zone Streak PR',  points: 50, coach_message_template: 'New record! You held below ceiling for {value} minutes straight.' },
  { id: 'pr_cardiac_drift', name: 'Drift PR',        points: 30, coach_message_template: 'Your lowest cardiac drift yet — {value}%. Your engine is getting efficient.' },
  { id: 'pr_warmup',        name: 'Warmup PR',       points: 20, coach_message_template: 'Perfect warm-up — your best start yet.' },
  { id: 'comeback',         name: 'Welcome Back',    points: 25, coach_message_template: 'Welcome back. The fire was waiting.' },
  { id: 'weather_rain',     name: 'Rain Runner',     points: 30, coach_message_template: "You ran in the rain. That's commitment." },
  { id: 'weather_heat',     name: 'Heat Fighter',    points: 30, coach_message_template: "You ran in {value}°F heat. That's grit." },
  { id: 'weather_cold',     name: 'Cold Warrior',    points: 30, coach_message_template: 'You ran in {value}°F cold. The fire burns inside.' },
  { id: 'early_bird',       name: 'Early Bird',      points: 20, coach_message_template: 'Out before dawn. The early miles are the best miles.' },
];

// ─── Quests (v1 — deprecated, removed in Step 3) ────────────────────────────

export type QuestId =
  | 'first_steps'
  | 'first_maf_run'
  | 'finding_pace'
  | 'maf_five'
  | 'first_full_week'
  | 'warmup_pro'
  | 'zone_locked';

export interface QuestDef {
  id: QuestId;
  name: string;
  description: string;
  target: number;
  xp_reward: number;
  badge: string;
  next: QuestId | null;
}

export const QUEST_CHAIN: QuestDef[] = [
  { id: 'first_steps',     name: 'First Steps',       description: 'Configure your MAF settings (age, modifier)', target: 1, xp_reward: 50,  badge: '🏃', next: 'first_maf_run' },
  { id: 'first_maf_run',   name: 'First MAF Run',     description: 'Complete 1 qualifying run',                   target: 1, xp_reward: 200, badge: '🎯', next: 'finding_pace' },
  { id: 'finding_pace',    name: 'Finding Your Pace',  description: 'Complete a run with >70% zone time',          target: 1, xp_reward: 100, badge: '',   next: 'maf_five' },
  { id: 'maf_five',        name: 'MAF Five',           description: '5 qualifying runs',                          target: 5, xp_reward: 500, badge: '⭐', next: 'first_full_week' },
  { id: 'first_full_week', name: 'First Full Week',    description: 'Hit your weekly zone-minutes target',         target: 1, xp_reward: 150, badge: '📅', next: 'warmup_pro' },
  { id: 'warmup_pro',      name: 'Warm-Up Pro',        description: '3 runs with warm-up score ≥ 80',             target: 3, xp_reward: 100, badge: '🔥', next: 'zone_locked' },
  { id: 'zone_locked',     name: 'Zone Locked',        description: '20+ continuous minutes in zone',             target: 1, xp_reward: 150, badge: '🔒', next: null },
];

export function getQuestDef(id: QuestId): QuestDef | undefined {
  return QUEST_CHAIN.find((q) => q.id === id);
}

export function getFirstQuest(): QuestDef {
  return QUEST_CHAIN[0];
}

// ─── Milestones (v1 — deprecated, replaced by badges in Step 3) ─────────────

export type MilestoneCategory =
  | 'zone_minutes'
  | 'run_count'
  | 'streak'
  | 'decoupling'
  | 'long_run';

export interface MilestoneDef {
  id: string;
  category: MilestoneCategory;
  name: string;
  description: string;
  threshold: number;
  xp_reward: number;
  badge: string;
}

export const MILESTONES: MilestoneDef[] = [
  { id: 'zone_100',   category: 'zone_minutes', name: '100 Zone Minutes',     description: '100 total minutes in MAF zone',              threshold: 100,   xp_reward: 50,   badge: '⏱️' },
  { id: 'zone_500',   category: 'zone_minutes', name: '500 Zone Minutes',     description: '500 total minutes in MAF zone',              threshold: 500,   xp_reward: 100,  badge: '⏱️' },
  { id: 'zone_1000',  category: 'zone_minutes', name: '1,000 Zone Minutes',   description: '1,000 total minutes in MAF zone',            threshold: 1000,  xp_reward: 200,  badge: '⏱️' },
  { id: 'zone_2500',  category: 'zone_minutes', name: '2,500 Zone Minutes',   description: '2,500 total minutes in MAF zone',            threshold: 2500,  xp_reward: 300,  badge: '⏱️' },
  { id: 'zone_5000',  category: 'zone_minutes', name: '5,000 Zone Minutes',   description: '5,000 total minutes in MAF zone',            threshold: 5000,  xp_reward: 500,  badge: '⏱️' },
  { id: 'zone_10000', category: 'zone_minutes', name: '10,000 Zone Minutes',  description: '10,000 total minutes in MAF zone',           threshold: 10000, xp_reward: 1000, badge: '⏱️' },
  { id: 'runs_10',    category: 'run_count',    name: '10 Qualifying Runs',   description: '10 qualifying runs completed',               threshold: 10,    xp_reward: 50,   badge: '👟' },
  { id: 'runs_25',    category: 'run_count',    name: '25 Qualifying Runs',   description: '25 qualifying runs completed',               threshold: 25,    xp_reward: 100,  badge: '👟' },
  { id: 'runs_50',    category: 'run_count',    name: '50 Qualifying Runs',   description: '50 qualifying runs completed',               threshold: 50,    xp_reward: 200,  badge: '👟' },
  { id: 'runs_100',   category: 'run_count',    name: '100 Qualifying Runs',  description: '100 qualifying runs completed',              threshold: 100,   xp_reward: 300,  badge: '👟' },
  { id: 'runs_250',   category: 'run_count',    name: '250 Qualifying Runs',  description: '250 qualifying runs completed',              threshold: 250,   xp_reward: 500,  badge: '👟' },
  { id: 'runs_500',   category: 'run_count',    name: '500 Qualifying Runs',  description: '500 qualifying runs completed',              threshold: 500,   xp_reward: 1000, badge: '👟' },
  { id: 'streak_4',   category: 'streak',       name: '4-Week Streak',        description: '4 consecutive weeks hitting target',         threshold: 4,     xp_reward: 100,  badge: '🔥' },
  { id: 'streak_8',   category: 'streak',       name: '8-Week Streak',        description: '8 consecutive weeks hitting target',         threshold: 8,     xp_reward: 200,  badge: '🔥' },
  { id: 'streak_12',  category: 'streak',       name: '12-Week Streak',       description: '12 consecutive weeks hitting target',        threshold: 12,    xp_reward: 300,  badge: '🔥' },
  { id: 'streak_26',  category: 'streak',       name: '26-Week Streak',       description: '26 consecutive weeks hitting target',        threshold: 26,    xp_reward: 500,  badge: '🔥' },
  { id: 'streak_52',  category: 'streak',       name: '52-Week Streak',       description: '52 consecutive weeks hitting target',        threshold: 52,    xp_reward: 1000, badge: '🔥' },
  { id: 'decouple_5', category: 'decoupling',   name: 'Aerobic Engine',       description: 'Decoupling below 5% on a qualifying run',   threshold: 5,     xp_reward: 100,  badge: '⚡' },
  { id: 'decouple_3', category: 'decoupling',   name: 'Aerobic Machine',      description: 'Decoupling below 3% on a qualifying run',   threshold: 3,     xp_reward: 200,  badge: '⚡' },
  { id: 'long_60',    category: 'long_run',      name: 'Hour of Power',       description: 'First 60-min qualifying run',               threshold: 60,    xp_reward: 100,  badge: '🏅' },
  { id: 'long_90',    category: 'long_run',      name: 'Going Long',          description: 'First 90-min qualifying run',               threshold: 90,    xp_reward: 200,  badge: '🏅' },
  { id: 'long_120',   category: 'long_run',      name: 'Ultra Foundation',    description: 'First 120-min qualifying run',              threshold: 120,   xp_reward: 300,  badge: '🏅' },
];

export function getMilestoneDef(id: string): MilestoneDef | undefined {
  return MILESTONES.find((m) => m.id === id);
}

// ─── Weekly Tracking ─────────────────────────────────────────────────────────

export interface WeeklyRecord {
  week: string;              // ISO week: "2025-W07"
  zone_minutes: number;
  runs: number;
  qualifying_runs: number;
  target_met: boolean;
  xp_earned: number;
  pure_maf: boolean;         // all runs had avg HR ≤ ceiling + 5
}

// ─── Game State (Master) ─────────────────────────────────────────────────────

export interface GameState {
  // Points & level (internal — never shown as numbers)
  xp_total: number;

  // v1 streak fields (used by streakEngine/gameState — migrated to StreakState in Step 4-5)
  streak_current_weeks: number;
  streak_longest: number;
  streak_last_qualified_week: string | null;

  // Weekly target
  weekly_target_zone_minutes: number;

  // v1 quest fields (used by questEngine/gameState — removed in Step 3-5)
  quests_completed: QuestId[];
  quest_active: QuestId | null;
  quest_progress: Partial<Record<QuestId, number>>;

  // v1 milestones (used by gameState — removed in Step 5)
  milestones: string[];
  badges: string[];

  // v1 lifetime stats (used by gameState — renamed in Step 5)
  total_zone_minutes: number;
  total_qualifying_runs: number;

  // Weekly history (last 52 weeks max)
  weekly_history: WeeklyRecord[];

  // ── v2 fields (new — wired in Steps 3-5) ──

  // Badges (replaces quests + milestones)
  badges_earned: string[];                   // Array of badge IDs
  badges_progress: Record<string, number>;   // { badge_id: progress_count }

  // Structured streak (replaces flat streak_ fields)
  streak: StreakState;

  // Personal records (for surprise bonus detection)
  personal_records: {
    longest_zone_streak_minutes: number;
    best_cardiac_drift: number | null;       // Lower is better
    best_warmup_score: number;
  };

  // Lifetime stats (v2 naming)
  lifetime_zone_minutes: number;
  lifetime_qualifying_runs: number;
  lifetime_total_runs: number;

  // Training start date
  training_start_date: string | null;

  // Onboarding
  backfill_complete: boolean;

  // Metadata
  updated_at: string;
}

// ─── Initial State ───────────────────────────────────────────────────────────

export function createInitialGameState(): GameState {
  return {
    // v1 fields (backward compat — consumers still use these)
    xp_total: 0,
    streak_current_weeks: 0,
    streak_longest: 0,
    streak_last_qualified_week: null,
    weekly_target_zone_minutes: 90,
    quests_completed: [],
    quest_active: 'first_steps',
    quest_progress: {},
    milestones: [],
    badges: [],
    total_zone_minutes: 0,
    total_qualifying_runs: 0,
    weekly_history: [],

    // v2 fields
    badges_earned: [],
    badges_progress: {},
    streak: { current_weeks: 0, longest_ever: 0, last_qualified_week: null, frozen: false },
    personal_records: {
      longest_zone_streak_minutes: 0,
      best_cardiac_drift: null,
      best_warmup_score: 0,
    },
    lifetime_zone_minutes: 0,
    lifetime_qualifying_runs: 0,
    lifetime_total_runs: 0,
    training_start_date: null,
    backfill_complete: false,
    updated_at: new Date().toISOString(),
  };
}

// ─── ISO Week Helper ─────────────────────────────────────────────────────────

/**
 * Get ISO week string from a date: "2025-W07"
 */
export function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}
