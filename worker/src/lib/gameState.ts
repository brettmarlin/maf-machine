// worker/src/lib/gameState.ts
// Game state orchestrator — the glue between all engines.
// This is the only module that reads/writes to KV for game data.

import type { MAFActivity, UserSettings } from './mafAnalysis';
import type {
  GameState,
  WeeklyRecord,
  RunXPResult,
  BadgeDefinition,
} from './gameTypes';
import {
  createInitialGameState,
  getLevelFromXP,
  getXPToNextLevel,
  getLevelProgressPct,
  getStreakMultiplier,
  getISOWeek,
  getISOWeekInTimezone,
  getPreviousISOWeek,
  BADGES,
  LEVEL_TABLE,
} from './gameTypes';
import { calculateRunXP } from './xpEngine';
import { detectSurpriseBonuses } from './xpEngine';
import type { SurpriseBonus } from './xpEngine';
import { checkBadges, checkSetupBadge, getConsistencyBadges } from './badgeEngine';
import type { BadgeCheckResult } from './badgeEngine';
import {
  updateWeeklyProgress,
  evaluateWeekEnd,
  getPendingWeekEvaluation,
} from './streakEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessRunResult {
  xp_earned: number;
  xp_breakdown: RunXPResult;
  streak_multiplier: number;
  badges_earned: BadgeDefinition[];
  surprise_bonuses: SurpriseBonus[];
  weekly_bonus_xp: number;
  level_before: number;
  level_after: number;
  game_state: GameState;
}

export interface NextStep {
  priority: 'streak' | 'badge' | 'level' | 'weekly' | 'encouragement';
  message: string;
  detail?: string;
}

export interface GameAPIResponse {
  // Level (no XP numbers exposed)
  level: number;
  level_name: string;
  level_progress_pct: number;          // 0-100 progress toward next level
  next_level_name: string | null;

  // Streak
  streak: {
    current: number;
    longest: number;
    frozen: boolean;
  };

  // Weekly
  weekly: {
    zone_minutes: number;
    target: number;
    runs: number;
    qualifying_runs: number;
    days_left: number;
  };

  // Badges
  badges_earned: string[];              // Badge IDs
  badges_recent: string[];              // Last 3 badge IDs (for display)

  // Next step
  next_step: NextStep;

  // Lifetime stats
  total_zone_minutes: number;
  total_qualifying_runs: number;
  lifetime_total_runs: number;

  // Onboarding
  backfill_complete: boolean;

  // v1 compat (GameCard.tsx still uses these until Step 7)
  xp_total: number;
  xp_to_next_level: number;
  quest_active: {
    id: string;
    name: string;
    progress: number;
    target: number;
  } | null;
  recent_milestones: string[];
  badges: string[];
}

// ─── KV Operations ────────────────────────────────────────────────────────────

const MAX_WEEKLY_HISTORY = 52;

export async function loadGameState(
  kv: KVNamespace,
  athleteId: string,
): Promise<GameState> {
  const raw = await kv.get(`${athleteId}:game`);
  if (!raw) return createInitialGameState();

  try {
    const initial = createInitialGameState();
    const loaded = JSON.parse(raw);
    return { ...initial, ...loaded } as GameState;
  } catch {
    return createInitialGameState();
  }
}

export async function saveGameState(
  kv: KVNamespace,
  athleteId: string,
  state: GameState,
): Promise<void> {
  // Trim weekly history to last 52 weeks
  if (state.weekly_history.length > MAX_WEEKLY_HISTORY) {
    state.weekly_history = state.weekly_history
      .sort((a, b) => b.week.localeCompare(a.week))
      .slice(0, MAX_WEEKLY_HISTORY);
  }

  state.updated_at = new Date().toISOString();
  await kv.put(`${athleteId}:game`, JSON.stringify(state));
}

// ─── Process New Run ──────────────────────────────────────────────────────────

