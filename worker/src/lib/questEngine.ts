// worker/src/lib/questEngine.ts
// Quest progression logic. Pure functions — no KV access, no side effects.

import type { MAFActivity } from './mafAnalysis';
import type { GameState, QuestId } from './gameTypes';
import { getQuestDef } from './gameTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestUpdate {
  quest_completed: QuestId | null;
  quest_xp: number;
  badge_earned: string | null;
  new_active_quest: QuestId | null;
  progress_update: Partial<Record<QuestId, number>>;
}

// ─── Quest Checker ────────────────────────────────────────────────────────────

/**
 * Check if the current run advances or completes the active quest.
 *
 * Quests are sequential — only the active quest can progress.
 * Returns what changed so the game state orchestrator can apply it.
 */
export function checkQuestProgress(
  activity: MAFActivity,
  gameState: GameState
): QuestUpdate {
  const noUpdate: QuestUpdate = {
    quest_completed: null,
    quest_xp: 0,
    badge_earned: null,
    new_active_quest: null,
    progress_update: {},
  };

  const activeQuestId = gameState.quest_active;
  if (!activeQuestId) return noUpdate;

  const quest = getQuestDef(activeQuestId);
  if (!quest) return noUpdate;

  const currentProgress = gameState.quest_progress[activeQuestId] || 0;
  const increment = getQuestIncrement(activeQuestId, activity, gameState);

  if (increment === 0) return noUpdate;

  const newProgress = currentProgress + increment;
  const completed = newProgress >= quest.target;

  return {
    quest_completed: completed ? activeQuestId : null,
    quest_xp: completed ? quest.xp_reward : 0,
    badge_earned: completed && quest.badge ? quest.badge : null,
    new_active_quest: completed ? quest.next : activeQuestId,
    progress_update: { [activeQuestId]: newProgress },
  };
}

// ─── Per-Quest Increment Logic ────────────────────────────────────────────────

/**
 * Determine how much progress this run adds to the given quest.
 * Returns 0 if the run doesn't count toward the quest.
 */
function getQuestIncrement(
  questId: QuestId,
  activity: MAFActivity,
  _gameState: GameState
): number {
  switch (questId) {
    case 'first_steps':
      // This quest is completed by configuring settings, not by running.
      // It's handled separately when settings are saved.
      return 0;

    case 'first_maf_run':
      // Complete 1 qualifying run
      return activity.qualifying ? 1 : 0;

    case 'finding_pace':
      // Complete a run with >70% zone time
      return activity.qualifying && activity.time_in_maf_zone_pct > 70 ? 1 : 0;

    case 'maf_five':
      // 5 qualifying runs (cumulative)
      return activity.qualifying ? 1 : 0;

    case 'first_full_week':
      // Hit weekly zone-minutes target — handled by streak engine,
      // not per-run. Return 0 here; the game state orchestrator
      // checks this after weekly evaluation.
      return 0;

    case 'warmup_pro':
      // 3 runs with warmup_score ≥ 80
      return activity.qualifying && activity.warmup_score >= 80 ? 1 : 0;

    case 'zone_locked':
      // 20+ continuous minutes in zone
      return activity.qualifying && activity.longest_zone_streak_minutes >= 20 ? 1 : 0;

    default:
      return 0;
  }
}

/**
 * Complete the 'first_steps' quest when settings are configured.
 * Called from the settings save handler, not from run processing.
 */
export function completeFirstStepsQuest(gameState: GameState): QuestUpdate {
  if (gameState.quest_active !== 'first_steps') {
    return {
      quest_completed: null,
      quest_xp: 0,
      badge_earned: null,
      new_active_quest: null,
      progress_update: {},
    };
  }

  const quest = getQuestDef('first_steps')!;
  return {
    quest_completed: 'first_steps',
    quest_xp: quest.xp_reward,
    badge_earned: quest.badge || null,
    new_active_quest: quest.next,
    progress_update: { first_steps: 1 },
  };
}
