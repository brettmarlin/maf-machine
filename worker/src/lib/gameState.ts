// worker/src/lib/gameState.ts
// Game state orchestrator — the glue between all engines.
// This is the only module that reads/writes to KV for game data.

import type { MAFActivity, UserSettings } from './mafAnalysis';
import type {
  GameState,
  WeeklyRecord,
  QuestId,
  RunXPResult,
} from './gameTypes';
import {
  createInitialGameState,
  getLevelFromXP,
  getXPToNextLevel,
  getStreakMultiplier,
  getISOWeek,
  getQuestDef,
  MILESTONES,
} from './gameTypes';
import { calculateRunXP } from './xpEngine';
import { checkQuestProgress, completeFirstStepsQuest } from './questEngine';
import type { QuestUpdate } from './questEngine';
import {
  updateWeeklyProgress,
  evaluateWeekEnd,
  getPendingWeekEvaluation,
} from './streakEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessRunResult {
  xp_earned: number;           // after streak multiplier
  xp_breakdown: RunXPResult;
  streak_multiplier: number;
  milestones_unlocked: string[];
  quest_completed: QuestId | null;
  quest_xp: number;
  weekly_bonus_xp: number;
  level_before: number;
  level_after: number;
  game_state: GameState;
}

export interface GameAPIResponse {
  xp_total: number;
  level: number;
  level_name: string;
  xp_to_next_level: number;
  streak: {
    current: number;
    longest: number;
    multiplier: number;
  };
  weekly: {
    zone_minutes: number;
    target: number;
    runs: number;
    qualifying_runs: number;
    days_left: number;
  };
  quest_active: {
    id: string;
    name: string;
    progress: number;
    target: number;
  } | null;
  recent_milestones: string[];
  badges: string[];
  total_zone_minutes: number;
  total_qualifying_runs: number;
}

// ─── KV Operations ────────────────────────────────────────────────────────────

const MAX_WEEKLY_HISTORY = 52;

export async function loadGameState(
  kv: KVNamespace,
  athleteId: string
): Promise<GameState> {
  const raw = await kv.get(`${athleteId}:game`);
  if (!raw) return createInitialGameState();

  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return createInitialGameState();
  }
}

export async function saveGameState(
  kv: KVNamespace,
  athleteId: string,
  state: GameState
): Promise<void> {
  // Trim weekly history to last 52 weeks
  if (state.weekly_history.length > MAX_WEEKLY_HISTORY) {
    state.weekly_history = state.weekly_history
      .sort((a, b) => b.week.localeCompare(a.week))
      .slice(0, MAX_WEEKLY_HISTORY);
  }

  await kv.put(`${athleteId}:game`, JSON.stringify(state));
}

// ─── Process New Run ──────────────────────────────────────────────────────────

/**
 * Process a new run through the full game pipeline:
 * 1. Calculate XP
 * 2. Update weekly progress
 * 3. Evaluate prior week if needed (streak + weekly bonuses)
 * 4. Check quest progress
 * 5. Check milestone unlocks
 * 6. Apply streak multiplier
 * 7. Update and save game state
 */