/**
 * Process a new run through the full v2 game pipeline:
 * 1. Calculate base points
 * 2. Update weekly progress
 * 3. Evaluate prior week (streak + weekly bonuses + consistency badges)
 * 4. Check badge triggers
 * 5. Detect surprise bonuses (personal records)
 * 6. Apply streak multiplier
 * 7. Update personal records
 * 8. Save game state
 */
export async function processNewRun(
  kv: KVNamespace,
  athleteId: string,
  activity: MAFActivity,
  settings: UserSettings,
): Promise<ProcessRunResult> {
  const state = await loadGameState(kv, athleteId);
  const levelBefore = getLevelFromXP(state.xp_total).level;

  // Track last run date for comeback detection
  const lastRunDate = state.updated_at || null;

  // 1. Calculate base points
  const xpResult = calculateRunXP(activity);
  let weeklyBonusXP = 0;
  const allBadgesEarned: BadgeDefinition[] = [];

  // 2. Update weekly progress
  const tz = settings.timezone || 'America/New_York';
  const weeklyUpdate = updateWeeklyProgress(activity, state, settings.maf_hr, tz);

  // 3. Check if prior week needs evaluation BEFORE adding current week to history
  const pendingWeek = getPendingWeekEvaluation(weeklyUpdate.week, state);

  // Apply weekly update to state
  if (weeklyUpdate.is_new_week) {
    state.weekly_history.push(weeklyUpdate.record);
  } else {
    const idx = state.weekly_history.findIndex((w) => w.week === weeklyUpdate.week);
    if (idx >= 0) {
      state.weekly_history[idx] = weeklyUpdate.record;
    }
  }

  // Evaluate prior week if this is a new week
  if (weeklyUpdate.is_new_week && pendingWeek && pendingWeek !== weeklyUpdate.week) {
    const currentWeek = weeklyUpdate.week;
    const prevWeek = getPreviousISOWeek(currentWeek);

    // Step 1: Evaluate the most recent completed week (bonus XP, badges)
    const priorRecord = state.weekly_history.find((w) => w.week === pendingWeek);
    if (priorRecord) {
      const weekResult = evaluateWeekEnd(priorRecord, state);
      weeklyBonusXP = weekResult.weekly_bonus_xp;

      state.streak_current_weeks = weekResult.new_streak_weeks;
      state.streak_longest = weekResult.new_streak_longest;
      state.streak.current_weeks = weekResult.new_streak_weeks;
      state.streak.longest_ever = weekResult.new_streak_longest;
      state.streak.frozen = weekResult.frozen;

      if (weekResult.target_met) {
        state.streak_last_qualified_week = pendingWeek;
        state.streak.last_qualified_week = pendingWeek;
      }

      // Consistency badges from streak milestones
      for (const badgeId of weekResult.consistency_badge_ids) {
        if (!state.badges_earned.includes(badgeId)) {
          state.badges_earned.push(badgeId);
          const badge = BADGES.find((b) => b.id === badgeId);
          if (badge) allBadgesEarned.push(badge);
        }
      }

      priorRecord.xp_earned += weeklyBonusXP;
    }

    // Step 2: Gap detection — if the evaluated week isn't the immediate
    // previous week, there were empty weeks with no runs → reset streak
    if (pendingWeek < prevWeek) {
      state.streak_current_weeks = 0;
      state.streak.current_weeks = 0;
      state.streak.frozen = false;
    }
  }

  // 4. Check badge triggers
  const badgeResult = checkBadges(activity, state);
  for (const badge of badgeResult.badges_earned) {
    if (!state.badges_earned.includes(badge.id)) {
      state.badges_earned.push(badge.id);
      allBadgesEarned.push(badge);
    }
  }
  Object.assign(state.badges_progress, badgeResult.progress_updates);

  // 5. Detect surprise bonuses
  const surpriseBonuses = detectSurpriseBonuses(activity, state.personal_records, lastRunDate);

  // 6. Apply streak multiplier to run points
  const streakMultiplier = getStreakMultiplier(state.streak_current_weeks);
  const multipliedRunXP = Math.floor(xpResult.total_xp * streakMultiplier);

  // 7. Sum all points
  const badgePoints = badgeResult.total_points +
    allBadgesEarned.filter((b) => !badgeResult.badges_earned.includes(b)).reduce((s, b) => s + b.points_reward, 0);
  const surprisePoints = surpriseBonuses.reduce((s, b) => s + b.points, 0);
  const grandTotalXP = multipliedRunXP + badgePoints + surprisePoints + weeklyBonusXP;
  state.xp_total += grandTotalXP;

  // Update weekly record XP
  const currentWeekRecord = state.weekly_history.find((w) => w.week === weeklyUpdate.week);
  if (currentWeekRecord) {
    currentWeekRecord.xp_earned += multipliedRunXP;
  }

  // 8. Update personal records
  if (activity.longest_zone_streak_minutes > state.personal_records.longest_zone_streak_minutes) {
    state.personal_records.longest_zone_streak_minutes = activity.longest_zone_streak_minutes;
  }
  if (
    activity.cardiac_drift !== null &&
    activity.cardiac_drift >= 0 &&
    activity.qualifying &&
    (state.personal_records.best_cardiac_drift === null || activity.cardiac_drift < state.personal_records.best_cardiac_drift)
  ) {
    state.personal_records.best_cardiac_drift = activity.cardiac_drift;
  }
  if (activity.warmup_score > state.personal_records.best_warmup_score) {
    state.personal_records.best_warmup_score = activity.warmup_score;
  }

  // Lifetime stats (both v1 and v2 fields)
  state.total_zone_minutes += activity.zone_minutes;
  state.lifetime_zone_minutes += activity.zone_minutes;
  state.lifetime_total_runs += 1;
  if (activity.qualifying) {
    state.total_qualifying_runs += 1;
    state.lifetime_qualifying_runs += 1;
  }

  // Save
  await saveGameState(kv, athleteId, state);

  const levelAfter = getLevelFromXP(state.xp_total).level;

  return {
    xp_earned: grandTotalXP,
    xp_breakdown: xpResult,
    streak_multiplier: streakMultiplier,
    badges_earned: allBadgesEarned,
    surprise_bonuses: surpriseBonuses,
    weekly_bonus_xp: weeklyBonusXP,
    level_before: levelBefore,
    level_after: levelAfter,
    game_state: state,
  };
}

