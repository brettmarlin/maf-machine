// worker/src/lib/streakEngine.ts
// Streak tracking and weekly goal evaluation.
// Pure functions — no KV access, no side effects.

import type { MAFActivity } from './mafAnalysis';
import type { GameState, WeeklyRecord } from './gameTypes';
import { getISOWeek, getStreakMultiplier } from './gameTypes';
import { getConsistencyBadges } from './badgeEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyProgressUpdate {
  /** The ISO week this run falls in */
  week: string;
  /** Updated weekly record */
  record: WeeklyRecord;
  /** Whether this is a new week (not yet in history) */
  is_new_week: boolean;
}

export interface WeekEndResult {
  /** Whether the weekly target was met */
  target_met: boolean;
  /** Bonus points from weekly goals */
  weekly_bonus_xp: number;
  /** Updated streak count */
  new_streak_weeks: number;
  /** Updated longest streak */
  new_streak_longest: number;
  /** Streak multiplier for this week's runs */
  streak_multiplier: number;
  /** Whether this was a pure MAF week */
  pure_maf: boolean;
  /** Whether streak is frozen (ran but didn't hit target) */
  frozen: boolean;
  /** Consistency badge IDs earned from this streak milestone */
  consistency_badge_ids: string[];
}

// ─── Weekly Progress ──────────────────────────────────────────────────────────

/**
 * Update weekly progress when a new run arrives.
 * Called per-run by the game state orchestrator.
 */
export function updateWeeklyProgress(
  activity: MAFActivity,
  gameState: GameState,
  mafCeiling: number,
): WeeklyProgressUpdate {
  const runDate = new Date(activity.date);
  const week = getISOWeek(runDate);

  // Find or create the weekly record
  const existingIndex = gameState.weekly_history.findIndex((w) => w.week === week);
  const existing: WeeklyRecord = existingIndex >= 0
    ? { ...gameState.weekly_history[existingIndex] }
    : {
        week,
        zone_minutes: 0,
        runs: 0,
        qualifying_runs: 0,
        target_met: false,
        xp_earned: 0,
        pure_maf: true,
      };

  // Update the record
  existing.runs += 1;
  existing.zone_minutes += activity.zone_minutes;

  if (activity.qualifying) {
    existing.qualifying_runs += 1;
  }

  // Pure MAF check: avg HR must be ≤ ceiling + 5
  if (activity.avg_hr > mafCeiling + 5) {
    existing.pure_maf = false;
  }

  // Check if weekly target is now met
  existing.target_met = existing.zone_minutes >= gameState.weekly_target_zone_minutes;

  return {
    week,
    record: existing,
    is_new_week: existingIndex < 0,
  };
}

/**
 * Evaluate end-of-week results.
 * Called when we detect the week has ended (a run arrives in a new week).
 *
 * Computes weekly bonus points, updates streak, and returns any
 * consistency badges earned from streak milestones.
 */
export function evaluateWeekEnd(
  completedWeek: WeeklyRecord,
  gameState: GameState,
): WeekEndResult {
  let weeklyBonusXP = 0;

  // Weekly target hit: 100 points
  if (completedWeek.target_met) {
    weeklyBonusXP += 100;
  }

  // Exceeded target by 50%: 50 bonus
  if (completedWeek.zone_minutes >= gameState.weekly_target_zone_minutes * 1.5) {
    weeklyBonusXP += 50;
  }

  // Pure MAF week: 50 bonus
  if (completedWeek.pure_maf && completedWeek.qualifying_runs > 0) {
    weeklyBonusXP += 50;
  }

  // 3+ qualifying runs: 25 bonus
  if (completedWeek.qualifying_runs >= 3) {
    weeklyBonusXP += 25;
  }

  // ── Streak calculation ──────────────────────────────────────────────────

  let newStreakWeeks = gameState.streak_current_weeks;
  let newStreakLongest = gameState.streak_longest;
  let frozen = false;

  if (completedWeek.target_met) {
    // Target met → streak continues
    newStreakWeeks += 1;
    if (newStreakWeeks > newStreakLongest) {
      newStreakLongest = newStreakWeeks;
    }
  } else if (completedWeek.runs > 0) {
    // Ran but didn't hit target → streak freeze (pauses, doesn't reset)
    frozen = true;
  } else {
    // Didn't run at all → streak resets
    newStreakWeeks = 0;
  }

  const streakMultiplier = completedWeek.target_met
    ? getStreakMultiplier(newStreakWeeks)
    : 1.0;

  // ── Consistency badges from streak milestones ───────────────────────────

  const consistencyBadges = getConsistencyBadges(
    newStreakWeeks,
    completedWeek.target_met,
    gameState.badges_earned,
  );

  // Add consistency badge points to weekly bonus
  for (const badge of consistencyBadges) {
    weeklyBonusXP += badge.points_reward;
  }

  return {
    target_met: completedWeek.target_met,
    weekly_bonus_xp: weeklyBonusXP,
    new_streak_weeks: newStreakWeeks,
    new_streak_longest: newStreakLongest,
    streak_multiplier: streakMultiplier,
    pure_maf: completedWeek.pure_maf,
    frozen,
    consistency_badge_ids: consistencyBadges.map((b) => b.id),
  };
}

/**
 * Check if a previous week needs evaluation.
 * Returns the week string that needs evaluation, or null if none.
 */
export function getPendingWeekEvaluation(
  currentRunWeek: string,
  gameState: GameState,
): string | null {
  if (gameState.weekly_history.length === 0) return null;

  // Find the most recent week in history
  const sorted = [...gameState.weekly_history].sort((a, b) =>
    b.week.localeCompare(a.week),
  );
  const lastWeek = sorted[0];

  // If the current run is in a different (later) week than the last recorded week,
  // the last week needs evaluation
  if (lastWeek.week < currentRunWeek) {
    return lastWeek.week;
  }

  return null;
}