export async function processNewRun(
  kv: KVNamespace,
  athleteId: string,
  activity: MAFActivity,
  settings: UserSettings
): Promise<ProcessRunResult> {
  const state = await loadGameState(kv, athleteId);
  const levelBefore = getLevelFromXP(state.xp_total).level;

  // 1. Calculate base XP
  const xpResult = calculateRunXP(activity);
  let totalXPEarned = xpResult.total_xp;
  let weeklyBonusXP = 0;

  // 2. Update weekly progress
  const weeklyUpdate = updateWeeklyProgress(activity, state, settings.maf_zone_high);

  // Apply weekly update to state
  if (weeklyUpdate.is_new_week) {
    state.weekly_history.push(weeklyUpdate.record);
  } else {
    const idx = state.weekly_history.findIndex((w) => w.week === weeklyUpdate.week);
    if (idx >= 0) {
      state.weekly_history[idx] = weeklyUpdate.record;
    }
  }

  // 3. Evaluate prior week if this run starts a new week
  const pendingWeek = getPendingWeekEvaluation(weeklyUpdate.week, state);
  if (pendingWeek && pendingWeek !== weeklyUpdate.week) {
    const priorRecord = state.weekly_history.find((w) => w.week === pendingWeek);
    if (priorRecord) {
      const weekResult = evaluateWeekEnd(priorRecord, state);

      weeklyBonusXP = weekResult.weekly_bonus_xp;
      state.streak_current_weeks = weekResult.new_streak_weeks;
      state.streak_longest = weekResult.new_streak_longest;

      if (weekResult.target_met) {
        state.streak_last_qualified_week = pendingWeek;
      }

      // Update the prior week's record with XP earned
      priorRecord.xp_earned += weeklyBonusXP;

      // Check first_full_week quest
      if (weekResult.target_met && state.quest_active === 'first_full_week') {
        const questProgress = state.quest_progress['first_full_week'] || 0;
        state.quest_progress['first_full_week'] = questProgress + 1;
      }
    }
  }

  // 4. Apply streak multiplier to run XP
  const streakMultiplier = getStreakMultiplier(state.streak_current_weeks);
  const multipliedRunXP = Math.floor(totalXPEarned * streakMultiplier);

  // 5. Check quest progress
  const questUpdate = checkQuestProgress(activity, state);

  // 6. Check milestone unlocks
  const newMilestones = checkMilestones(activity, state);

  // 7. Apply all updates to state

  // XP: run XP (multiplied) + quest XP + weekly bonus + milestone XP
  let milestoneXP = 0;
  for (const m of newMilestones) {
    const def = MILESTONES.find((md) => md.id === m);
    if (def) milestoneXP += def.xp_reward;
  }

  const grandTotalXP = multipliedRunXP + questUpdate.quest_xp + weeklyBonusXP + milestoneXP;
  state.xp_total += grandTotalXP;

  // Update weekly record XP
  const currentWeekRecord = state.weekly_history.find((w) => w.week === weeklyUpdate.week);
  if (currentWeekRecord) {
    currentWeekRecord.xp_earned += multipliedRunXP;
  }

  // Lifetime stats
  state.total_zone_minutes += activity.zone_minutes;
  if (activity.qualifying) {
    state.total_qualifying_runs += 1;
  }

  // Quest state
  if (questUpdate.quest_completed) {
    state.quests_completed.push(questUpdate.quest_completed);
  }
  if (questUpdate.new_active_quest !== null) {
    state.quest_active = questUpdate.new_active_quest;
  } else if (questUpdate.quest_completed) {
    // Quest chain ended
    state.quest_active = null;
  }
  Object.assign(state.quest_progress, questUpdate.progress_update);

  // Badges from quest
  if (questUpdate.badge_earned) {
    state.badges.push(questUpdate.badge_earned);
  }

  // Milestones
  for (const m of newMilestones) {
    state.milestones.push(m);
    const def = MILESTONES.find((md) => md.id === m);
    if (def?.badge) {
      state.badges.push(def.badge);
    }
  }

  // Deduplicate badges
  state.badges = [...new Set(state.badges)];

  // Save
  await saveGameState(kv, athleteId, state);

  const levelAfter = getLevelFromXP(state.xp_total).level;

  return {
    xp_earned: grandTotalXP,
    xp_breakdown: xpResult,
    streak_multiplier: streakMultiplier,
    milestones_unlocked: newMilestones,
    quest_completed: questUpdate.quest_completed,
    quest_xp: questUpdate.quest_xp,
    weekly_bonus_xp: weeklyBonusXP,
    level_before: levelBefore,
    level_after: levelAfter,
    game_state: state,
  };
}

// ─── Milestone Checking ───────────────────────────────────────────────────────