// ─── Settings Badge Trigger ──────────────────────────────────────────────────

/**
 * Called when settings are saved. Awards "Committed" badge if not already earned.
 */
export async function onSettingsSaved(
  kv: KVNamespace,
  athleteId: string,
): Promise<BadgeCheckResult> {
  const state = await loadGameState(kv, athleteId);
  const badgeResult = checkSetupBadge(state);

  if (badgeResult.badges_earned.length > 0) {
    for (const badge of badgeResult.badges_earned) {
      if (!state.badges_earned.includes(badge.id)) {
        state.badges_earned.push(badge.id);
      }
    }
    state.xp_total += badgeResult.total_points;

    // Also complete old first_steps quest for backward compat
    if (state.quest_active === 'first_steps') {
      state.quests_completed.push('first_steps');
      state.quest_active = 'first_maf_run';
      state.quest_progress = { first_steps: 1 };
      state.badges.push('🏃');
      state.xp_total += 50;
    }

    await saveGameState(kv, athleteId, state);
  }

  return badgeResult;
}

// ─── Next Step Engine ────────────────────────────────────────────────────────

/**
 * Determine the single most important next action for the runner.
 * Priority: streak protection > badge within reach > level progress > weekly target > encouragement
 */
export function buildNextStep(state: GameState, settings?: { maf_hr?: number; timezone?: string }): NextStep {
  // Priority 0: First run — brand new runner
  if (state.lifetime_total_runs === 0) {
    const ceiling = settings?.maf_hr;
    return {
      priority: 'encouragement',
      message: ceiling
        ? `Go for your first MAF run. Keep your heart rate under ${ceiling} bpm.`
        : 'Go for your first MAF run.',
      detail: 'Walk if you need to — that counts.',
    };
  }

  const tz = settings?.timezone || 'America/New_York';
  const now = new Date();
  const currentWeek = getISOWeekInTimezone(now, tz);
  const currentWeekRecord = state.weekly_history.find((w) => w.week === currentWeek);
  const weeklyZoneMinutes = currentWeekRecord?.zone_minutes || 0;
  const weeklyTarget = state.weekly_target_zone_minutes;
  const minutesRemaining = Math.max(0, weeklyTarget - weeklyZoneMinutes);

  const dayOfWeek = now.getDay();
  const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  // Priority 1: Streak protection
  if (state.streak_current_weeks > 0 && minutesRemaining > 0) {
    if (daysLeft <= 2) {
      return {
        priority: 'streak',
        message: `${Math.ceil(minutesRemaining)} min to go — run ${daysLeft === 0 ? 'today' : 'tomorrow'} to keep the fire alive`,
        detail: `${state.streak_current_weeks}-week streak at risk`,
      };
    }
    return {
      priority: 'streak',
      message: `${Math.ceil(minutesRemaining)} minutes to go this week`,
      detail: `One more run keeps your ${state.streak_current_weeks}-week streak alive`,
    };
  }

  // Priority 2: Badge within reach
  const nextBadge = getNextAchievableBadge(state);
  if (nextBadge) {
    return {
      priority: 'badge',
      message: nextBadge.message,
      detail: nextBadge.detail,
    };
  }

  // Priority 3: Level within 10%
  const levelPct = getLevelProgressPct(state.xp_total);
  if (levelPct >= 90) {
    const nextLevelIdx = LEVEL_TABLE.findIndex((l) => l.xp_required > state.xp_total);
    const nextLevelName = nextLevelIdx >= 0 ? LEVEL_TABLE[nextLevelIdx].name : null;
    if (nextLevelName) {
      return {
        priority: 'level',
        message: `Almost there — a few more runs to ${nextLevelName}`,
        detail: `${Math.round(levelPct)}% of the way`,
      };
    }
  }

  // Priority 4: Weekly target progress
  if (minutesRemaining > 0) {
    const runsEstimate = Math.ceil(minutesRemaining / 30);
    return {
      priority: 'weekly',
      message: `${Math.round(weeklyZoneMinutes)} / ${weeklyTarget} minutes this week`,
      detail: runsEstimate === 1
        ? 'One solid run wraps it up'
        : `${runsEstimate} runs to hit your target`,
    };
  }

  // Priority 5: General encouragement (target already met this week)
  if (state.streak_current_weeks === 0 && weeklyZoneMinutes >= weeklyTarget) {
    return {
      priority: 'encouragement',
      message: "Target hit! Keep going to start a streak",
      detail: 'Hit your target again next week for a 1-week streak',
    };
  }

  return {
    priority: 'encouragement',
    message: 'Great week. Keep the momentum going.',
    detail: 'Your next run adds to a strong foundation',
  };
}

