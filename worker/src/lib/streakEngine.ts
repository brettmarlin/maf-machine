// =============================================================================
// MAF Machine v2 — Streak Engine
// =============================================================================
// Manages weekly streak state: continuation, freeze, and reset logic.
// Also builds WeeklyGoalState from a set of activities for a given week.
// Pure functions — no KV access, no side effects.
// =============================================================================

import type { MAFActivity } from './mafAnalysis'
import type { StreakState, WeeklyGoalState } from './gameTypes'
import { getISOWeek } from './mafAnalysis'

// -----------------------------------------------------------------------------
// Build Weekly Goal State
// -----------------------------------------------------------------------------

/**
 * Build a WeeklyGoalState from activities that fall within a given ISO week.
 * Activities should already be filtered to the target week.
 */
export function buildWeeklyGoalState(
  week: string,
  activities: MAFActivity[],
  weeklyTarget: number,
  mafZoneHigh: number
): WeeklyGoalState {
  const totalZoneMinutes = activities.reduce((sum, a) => sum + a.zone_minutes, 0)
  const qualifyingRuns = activities.filter((a) => a.qualifying).length
  const pureMaf = activities.length > 0 && activities.every((a) => a.avg_hr <= mafZoneHigh + 5)
  const targetMet = totalZoneMinutes >= weeklyTarget

  return {
    week,
    zone_minutes: Math.round(totalZoneMinutes * 10) / 10,
    target: weeklyTarget,
    runs: activities.length,
    qualifying_runs: qualifyingRuns,
    target_met: targetMet,
    pure_maf: pureMaf,
    xp_earned: 0,   // Filled in later by the orchestrator after XP calculation
  }
}

// -----------------------------------------------------------------------------
// Streak Evaluation
// -----------------------------------------------------------------------------

export interface StreakEvalResult {
  new_streak: StreakState
  streak_changed: boolean         // True if streak advanced, froze, or reset
  week_finalized: string | null   // The ISO week that was just finalized, if any
}

/**
 * Evaluate streak state when a new week is detected.
 *
 * Call this when processing a run whose ISO week differs from the last
 * tracked week. It determines what happened to the streak based on:
 *
 * 1. Did the previous week meet its target?
 *    - Yes → streak continues (increment)
 *    - No, but at least 1 run → streak FREEZES (no bonus, but doesn't reset)
 *    - No runs at all → streak RESETS to 0
 *
 * 2. Were any weeks skipped between the last tracked week and now?
 *    - Each skipped week with no data → streak resets
 *
 * @param currentWeek  The ISO week of the run being processed now
 * @param previousWeekState  The WeeklyGoalState of the most recently completed week (or null)
 * @param currentStreak  Current streak state
 * @param skippedWeeks  Number of full weeks between last tracked week and currentWeek (0 = consecutive)
 */
