// =============================================================================
// MAF Machine v2 — Quest & Milestone Engine
// =============================================================================
// Checks run results and game state against quest conditions and milestone
// thresholds. Returns what unlocked — does NOT mutate game state directly.
// The gameState orchestrator applies the results.
// =============================================================================

import type { MAFActivity } from './mafAnalysis'
import type {
  GameState,
  QuestId,
  QuestDefinition,
  MilestoneDefinition,
} from './gameTypes'
import { QUESTS, MILESTONES } from './gameTypes'

// -----------------------------------------------------------------------------
// Quest Engine
// -----------------------------------------------------------------------------

export interface QuestCheckResult {
  quest_completed: QuestId | null
  quest_xp: number
  quest_badge: string | null
  new_progress: Record<string, number>    // Updated progress counts
  next_quest: QuestId | null              // Quest to activate after completion
}

/**
 * Check if the current run (or action) advances the active quest.
 * Returns completion info and updated progress.
 *
 * Quest triggers:
 *   first_steps     → settings configured (called separately, not per-run)
 *   first_maf_run   → 1 qualifying run
 *   finding_pace    → 1 run with >70% zone time
 *   maf_five        → 5 qualifying runs within 10 days
 *   first_full_week → hit weekly zone-minutes target (called from weekly check)
 *   warmup_pro      → 3 runs with warmup_score ≥ 80
 *   zone_locked     → 20+ continuous minutes in zone
 */
export function checkQuestProgress(
  activity: MAFActivity,
  gameState: GameState,
  recentActivities: MAFActivity[]   // Last 10 days of activities, for maf_five check
): QuestCheckResult {
  const noResult: QuestCheckResult = {
    quest_completed: null,
    quest_xp: 0,
    quest_badge: null,
    new_progress: { ...gameState.quest_progress },
    next_quest: null,
  }

  if (!gameState.quest_active) return noResult

  const quest = QUESTS.find((q) => q.id === gameState.quest_active)
  if (!quest) return noResult

  // Already completed? Shouldn't happen, but guard against it
  if (gameState.quests_completed.includes(quest.id)) return noResult

  const progress = { ...gameState.quest_progress }
  let advanced = false

  switch (quest.id) {
    case 'first_steps':
      // This quest is completed via settings configuration, not per-run.
      // Handled by checkSettingsQuest() below.
      break

    case 'first_maf_run':
      if (activity.qualifying) {
        progress[quest.id] = (progress[quest.id] || 0) + 1
        advanced = true
      }
      break

    case 'finding_pace':
      if (activity.time_in_maf_zone_pct > 70) {
        progress[quest.id] = (progress[quest.id] || 0) + 1
        advanced = true
      }
      break

    case 'maf_five': {
      // Count qualifying runs in the last 10 days (including this one)
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
      const recentQualifying = recentActivities.filter(
        (a) => a.qualifying && new Date(a.date).getTime() >= tenDaysAgo
      )
      // Include current activity if qualifying and not already in the list
      let count = recentQualifying.length
      if (activity.qualifying && !recentQualifying.some((a) => a.id === activity.id)) {
        count++
      }
      progress[quest.id] = count
      advanced = count > (gameState.quest_progress[quest.id] || 0)
      break
    }

    case 'first_full_week':
      // Completed via weekly check, not per-run. See checkWeeklyQuest().
      break

    case 'warmup_pro':
      if (activity.warmup_score >= 80) {
        progress[quest.id] = (progress[quest.id] || 0) + 1
        advanced = true
      }
      break

    case 'zone_locked':
      if (activity.longest_zone_streak_minutes >= 20) {
        progress[quest.id] = (progress[quest.id] || 0) + 1
        advanced = true
      }
      break
  }

  // Check if quest is now complete
  const currentProgress = progress[quest.id] || 0
  if (currentProgress >= quest.target) {
    const nextQuest = getNextQuest(quest.id, gameState.quests_completed)
    return {
      quest_completed: quest.id,
      quest_xp: quest.xp_reward,
      quest_badge: quest.badge,
      new_progress: progress,
      next_quest: nextQuest,
    }
  }

  return {
    quest_completed: null,
    quest_xp: 0,
    quest_badge: null,
    new_progress: progress,
    next_quest: null,
  }
}

/**
 * Check the 'first_steps' quest — triggered when user configures MAF settings.
 * Call this from the settings save handler.
 */