/**
 * Find the next badge the runner is closest to earning.
 */
function getNextAchievableBadge(state: GameState): { message: string; detail: string } | null {
  const earned = new Set(state.badges_earned);

  // First run badges: check run count
  const runCount = state.lifetime_total_runs;
  const firstRunBadges: { id: string; runsNeeded: number; name: string }[] = [
    { id: 'first_spark', runsNeeded: 1, name: 'First Spark' },
    { id: 'took_initiative', runsNeeded: 2, name: 'Took the Initiative' },
    { id: 'three_for_three', runsNeeded: 3, name: 'Three for Three' },
    { id: 'showing_up', runsNeeded: 4, name: 'Showing Up' },
    { id: 'first_five', runsNeeded: 5, name: 'First Five' },
  ];
  for (const fb of firstRunBadges) {
    if (!earned.has(fb.id) && runCount < fb.runsNeeded) {
      const diff = fb.runsNeeded - runCount;
      return {
        message: diff === 1
          ? `One more run earns ${fb.name}`
          : `${diff} more runs to ${fb.name}`,
        detail: BADGES.find((b) => b.id === fb.id)?.icon || '',
      };
    }
  }

  // Discipline badges
  if (!earned.has('patience_practice')) {
    const progress = state.badges_progress['patience_practice'] || 0;
    if (progress > 0 && progress < 3) {
      const remaining = 3 - progress;
      return {
        message: `${remaining} more run${remaining === 1 ? '' : 's'} with warmup score ≥ 80 earns Patience Practice`,
        detail: '🧘',
      };
    }
  }

  // Volume badges
  const volumeThresholds: { id: string; threshold: number; name: string }[] = [
    { id: 'seedling', threshold: 100, name: 'Seedling' },
    { id: 'taking_root', threshold: 500, name: 'Taking Root' },
    { id: 'deep_roots', threshold: 1000, name: 'Deep Roots' },
    { id: 'summit_seeker', threshold: 2500, name: 'Summit Seeker' },
    { id: 'bonfire', threshold: 5000, name: 'Bonfire' },
    { id: 'eternal_flame', threshold: 10000, name: 'Eternal Flame' },
  ];
  for (const vb of volumeThresholds) {
    if (!earned.has(vb.id)) {
      const remaining = vb.threshold - state.lifetime_zone_minutes;
      if (remaining > 0 && remaining <= vb.threshold * 0.15) {
        return {
          message: `${Math.ceil(remaining)} more zone minutes to ${vb.name}`,
          detail: BADGES.find((b) => b.id === vb.id)?.icon || '',
        };
      }
      break; // Only show the next unearned volume badge
    }
  }

  return null;
}

