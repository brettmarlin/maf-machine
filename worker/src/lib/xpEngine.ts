// worker/src/lib/xpEngine.ts
// Per-run points calculation. Pure function — no KV access, no side effects.
// "Points" drive level progression internally but are never shown to the runner.

import type { MAFActivity } from './mafAnalysis';
import type { XPBreakdown, RunXPResult } from './gameTypes';
import type { GameState } from './gameTypes';
import { SURPRISE_BONUSES } from './gameTypes';

// ─── Surprise Bonus Result ───────────────────────────────────────────────────

export interface SurpriseBonus {
  id: string;
  name: string;
  points: number;
  message: string;       // Filled-in template with actual value
}

// ─── Points Calculation ──────────────────────────────────────────────────────

/**
 * Calculate points earned for a single run.
 *
 * Non-qualifying runs still count for first-run badges and lifetime stats,
 * but earn 0 base points. Qualifying runs earn points based on zone time,
 * discipline, and duration.
 *
 * Streak multiplier is NOT applied here — that's handled by gameState.ts.
 */
export function calculateRunXP(activity: MAFActivity): RunXPResult {
  const emptyBreakdown: XPBreakdown = {
    zone_minutes: 0,
    zone_lock: 0,
    warmup: 0,
    cadence: 0,    // v2: always 0 — cadence tracked but not rewarded
    low_drift: 0,
    negative_split: 0,
    pace_steadiness: 0,
    duration: 0,
  };

  if (!activity.qualifying) {
    return { total_xp: 0, breakdown: emptyBreakdown, qualifying: false };
  }

  const breakdown: XPBreakdown = {
    zone_minutes: computeZoneMinutesPoints(activity.zone_minutes),
    zone_lock: computeZoneLockPoints(activity.longest_zone_streak_minutes),
    warmup: computeWarmupPoints(activity.warmup_score),
    cadence: 0,    // v2: removed — penalized walk/run intervals
    low_drift: computeLowDriftPoints(activity.cardiac_drift),
    negative_split: activity.negative_split ? 15 : 0,
    pace_steadiness: activity.pace_steadiness_score >= 80 ? 10 : 0,
    duration: computeDurationPoints(activity.duration_seconds),
  };

  const total_xp = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { total_xp, breakdown, qualifying: true };
}

// ─── Surprise Bonus Detection ────────────────────────────────────────────────

/**
 * Detect surprise bonuses by comparing this run's metrics against personal records.
 * Returns triggered bonuses with filled-in coach messages.
 * Weather bonuses are added externally (Step 6) since they need API data.
 */
export function detectSurpriseBonuses(
  activity: MAFActivity,
  personalRecords: GameState['personal_records'],
  lastRunDate: string | null,
): SurpriseBonus[] {
  const bonuses: SurpriseBonus[] = [];

  const defs = Object.fromEntries(SURPRISE_BONUSES.map((d) => [d.id, d]));

  // Zone streak PR
  if (
    activity.longest_zone_streak_minutes > personalRecords.longest_zone_streak_minutes &&
    activity.longest_zone_streak_minutes >= 10 // Don't celebrate trivial streaks
  ) {
    const def = defs['pr_zone_streak'];
    bonuses.push({
      id: def.id,
      name: def.name,
      points: def.points,
      message: def.coach_message_template.replace('{value}', Math.round(activity.longest_zone_streak_minutes).toString()),
    });
  }

  // Cardiac drift PR (lower is better)
  if (
    activity.cardiac_drift !== null &&
    activity.qualifying &&
    activity.cardiac_drift >= 0 &&
    (personalRecords.best_cardiac_drift === null || activity.cardiac_drift < personalRecords.best_cardiac_drift)
  ) {
    const def = defs['pr_cardiac_drift'];
    bonuses.push({
      id: def.id,
      name: def.name,
      points: def.points,
      message: def.coach_message_template.replace('{value}', activity.cardiac_drift.toFixed(1)),
    });
  }

  // Warmup PR
  if (
    activity.warmup_score > personalRecords.best_warmup_score &&
    activity.warmup_score >= 70 // Don't celebrate low warmup scores
  ) {
    const def = defs['pr_warmup'];
    bonuses.push({
      id: def.id,
      name: def.name,
      points: def.points,
      message: def.coach_message_template,
    });
  }

  // Comeback bonus (5+ days since last run)
  if (lastRunDate) {
    const daysSinceLast = (new Date(activity.date).getTime() - new Date(lastRunDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast >= 5) {
      const def = defs['comeback'];
      bonuses.push({
        id: def.id,
        name: def.name,
        points: def.points,
        message: def.coach_message_template,
      });
    }
  }

  // Early bird (before 6 AM local — detected from activity start time)
  const startHour = new Date(activity.date).getHours();
  if (startHour < 6) {
    const def = defs['early_bird'];
    bonuses.push({
      id: def.id,
      name: def.name,
      points: def.points,
      message: def.coach_message_template,
    });
  }

  return bonuses;
}

// ─── Component Calculators ───────────────────────────────────────────────────

/** 1 point per minute below ceiling (floored) */
function computeZoneMinutesPoints(zoneMinutes: number): number {
  return Math.floor(zoneMinutes);
}

/** Bonus for longest continuous zone streak */
function computeZoneLockPoints(longestStreakMinutes: number): number {
  if (longestStreakMinutes >= 45) return 75;
  if (longestStreakMinutes >= 30) return 50;
  if (longestStreakMinutes >= 20) return 25;
  if (longestStreakMinutes >= 10) return 10;
  return 0;
}

/** Warm-up score ≥ 80 earns 15 points */
function computeWarmupPoints(warmupScore: number): number {
  return warmupScore >= 80 ? 15 : 0;
}

/** Cardiac drift < 3% → 20, < 5% → 10 */
function computeLowDriftPoints(cardiacDrift: number | null): number {
  if (cardiacDrift === null) return 0;
  if (cardiacDrift < 3) return 20;
  if (cardiacDrift < 5) return 10;
  return 0;
}

/** Duration bonus: 45+ min → 10, 60+ → 20, 90+ → 35 */
function computeDurationPoints(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  if (minutes >= 90) return 35;
  if (minutes >= 60) return 20;
  if (minutes >= 45) return 10;
  return 0;
}
