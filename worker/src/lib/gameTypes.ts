// worker/src/lib/gameTypes.ts
// Pure type definitions and constants for the gamification system.
// No imports from other lib files. No side effects. No KV access.

// ─── XP Breakdown ─────────────────────────────────────────────────────────────

export interface XPBreakdown {
  zone_minutes: number;       // 1 XP per minute in MAF zone
  zone_lock: number;          // bonus for long continuous zone streaks
  warmup: number;             // warmup_score ≥ 80 → 15 XP
  cadence: number;            // cadence bonus (168–172 → 10, 173–178 → 15)
  low_drift: number;          // cardiac drift < 3% → 20, < 5% → 10
  negative_split: number;     // 15 XP
  pace_steadiness: number;    // steadiness ≥ 80 → 10 XP
  duration: number;           // 45+ min → 10, 60+ → 20, 90+ → 35
}

export interface RunXPResult {
  total_xp: number;           // base XP before streak multiplier
  breakdown: XPBreakdown;
  qualifying: boolean;
}

// ─── Levels ───────────────────────────────────────────────────────────────────

export interface LevelDef {
  level: number;
  xp_required: number;
  name: string;
}

export const LEVEL_TABLE: LevelDef[] = [
  { level: 1,  xp_required: 0,      name: 'Beginner' },
  { level: 2,  xp_required: 500,    name: 'Walker' },
  { level: 3,  xp_required: 1500,   name: 'Jogger' },
  { level: 4,  xp_required: 3500,   name: 'Runner' },
  { level: 5,  xp_required: 7000,   name: 'Aerobic Base' },
  { level: 6,  xp_required: 12000,  name: 'Zone Master' },
  { level: 7,  xp_required: 20000,  name: 'Fat Burner' },
  { level: 8,  xp_required: 32000,  name: 'MAF Disciple' },
  { level: 9,  xp_required: 50000,  name: 'Endurance Engine' },
  { level: 10, xp_required: 75000,  name: 'MAF Legend' },
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

// ─── Streaks ──────────────────────────────────────────────────────────────────

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

// ─── Quests ───────────────────────────────────────────────────────────────────

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
  target: number;        // count needed to complete
  xp_reward: number;
  badge: string;
  next: QuestId | null;  // quest that unlocks after this one
}

export const QUEST_CHAIN: QuestDef[] = [
  {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Configure your MAF settings (age, modifier)',
    target: 1,
    xp_reward: 50,
    badge: '🏃',
    next: 'first_maf_run',
  },
  {
    id: 'first_maf_run',
    name: 'First MAF Run',
    description: 'Complete 1 qualifying run',
    target: 1,
    xp_reward: 200,
    badge: '🎯',
    next: 'finding_pace',
  },
  {
    id: 'finding_pace',
    name: 'Finding Your Pace',
    description: 'Complete a run with >70% zone time',
    target: 1,
    xp_reward: 100,
    badge: '',
    next: 'maf_five',
  },
  {
    id: 'maf_five',
    name: 'MAF Five',
    description: '5 qualifying runs',
    target: 5,
    xp_reward: 500,
    badge: '⭐',
    next: 'first_full_week',
  },
  {
    id: 'first_full_week',
    name: 'First Full Week',
    description: 'Hit your weekly zone-minutes target',
    target: 1,
    xp_reward: 150,
    badge: '📅',
    next: 'warmup_pro',
  },
  {
    id: 'warmup_pro',
    name: 'Warm-Up Pro',
    description: '3 runs with warm-up score ≥ 80',
    target: 3,
    xp_reward: 100,
    badge: '🔥',
    next: 'zone_locked',
  },
  {
    id: 'zone_locked',
    name: 'Zone Locked',
    description: '20+ continuous minutes in zone',
    target: 1,
    xp_reward: 150,
    badge: '🔒',
    next: null,
  },
];

export function getQuestDef(id: QuestId): QuestDef | undefined {
  return QUEST_CHAIN.find((q) => q.id === id);
}

export function getFirstQuest(): QuestDef {
  return QUEST_CHAIN[0];
}

