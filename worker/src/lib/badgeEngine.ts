// worker/src/lib/badgeEngine.ts
// Badge progression logic. Pure functions — no KV access, no side effects.
// Replaces the old questEngine.ts quest chain with a badge-based system.

import type { MAFActivity } from './mafAnalysis';
import type { GameState, BadgeDefinition } from './gameTypes';
import { BADGES } from './gameTypes';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BadgeCheckResult {
  badges_earned: BadgeDefinition[];         // Badges unlocked this run
  progress_updates: Record<string, number>; // Updated progress for multi-step badges
  total_points: number;                     // Sum of points from new badges
}

// ─── Badge Checker ───────────────────────────────────────────────────────────

/**
 * Check all badge triggers against the current run and game state.
 * Returns newly earned badges (skips already-earned ones).
 *
 * Consistency badges are NOT checked here — they're triggered by
 * the streak engine when week-end evaluation detects streak milestones.
 */
export function checkBadges(
  activity: MAFActivity,
  gameState: GameState,
): BadgeCheckResult {
  const earned: BadgeDefinition[] = [];
  const progressUpdates: Record<string, number> = {};
  const alreadyEarned = new Set(gameState.badges_earned);

  // Include the current run in the count
  const totalRunsAfterThis = gameState.lifetime_total_runs + 1;
  const totalZoneMinutesAfterThis = gameState.lifetime_zone_minutes + activity.zone_minutes;

  for (const badge of BADGES) {
    if (alreadyEarned.has(badge.id)) continue;

    const result = checkSingleBadge(badge, activity, gameState, totalRunsAfterThis, totalZoneMinutesAfterThis, progressUpdates);
    if (result) {
      earned.push(badge);
      alreadyEarned.add(badge.id); // prevent double-earning within same check
    }
  }

  const total_points = earned.reduce((sum, b) => sum + b.points_reward, 0);

  return { badges_earned: earned, progress_updates: progressUpdates, total_points };
}

/**
 * Check a single badge's trigger condition.
 * Returns true if the badge should be awarded.
 */
function checkSingleBadge(
  badge: BadgeDefinition,
  activity: MAFActivity,
  gameState: GameState,
  totalRuns: number,
  totalZoneMinutes: number,
  progressUpdates: Record<string, number>,
): boolean {
  switch (badge.trigger) {
    // ── First Run badges ──
    // setup_complete is handled separately by checkSetupBadge()
    case 'setup_complete':
      return false;

    case 'run_1':
      return totalRuns >= 1;
    case 'run_2':
      return totalRuns >= 2;
    case 'run_3':
      return totalRuns >= 3;
    case 'run_4':
      return totalRuns >= 4;
    case 'run_5':
      return totalRuns >= 5;

    // ── Discipline badges ──
    case 'first_70pct_below_ceiling':
      return activity.time_below_ceiling_pct >= 70;

    case '20min_continuous':
      return activity.longest_zone_streak_minutes >= 20;

    case '3_warmup_80plus': {
      const prev = gameState.badges_progress['patience_practice'] || 0;
      const increment = activity.warmup_score >= 80 ? 1 : 0;
      const newProgress = prev + increment;
      if (increment > 0) progressUpdates['patience_practice'] = newProgress;
      return newProgress >= 3;
    }

    case 'drift_under_3pct':
      return (
        activity.qualifying &&
        activity.cardiac_drift !== null &&
        Math.abs(activity.cardiac_drift) < 3
      );

    case 'negative_split_qualifying':
      return activity.qualifying && activity.negative_split;

    case '60min_qualifying':
      return activity.qualifying && activity.duration_seconds >= 3600;

    case '45min_continuous':
      return activity.longest_zone_streak_minutes >= 45;

    // ── Consistency badges ──
    // These are triggered by the streak engine, not per-run badge checks.
    case 'first_weekly_target':
    case '2_week_streak':
    case '4_week_streak':
    case '8_week_streak':
    case '12_week_streak':
    case '26_week_streak':
      return false;

    // ── Volume badges (cumulative below-ceiling minutes) ──
    case '100_zone_minutes':
      return totalZoneMinutes >= 100;
    case '500_zone_minutes':
      return totalZoneMinutes >= 500;
    case '1000_zone_minutes':
      return totalZoneMinutes >= 1000;
    case '2500_zone_minutes':
      return totalZoneMinutes >= 2500;
    case '5000_zone_minutes':
      return totalZoneMinutes >= 5000;
    case '10000_zone_minutes':
      return totalZoneMinutes >= 10000;

    // ── MAF Test badges ──
    // These will be checked when MAF Test tagging is implemented.
    case 'first_maf_test':
    case 'maf_test_improved':
    case '3_consecutive_improvements':
    case '12_tests_12_months':
      return false;

    default:
      return false;
  }
}

// ─── Setup Badge ─────────────────────────────────────────────────────────────

/**
 * Award the "Committed" badge when settings are first saved.
 * Called from the settings PUT handler in worker index.
 */
export function checkSetupBadge(gameState: GameState): BadgeCheckResult {
  if (gameState.badges_earned.includes('committed')) {
    return { badges_earned: [], progress_updates: {}, total_points: 0 };
  }

  const badge = BADGES.find((b) => b.id === 'committed');
  if (!badge) return { badges_earned: [], progress_updates: {}, total_points: 0 };

  return {
    badges_earned: [badge],
    progress_updates: {},
    total_points: badge.points_reward,
  };
}

// ─── Consistency Badge Lookup ────────────────────────────────────────────────

/**
 * Get consistency badges that should be awarded for a given streak length.
 * Called by the streak engine after week-end evaluation.
 * Only returns badges not already earned.
 */
export function getConsistencyBadges(
  streakWeeks: number,
  targetMet: boolean,
  alreadyEarned: string[],
): BadgeDefinition[] {
  if (!targetMet) return [];

  const earnedSet = new Set(alreadyEarned);
  const newBadges: BadgeDefinition[] = [];

  const streakBadgeMap: Record<string, number> = {
    'full_week': 1,
    'two_week_fire': 2,
    'month_strong': 4,
    'eight_week_wall': 8,
    'the_commitment': 12,
    'half_year_club': 26,
  };

  for (const [badgeId, threshold] of Object.entries(streakBadgeMap)) {
    if (streakWeeks >= threshold && !earnedSet.has(badgeId)) {
      const badge = BADGES.find((b) => b.id === badgeId);
      if (badge) newBadges.push(badge);
    }
  }

  return newBadges;
}
