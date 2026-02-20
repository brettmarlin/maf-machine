// =============================================================================
// MAF Machine v2 — XP Engine
// =============================================================================
// Calculates per-run XP from analysis results.
// Pure functions — no side effects, no KV access, no state mutation.
// Consumes MAFActivity from mafAnalysis.ts, produces RunXPResult from gameTypes.ts.
// =============================================================================

import type { MAFActivity } from './mafAnalysis'
import type { RunXPResult, XPBreakdown, WeeklyBonusResult, WeeklyGoalState } from './gameTypes'
import { getStreakMultiplier } from './gameTypes'

// -----------------------------------------------------------------------------
// Per-Run XP Calculation
// -----------------------------------------------------------------------------

/**
 * Calculate XP earned from a single run.
 * Non-qualifying runs earn 0 XP — this is intentional.
 * The game rewards MAF discipline, not just running.
 */
export function calculateRunXP(activity: MAFActivity): RunXPResult {
  if (!activity.qualifying) {
    return {
      base_xp: 0,
      breakdown: {
        zone_minutes: 0,
        zone_lock: 0,
        warmup: 0,
        cadence: 0,
        low_drift: 0,
        negative_split: 0,
        pace_steadiness: 0,
        duration: 0,
      },
      streak_multiplier: 1.0,
      qualifying: false,
    }
  }

  const breakdown: XPBreakdown = {
    zone_minutes: calcZoneMinutesXP(activity.zone_minutes),
    zone_lock: calcZoneLockXP(activity.longest_zone_streak_minutes),
    warmup: calcWarmupXP(activity.warmup_score),
    cadence: calcCadenceXP(activity.cadence_in_zone),
    low_drift: calcLowDriftXP(activity.cardiac_drift),
    negative_split: calcNegativeSplitXP(activity.negative_split),
    pace_steadiness: calcPaceSteadinessXP(activity.pace_steadiness_score),
    duration: calcDurationXP(activity.duration_seconds),
  }

  const base_xp =
    breakdown.zone_minutes +
    breakdown.zone_lock +
    breakdown.warmup +
    breakdown.cadence +
    breakdown.low_drift +
    breakdown.negative_split +
    breakdown.pace_steadiness +
    breakdown.duration

  return {
    base_xp,
    breakdown,
    streak_multiplier: 1.0,  // Streak multiplier applies to weekly bonus, not per-run
    qualifying: true,
  }
}

// -----------------------------------------------------------------------------
// XP Component Calculators
// -----------------------------------------------------------------------------

/** 1 XP per minute in MAF zone. Max ~60-90 for typical runs. */
function calcZoneMinutesXP(zoneMinutes: number): number {
  return Math.floor(zoneMinutes)
}

/**
 * Bonus for longest continuous zone streak.
 * 10+ min = 10 XP, 20+ = 25, 30+ = 50, 45+ = 75
 */
function calcZoneLockXP(longestStreakMinutes: number): number {
  if (longestStreakMinutes >= 45) return 75
  if (longestStreakMinutes >= 30) return 50
  if (longestStreakMinutes >= 20) return 25
  if (longestStreakMinutes >= 10) return 10
  return 0
}

/** Warm-up score ≥ 80 = 15 XP */
function calcWarmupXP(warmupScore: number): number {
  return warmupScore >= 80 ? 15 : 0
}

/**
 * Cadence bonus based on average cadence in zone.
 * 168-172 = 10 XP, 173-178 = 15 XP
 */
function calcCadenceXP(cadenceInZone: number | null): number {
  if (cadenceInZone === null) return 0
  if (cadenceInZone >= 173 && cadenceInZone <= 178) return 15
  if (cadenceInZone >= 168 && cadenceInZone <= 172) return 10
  return 0
}

/**
 * Low cardiac drift bonus.
 * < 3% = 20 XP, < 5% = 10 XP
 */
function calcLowDriftXP(cardiacDrift: number | null): number {
  if (cardiacDrift === null) return 0
  if (cardiacDrift < 3) return 20
  if (cardiacDrift < 5) return 10
  return 0
}

/** Negative split (second half faster) = 15 XP */
function calcNegativeSplitXP(negativeSplit: boolean): number {
  return negativeSplit ? 15 : 0
}

/** Pace steadiness score ≥ 80 = 10 XP */
function calcPaceSteadinessXP(paceSteadinessScore: number): number {
  return paceSteadinessScore >= 80 ? 10 : 0
}

/**
 * Duration bonus for longer runs.
 * 45+ min = 10 XP, 60+ = 20, 90+ = 35
 */
function calcDurationXP(durationSeconds: number): number {
  const minutes = durationSeconds / 60
  if (minutes >= 90) return 35
  if (minutes >= 60) return 20
  if (minutes >= 45) return 10
  return 0
}

// -----------------------------------------------------------------------------
// Weekly Bonus XP
// -----------------------------------------------------------------------------

/**
 * Calculate end-of-week bonus XP.
 * Called when a week is finalized (new week starts or on-demand).
 */
export function calculateWeeklyBonus(
  weekState: WeeklyGoalState,
  streakWeeks: number
): WeeklyBonusResult {
  const hit_target = weekState.target_met ? 100 : 0
  const exceed_target = weekState.zone_minutes >= weekState.target * 1.5 ? 50 : 0
  const pure_maf = weekState.pure_maf ? 50 : 0
  const consistency = weekState.qualifying_runs >= 3 ? 25 : 0

  const total_before_multiplier = hit_target + exceed_target + pure_maf + consistency
  const streak_multiplier = getStreakMultiplier(streakWeeks)
  const total = Math.round(total_before_multiplier * streak_multiplier)

  return {
    hit_target,
    exceed_target,
    pure_maf,
    consistency,
    streak_multiplier,
    total_before_multiplier,
    total,
  }
}