// ─── Milestones ───────────────────────────────────────────────────────────────

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
  // Zone minutes milestones (lifetime total)
  { id: 'zone_100',   category: 'zone_minutes', name: '100 Zone Minutes',  description: '100 total minutes in MAF zone',   threshold: 100,   xp_reward: 50,   badge: '⏱️' },
  { id: 'zone_500',   category: 'zone_minutes', name: '500 Zone Minutes',  description: '500 total minutes in MAF zone',   threshold: 500,   xp_reward: 100,  badge: '⏱️' },
  { id: 'zone_1000',  category: 'zone_minutes', name: '1,000 Zone Minutes', description: '1,000 total minutes in MAF zone', threshold: 1000,  xp_reward: 200,  badge: '⏱️' },
  { id: 'zone_2500',  category: 'zone_minutes', name: '2,500 Zone Minutes', description: '2,500 total minutes in MAF zone', threshold: 2500,  xp_reward: 300,  badge: '⏱️' },
  { id: 'zone_5000',  category: 'zone_minutes', name: '5,000 Zone Minutes', description: '5,000 total minutes in MAF zone', threshold: 5000,  xp_reward: 500,  badge: '⏱️' },
  { id: 'zone_10000', category: 'zone_minutes', name: '10,000 Zone Minutes', description: '10,000 total minutes in MAF zone', threshold: 10000, xp_reward: 1000, badge: '⏱️' },

  // Run count milestones (qualifying runs)
  { id: 'runs_10',  category: 'run_count', name: '10 Qualifying Runs',  description: '10 qualifying runs completed',  threshold: 10,  xp_reward: 50,  badge: '👟' },
  { id: 'runs_25',  category: 'run_count', name: '25 Qualifying Runs',  description: '25 qualifying runs completed',  threshold: 25,  xp_reward: 100, badge: '👟' },
  { id: 'runs_50',  category: 'run_count', name: '50 Qualifying Runs',  description: '50 qualifying runs completed',  threshold: 50,  xp_reward: 200, badge: '👟' },
  { id: 'runs_100', category: 'run_count', name: '100 Qualifying Runs', description: '100 qualifying runs completed', threshold: 100, xp_reward: 300, badge: '👟' },
  { id: 'runs_250', category: 'run_count', name: '250 Qualifying Runs', description: '250 qualifying runs completed', threshold: 250, xp_reward: 500, badge: '👟' },
  { id: 'runs_500', category: 'run_count', name: '500 Qualifying Runs', description: '500 qualifying runs completed', threshold: 500, xp_reward: 1000, badge: '👟' },

  // Streak milestones (consecutive weeks)
  { id: 'streak_4',  category: 'streak', name: '4-Week Streak',  description: '4 consecutive weeks hitting target',  threshold: 4,  xp_reward: 100, badge: '🔥' },
  { id: 'streak_8',  category: 'streak', name: '8-Week Streak',  description: '8 consecutive weeks hitting target',  threshold: 8,  xp_reward: 200, badge: '🔥' },
  { id: 'streak_12', category: 'streak', name: '12-Week Streak', description: '12 consecutive weeks hitting target', threshold: 12, xp_reward: 300, badge: '🔥' },
  { id: 'streak_26', category: 'streak', name: '26-Week Streak', description: '26 consecutive weeks hitting target', threshold: 26, xp_reward: 500, badge: '🔥' },
  { id: 'streak_52', category: 'streak', name: '52-Week Streak', description: '52 consecutive weeks hitting target', threshold: 52, xp_reward: 1000, badge: '🔥' },

  // Decoupling milestones
  { id: 'decouple_5', category: 'decoupling', name: 'Aerobic Engine',   description: 'Decoupling below 5% on a qualifying run', threshold: 5, xp_reward: 100, badge: '⚡' },
  { id: 'decouple_3', category: 'decoupling', name: 'Aerobic Machine',  description: 'Decoupling below 3% on a qualifying run', threshold: 3, xp_reward: 200, badge: '⚡' },

  // Long run milestones (qualifying runs by duration in minutes)
  { id: 'long_60',  category: 'long_run', name: 'Hour of Power',    description: 'First 60-min qualifying run',  threshold: 60,  xp_reward: 100, badge: '🏅' },
  { id: 'long_90',  category: 'long_run', name: 'Going Long',       description: 'First 90-min qualifying run',  threshold: 90,  xp_reward: 200, badge: '🏅' },
  { id: 'long_120', category: 'long_run', name: 'Ultra Foundation',  description: 'First 120-min qualifying run', threshold: 120, xp_reward: 300, badge: '🏅' },
];

export function getMilestoneDef(id: string): MilestoneDef | undefined {
  return MILESTONES.find((m) => m.id === id);
}

// ─── Weekly Tracking ──────────────────────────────────────────────────────────

export interface WeeklyRecord {
  week: string;              // ISO week: "2025-W07"
  zone_minutes: number;
  runs: number;
  qualifying_runs: number;
  target_met: boolean;
  xp_earned: number;
  pure_maf: boolean;         // all runs had avg HR ≤ maf_high + 5
}

// ─── Game State (Master) ──────────────────────────────────────────────────────

export interface GameState {
  // XP & level
  xp_total: number;

  // Streaks
  streak_current_weeks: number;
  streak_longest: number;
  streak_last_qualified_week: string | null; // "2025-W07"

  // Weekly target
  weekly_target_zone_minutes: number;

  // Quests
  quests_completed: QuestId[];
  quest_active: QuestId | null;
  quest_progress: Partial<Record<QuestId, number>>;

  // Milestones
  milestones: string[];      // IDs of unlocked milestones
  badges: string[];          // emoji badges earned

  // Lifetime stats (for milestone checking)
  total_zone_minutes: number;
  total_qualifying_runs: number;

  // Weekly history (last 52 weeks max)
  weekly_history: WeeklyRecord[];
}

// ─── Initial State ────────────────────────────────────────────────────────────

export function createInitialGameState(): GameState {
  return {
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
  };
}

// ─── ISO Week Helper ──────────────────────────────────────────────────────────

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