export function checkSettingsQuest(gameState: GameState): QuestCheckResult {
  const noResult: QuestCheckResult = {
    quest_completed: null,
    quest_xp: 0,
    quest_badge: null,
    new_progress: { ...gameState.quest_progress },
    next_quest: null,
  }

  if (gameState.quest_active !== 'first_steps') return noResult
  if (gameState.quests_completed.includes('first_steps')) return noResult

  const quest = QUESTS.find((q) => q.id === 'first_steps')!
  const progress = { ...gameState.quest_progress }
  progress['first_steps'] = 1

  const nextQuest = getNextQuest('first_steps', gameState.quests_completed)

  return {
    quest_completed: 'first_steps',
    quest_xp: quest.xp_reward,
    quest_badge: quest.badge,
    new_progress: progress,
    next_quest: nextQuest,
  }
}

/**
 * Check the 'first_full_week' quest — triggered when weekly target is met.
 * Call this from the weekly finalization logic.
 */
export function checkWeeklyQuest(
  weeklyTargetMet: boolean,
  gameState: GameState
): QuestCheckResult {
  const noResult: QuestCheckResult = {
    quest_completed: null,
    quest_xp: 0,
    quest_badge: null,
    new_progress: { ...gameState.quest_progress },
    next_quest: null,
  }

  if (gameState.quest_active !== 'first_full_week') return noResult
  if (!weeklyTargetMet) return noResult
  if (gameState.quests_completed.includes('first_full_week')) return noResult

  const quest = QUESTS.find((q) => q.id === 'first_full_week')!
  const progress = { ...gameState.quest_progress }
  progress['first_full_week'] = 1

  const nextQuest = getNextQuest('first_full_week', gameState.quests_completed)

  return {
    quest_completed: 'first_full_week',
    quest_xp: quest.xp_reward,
    quest_badge: quest.badge,
    new_progress: progress,
    next_quest: nextQuest,
  }
}

/** Find the next quest in the chain after completing one */
function getNextQuest(completedId: QuestId, alreadyCompleted: QuestId[]): QuestId | null {
  const completed = QUESTS.find((q) => q.id === completedId)
  if (!completed) return null

  const allCompleted = [...alreadyCompleted, completedId]
  const next = QUESTS
    .filter((q) => !allCompleted.includes(q.id))
    .sort((a, b) => a.order - b.order)

  return next.length > 0 ? next[0].id : null
}

// -----------------------------------------------------------------------------
// Milestone Engine
// -----------------------------------------------------------------------------

export interface MilestoneCheckResult {
  unlocked: MilestoneDefinition[]
  total_xp: number
  badges: string[]
}

/**
 * Check all milestones against current lifetime stats.
 * Returns only newly unlocked milestones (not already in game state).
 */
export function checkMilestones(
  activity: MAFActivity,
  gameState: GameState
): MilestoneCheckResult {
  const alreadyUnlocked = new Set(gameState.milestones_unlocked)
  const unlocked: MilestoneDefinition[] = []

  // Current lifetime stats (including this run)
  const lifetimeZoneMinutes = gameState.lifetime_zone_minutes + activity.zone_minutes
  const lifetimeQualifyingRuns = gameState.lifetime_qualifying_runs + (activity.qualifying ? 1 : 0)
  const currentStreak = gameState.streak.current_weeks
  const durationMinutes = activity.duration_seconds / 60

  for (const milestone of MILESTONES) {
    if (alreadyUnlocked.has(milestone.id)) continue

    let triggered = false

    switch (milestone.category) {
      case 'zone_minutes':
        triggered = lifetimeZoneMinutes >= milestone.threshold
        break

      case 'run_count':
        triggered = lifetimeQualifyingRuns >= milestone.threshold
        break

      case 'streak':
        triggered = currentStreak >= milestone.threshold
        break

      case 'efficiency':
        // Threshold is the decoupling % to get BELOW
        if (activity.aerobic_decoupling !== null && activity.qualifying) {
          triggered = activity.aerobic_decoupling < milestone.threshold
        }
        break

      case 'long_run':
        // Threshold is duration in minutes
        if (activity.qualifying) {
          triggered = durationMinutes >= milestone.threshold
        }
        break

      case 'pace_progress':
        // Handled by MAF Test feature (Phase 4), not here
        break
    }

    if (triggered) {
      unlocked.push(milestone)
    }
  }

  return {
    unlocked,
    total_xp: unlocked.reduce((sum, m) => sum + m.xp_reward, 0),
    badges: unlocked.map((m) => m.badge),
  }
}