export function evaluateStreak(
  currentWeek: string,
  previousWeekState: WeeklyGoalState | null,
  currentStreak: StreakState,
  skippedWeeks: number
): StreakEvalResult {
  // If there's no previous week data at all, this is the first week
  if (!previousWeekState) {
    return {
      new_streak: {
        ...currentStreak,
        last_qualified_week: null,
        frozen: false,
      },
      streak_changed: false,
      week_finalized: null,
    }
  }

  let newStreak = { ...currentStreak }

  // If weeks were skipped entirely (no runs at all), streak resets
  if (skippedWeeks > 1) {
    // More than 1 gap week means at least one week with zero activity
    newStreak = {
      current_weeks: 0,
      longest_ever: currentStreak.longest_ever,
      last_qualified_week: previousWeekState.week,
      frozen: false,
    }
    return {
      new_streak: newStreak,
      streak_changed: currentStreak.current_weeks > 0,
      week_finalized: previousWeekState.week,
    }
  }

  // Previous week met target → streak continues
  if (previousWeekState.target_met) {
    const newCount = currentStreak.current_weeks + 1
    newStreak = {
      current_weeks: newCount,
      longest_ever: Math.max(currentStreak.longest_ever, newCount),
      last_qualified_week: previousWeekState.week,
      frozen: false,
    }
    return {
      new_streak: newStreak,
      streak_changed: true,
      week_finalized: previousWeekState.week,
    }
  }

  // Previous week had runs but missed target → freeze
  if (previousWeekState.runs > 0) {
    newStreak = {
      current_weeks: currentStreak.current_weeks,   // No increment
      longest_ever: currentStreak.longest_ever,
      last_qualified_week: previousWeekState.week,
      frozen: true,
    }
    return {
      new_streak: newStreak,
      streak_changed: !currentStreak.frozen,  // Changed if wasn't already frozen
      week_finalized: previousWeekState.week,
    }
  }

  // Previous week had zero runs → streak resets
  newStreak = {
    current_weeks: 0,
    longest_ever: currentStreak.longest_ever,
    last_qualified_week: previousWeekState.week,
    frozen: false,
  }
  return {
    new_streak: newStreak,
    streak_changed: currentStreak.current_weeks > 0,
    week_finalized: previousWeekState.week,
  }
}

// -----------------------------------------------------------------------------
// Week Gap Calculation
// -----------------------------------------------------------------------------

/**
 * Calculate how many weeks were skipped between two ISO week strings.
 * Returns 0 if they are the same week, 1 if consecutive, 2+ if gap.
 *
 * Examples:
 *   weeksBetween("2025-W07", "2025-W08") → 1  (consecutive, no gap)
 *   weeksBetween("2025-W07", "2025-W09") → 2  (1 skipped week)
 *   weeksBetween("2025-W07", "2025-W07") → 0  (same week)
 *   weeksBetween("2025-W52", "2026-W01") → 1  (year boundary, consecutive)
 */
export function weeksBetween(weekA: string, weekB: string): number {
  const dateA = isoWeekToDate(weekA)
  const dateB = isoWeekToDate(weekB)
  const diffMs = Math.abs(dateB.getTime() - dateA.getTime())
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
}

/**
 * Convert an ISO week string like "2025-W07" to a Date (Monday of that week).
 */
function isoWeekToDate(isoWeek: string): Date {
  const [yearStr, weekStr] = isoWeek.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)

  // January 4th is always in ISO week 1
  const jan4 = new Date(year, 0, 4)
  // Find Monday of week 1
  const dayOfWeek = jan4.getDay() || 7  // Convert Sunday=0 to 7
  const mondayWeek1 = new Date(jan4)
  mondayWeek1.setDate(jan4.getDate() - (dayOfWeek - 1))

  // Add (week - 1) * 7 days
  const targetMonday = new Date(mondayWeek1)
  targetMonday.setDate(mondayWeek1.getDate() + (week - 1) * 7)
  return targetMonday
}

// -----------------------------------------------------------------------------
// Current Week Helper
// -----------------------------------------------------------------------------

/**
 * Get the current ISO week and filter activities belonging to it.
 * Useful for building the "this week" progress display.
 */
export function getCurrentWeekActivities(
  activities: MAFActivity[]
): { week: string; activities: MAFActivity[] } {
  const now = new Date().toISOString()
  const currentWeek = getISOWeek(now)
  const weekActivities = activities.filter(
    (a) => !a.excluded && getISOWeek(a.date) === currentWeek
  )
  return { week: currentWeek, activities: weekActivities }
}

/**
 * Get days remaining in the current ISO week (Monday-based).
 * Sunday = 0 days remaining, Monday = 6 days remaining.
 */
export function daysRemainingInWeek(): number {
  const now = new Date()
  const day = now.getDay()
  // Monday=1 → 6 remaining, Tuesday=2 → 5, ..., Sunday=0 → 0
  if (day === 0) return 0
  return 7 - day
}
