// worker/src/lib/xpEngine.ts
// Per-run XP calculation. Pure function — no KV access, no side effects.
// Imports only from mafAnalysis (MAFActivity) and gameTypes (XPBreakdown).

import type { MAFActivity } from './mafAnalysis';
import type { XPBreakdown, RunXPResult } from './gameTypes';

// ─── XP Calculation ───────────────────────────────────────────────────────────

/**
 * Calculate XP earned for a single run.
 *
 * Non-qualifying runs earn 0 XP. This is intentional —
 * the game rewards MAF discipline, not just running.
 *
 * Streak multiplier is NOT applied here — that's handled by the game state
 * orchestrator, which knows the current streak.
 */
export function calculateRunXP(activity: MAFActivity): RunXPResult {
  const emptyBreakdown: XPBreakdown = {
    zone_minutes: 0,
    zone_lock: 0,
    warmup: 0,
    cadence: 0,
    low_drift: 0,
    negative_split: 0,
    pace_steadiness: 0,
    duration: 0,
  };

  if (!activity.qualifying) {
    return { total_xp: 0, breakdown: emptyBreakdown, qualifying: false };
  }

  const breakdown: XPBreakdown = {
    zone_minutes: computeZoneMinutesXP(activity.zone_minutes),
    zone_lock: computeZoneLockXP(activity.longest_zone_streak_minutes),
    warmup: computeWarmupXP(activity.warmup_score),
    cadence: computeCadenceXP(activity.cadence_in_zone),
    low_drift: computeLowDriftXP(activity.cardiac_drift),
    negative_split: activity.negative_split ? 15 : 0,
    pace_steadiness: activity.pace_steadiness_score >= 80 ? 10 : 0,
    duration: computeDurationXP(activity.duration_seconds),
  };

  const total_xp = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { total_xp, breakdown, qualifying: true };
}

// ─── Component Calculators ────────────────────────────────────────────────────

/** 1 XP per minute in MAF zone (floored) */
function computeZoneMinutesXP(zoneMinutes: number): number {
  return Math.floor(zoneMinutes);
}

/** Bonus for longest continuous zone streak */
function computeZoneLockXP(longestStreakMinutes: number): number {
  if (longestStreakMinutes >= 45) return 75;
  if (longestStreakMinutes >= 30) return 50;
  if (longestStreakMinutes >= 20) return 25;
  if (longestStreakMinutes >= 10) return 10;
  return 0;
}

/** Warm-up score ≥ 80 earns 15 XP */
function computeWarmupXP(warmupScore: number): number {
  return warmupScore >= 80 ? 15 : 0;
}

/** Cadence bonus: 168–172 → 10 XP, 173–178 → 15 XP */
function computeCadenceXP(cadenceInZone: number | null): number {
  if (cadenceInZone === null) return 0;
  if (cadenceInZone >= 173 && cadenceInZone <= 178) return 15;
  if (cadenceInZone >= 168 && cadenceInZone <= 172) return 10;
  return 0;
}

/** Cardiac drift < 3% → 20 XP, < 5% → 10 XP */
function computeLowDriftXP(cardiacDrift: number | null): number {
  if (cardiacDrift === null) return 0;
  if (cardiacDrift < 3) return 20;
  if (cardiacDrift < 5) return 10;
  return 0;
}

/** Duration bonus: 45+ min → 10, 60+ → 20, 90+ → 35 */
function computeDurationXP(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  if (minutes >= 90) return 35;
  if (minutes >= 60) return 20;
  if (minutes >= 45) return 10;
  return 0;
}
