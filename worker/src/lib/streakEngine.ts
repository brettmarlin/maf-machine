// worker/src/lib/streakEngine.ts
// Streak tracking and weekly goal evaluation.
// Pure functions — no KV access, no side effects.

import type { MAFActivity } from './mafAnalysis';
import type { GameState, WeeklyRecord } from './gameTypes';
import { getISOWeek, getStreakMultiplier } from './gameTypes';

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
  /** Bonus XP from weekly goals */
  weekly_bonus_xp: number;
  /** Updated streak count */
  new_streak_weeks: number;
  /** Updated longest streak */
  new_streak_longest: number;
  /** Streak multiplier for this week's runs */
  streak_multiplier: number;
  /** Whether this was a pure MAF week */
  pure_maf: boolean;
}

// ─── Weekly Progress ──────────────────────────────────────────────────────────

/**
 * Update weekly progress when a new qualifying run arrives.
 * Called per-run by the game state orchestrator.
 *
 * Returns the updated weekly record for the run's ISO week.
 */
export function updateWeeklyProgress(
  activity: MAFActivity,
  gameState: GameState,
  mafCeiling: number
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
 * Called when we detect the week has ended (a run arrives in a new week)
 * or on a manual weekly summary trigger.
 *
 * Computes weekly bonus XP and updates streak.
 */
export function evaluateWeekEnd(
  completedWeek: WeeklyRecord,
  gameState: GameState
): WeekEndResult {
  let weeklyBonusXP = 0;

  // Weekly target hit: 100 XP
  if (completedWeek.target_met) {
    weeklyBonusXP += 100;
  }

  // Exceeded target by 50%: 50 bonus XP
  if (completedWeek.zone_minutes >= gameState.weekly_target_zone_minutes * 1.5) {
    weeklyBonusXP += 50;
  }

  // Pure MAF week: 50 bonus XP
  if (completedWeek.pure_maf && completedWeek.qualifying_runs > 0) {
    weeklyBonusXP += 50;
  }

  // 3+ qualifying runs: 25 bonus XP
  if (completedWeek.qualifying_runs >= 3) {
    weeklyBonusXP += 25;
  }

  // ── Streak calculation ──────────────────────────────────────────────────

  let newStreakWeeks = gameState.streak_current_weeks;
  let newStreakLongest = gameState.streak_longest;

  if (completedWeek.target_met) {
    // Target met → streak continues
    newStreakWeeks += 1;
    if (newStreakWeeks > newStreakLongest) {
      newStreakLongest = newStreakWeeks;
    }
  } else if (completedWeek.runs > 0) {
    // Ran but didn't hit target → streak freeze (pauses, doesn't reset)
    // No change to streak count, but no multiplier benefit either
  } else {
    // Didn't run at all → streak resets
    newStreakWeeks = 0;
  }

  const streakMultiplier = completedWeek.target_met
    ? getStreakMultiplier(newStreakWeeks)
    : 1.0;

  return {
    target_met: completedWeek.target_met,
    weekly_bonus_xp: weeklyBonusXP,
    new_streak_weeks: newStreakWeeks,
    new_streak_longest: newStreakLongest,
    streak_multiplier: streakMultiplier,
    pure_maf: completedWeek.pure_maf,
  };
}

/**
 * Check if a previous week needs evaluation.
 * When a run arrives in a new week, the prior week may need to be finalized.
 *
 * Returns the week string that needs evaluation, or null if none.
 */
export function getPendingWeekEvaluation(
  currentRunWeek: string,
  gameState: GameState
): string | null {
  if (gameState.weekly_history.length === 0) return null;

  // Find the most recent week in history
  const sorted = [...gameState.weekly_history].sort((a, b) =>
    b.week.localeCompare(a.week)
  );
  const lastWeek = sorted[0];

  // If the current run is in a different (later) week than the last recorded week,
  // the last week needs evaluation
  if (lastWeek.week < currentRunWeek) {
    return lastWeek.week;
  }

  return null;
}