// ─── API Response Builder ────────────────────────────────────────────────────

export function buildGameAPIResponse(state: GameState, settings?: { maf_hr?: number; timezone?: string }): GameAPIResponse {
  const level = getLevelFromXP(state.xp_total);
  const xpToNext = getXPToNextLevel(state.xp_total);
  const levelPct = getLevelProgressPct(state.xp_total);
  const nextLevelIdx = LEVEL_TABLE.findIndex((l) => l.xp_required > state.xp_total);
  const nextLevelName = nextLevelIdx >= 0 ? LEVEL_TABLE[nextLevelIdx].name : null;

  // Current week info
  const tz = settings?.timezone || 'America/New_York';
  const now = new Date();
  const currentWeek = getISOWeekInTimezone(now, tz);
  const currentWeekRecord = state.weekly_history.find((w) => w.week === currentWeek);

  // Days left in week (week starts Monday)
  const dayOfWeek = now.getDay();
  const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  // Recent badges (last 3)
  const badgesRecent = (state.badges_earned || []).slice(-3);

  // Next step
  const nextStep = buildNextStep(state, settings);

  return {
    // v2 fields
    level: level.level,
    level_name: level.name,
    level_progress_pct: Math.round(levelPct),
    next_level_name: nextLevelName,
    streak: {
      current: state.streak_current_weeks || 0,
      longest: state.streak_longest || 0,
      frozen: state.streak?.frozen || false,
    },
    weekly: {
      zone_minutes: currentWeekRecord?.zone_minutes || 0,
      target: state.weekly_target_zone_minutes,
      runs: currentWeekRecord?.runs || 0,
      qualifying_runs: currentWeekRecord?.qualifying_runs || 0,
      days_left: daysLeft,
    },
    badges_earned: state.badges_earned || [],
    badges_recent: badgesRecent,
    next_step: nextStep,
    total_zone_minutes: state.total_zone_minutes || state.lifetime_zone_minutes || 0,
    total_qualifying_runs: state.total_qualifying_runs || state.lifetime_qualifying_runs || 0,
    lifetime_total_runs: state.lifetime_total_runs || 0,
    backfill_complete: state.backfill_complete ?? true,  // default true for existing users

    // v1 compat
    xp_total: state.xp_total,
    xp_to_next_level: xpToNext,
    quest_active: null,
    recent_milestones: [],
    badges: state.badges || [],
  };
}