function checkMilestones(
  activity: MAFActivity,
  state: GameState
): string[] {
  const unlocked: string[] = [];

  // We check against the state BEFORE this run's stats are added,
  // but we need to include this run's contribution.
  const projectedZoneMinutes = state.total_zone_minutes + activity.zone_minutes;
  const projectedQualifyingRuns = state.total_qualifying_runs + (activity.qualifying ? 1 : 0);
  const durationMinutes = activity.duration_seconds / 60;

  for (const m of MILESTONES) {
    // Skip already unlocked
    if (state.milestones.includes(m.id)) continue;

    let earned = false;

    switch (m.category) {
      case 'zone_minutes':
        earned = projectedZoneMinutes >= m.threshold;
        break;

      case 'run_count':
        earned = projectedQualifyingRuns >= m.threshold;
        break;

      case 'streak':
        earned = state.streak_current_weeks >= m.threshold;
        break;

      case 'decoupling':
        // Threshold is the % to be UNDER (e.g., 5 means < 5%)
        earned = activity.qualifying
          && activity.aerobic_decoupling !== null
          && Math.abs(activity.aerobic_decoupling) < m.threshold;
        break;

      case 'long_run':
        earned = activity.qualifying && durationMinutes >= m.threshold;
        break;
    }

    if (earned) {
      unlocked.push(m.id);
    }
  }

  return unlocked;
}

// ─── Settings Quest Trigger ───────────────────────────────────────────────────

/**
 * Called when settings are saved. Completes the 'first_steps' quest if active.
 */
export async function onSettingsSaved(
  kv: KVNamespace,
  athleteId: string
): Promise<QuestUpdate> {
  const state = await loadGameState(kv, athleteId);
  const questUpdate = completeFirstStepsQuest(state);

  if (questUpdate.quest_completed) {
    state.quests_completed.push(questUpdate.quest_completed);
    state.quest_active = questUpdate.new_active_quest;
    Object.assign(state.quest_progress, questUpdate.progress_update);
    state.xp_total += questUpdate.quest_xp;
    if (questUpdate.badge_earned) {
      state.badges.push(questUpdate.badge_earned);
    }
    await saveGameState(kv, athleteId, state);
  }

  return questUpdate;
}

// ─── API Response Builder ─────────────────────────────────────────────────────

export function buildGameAPIResponse(state: GameState): GameAPIResponse {
  const level = getLevelFromXP(state.xp_total);
  const xpToNext = getXPToNextLevel(state.xp_total);
  const streakMultiplier = getStreakMultiplier(state.streak_current_weeks);

  // Current week info
  const now = new Date();
  const currentWeek = getISOWeek(now);
  const currentWeekRecord = state.weekly_history.find((w) => w.week === currentWeek);

  // Days left in week (week starts Monday)
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  // Active quest info
  let questActive: GameAPIResponse['quest_active'] = null;
  if (state.quest_active) {
    const def = getQuestDef(state.quest_active);
    if (def) {
      questActive = {
        id: def.id,
        name: def.name,
        progress: state.quest_progress[state.quest_active] || 0,
        target: def.target,
      };
    }
  }

  // Recent milestones (last 5)
  const recentMilestones = state.milestones.slice(-5);

  return {
    xp_total: state.xp_total,
    level: level.level,
    level_name: level.name,
    xp_to_next_level: xpToNext,
    streak: {
      current: state.streak_current_weeks,
      longest: state.streak_longest,
      multiplier: streakMultiplier,
    },
    weekly: {
      zone_minutes: currentWeekRecord?.zone_minutes || 0,
      target: state.weekly_target_zone_minutes,
      runs: currentWeekRecord?.runs || 0,
      qualifying_runs: currentWeekRecord?.qualifying_runs || 0,
      days_left: daysLeft,
    },
    quest_active: questActive,
    recent_milestones: recentMilestones,
    badges: state.badges,
    total_zone_minutes: state.total_zone_minutes,
    total_qualifying_runs: state.total_qualifying_runs,
  };
}
