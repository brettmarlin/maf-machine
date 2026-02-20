// =============================================================================
// MAF Machine v2 — Game State Orchestrator
// =============================================================================
// Single entry point for all game state mutations.
// Ties together: xpEngine, questEngine, streakEngine, mafAnalysis.
// Handles KV read/write for game state persistence.
//
// The webhook handler and API endpoints call into this module.
// All other game engines are pure — this is where side effects live.
// =============================================================================

import type { MAFActivity } from './mafAnalysis'
import { getISOWeek } from './mafAnalysis'
import type {
  GameState,
  WeeklyGoalState,
  WeeklyBonusResult,
  RunXPResult,
} from './gameTypes'
import {
  createInitialGameState,
  getLevelFromXP,
  getXPToNextLevel,
  getStreakMultiplier,
} from './gameTypes'
import { calculateRunXP, calculateWeeklyBonus } from './xpEngine'
import {
  checkQuestProgress,
  checkMilestones,
  checkWeeklyQuest,
  checkSettingsQuest,
} from './questEngine'
import type { QuestCheckResult, MilestoneCheckResult } from './questEngine'
import {
  buildWeeklyGoalState,
  evaluateStreak,
  weeksBetween,
} from './streakEngine'

// -----------------------------------------------------------------------------
// KV Interface
// -----------------------------------------------------------------------------

/** Minimal KV interface — works with Cloudflare KV or any compatible store */
interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

// -----------------------------------------------------------------------------
// Result Types
// -----------------------------------------------------------------------------

/** Everything that happened when a new run was processed */
export interface ProcessRunResult {
  xp: RunXPResult
  quest: QuestCheckResult
  milestones: MilestoneCheckResult
  weekly_bonus: WeeklyBonusResult | null    // Non-null if a week was finalized
  week_finalized: string | null
  level_up: boolean
  new_level: number | null
  new_level_name: string | null
  game_state: GameState                     // Updated state (already saved to KV)
}

// -----------------------------------------------------------------------------
// Load / Save Game State
// -----------------------------------------------------------------------------

export async function loadGameState(
  kv: KVNamespace,
  athleteId: string
): Promise<GameState> {
  const key = `${athleteId}:game`
  const raw = await kv.get(key)
  if (!raw) return createInitialGameState()

  try {
    return JSON.parse(raw) as GameState
  } catch {
    return createInitialGameState()
  }
}

export async function saveGameState(
  kv: KVNamespace,
  athleteId: string,
  state: GameState
): Promise<void> {
  const key = `${athleteId}:game`
  state.updated_at = new Date().toISOString()
  await kv.put(key, JSON.stringify(state))
}

// -----------------------------------------------------------------------------
// Process New Run (Main Entry Point)
// -----------------------------------------------------------------------------

/**
 * Process a new run through the entire game system.
 * Called by the webhook handler after analysis is complete.
 *
 * Flow:
 * 1. Calculate per-run XP
 * 2. Check for week transition → finalize previous week if needed
 * 3. Update current week tracking
 * 4. Check quest progress
 * 5. Check milestone unlocks
 * 6. Update lifetime stats, XP total, level
 * 7. Save to KV
 */
export async function processNewRun(
  kv: KVNamespace,
  athleteId: string,
  activity: MAFActivity,
  recentActivities: MAFActivity[],
  mafZoneHigh: number
): Promise<ProcessRunResult> {
  const state = await loadGameState(kv, athleteId)
  const previousLevel = state.level

  // ---- Step 1: Calculate per-run XP ----
  const xpResult = calculateRunXP(activity)

  // ---- Step 2: Check for week transition ----
  const activityWeek = getISOWeek(activity.date)
  let weeklyBonus: WeeklyBonusResult | null = null
  let weekFinalized: string | null = null

  const lastTrackedWeek = state.weekly_history.length > 0
    ? state.weekly_history[state.weekly_history.length - 1].week
    : null

  if (lastTrackedWeek && lastTrackedWeek !== activityWeek) {
    // A new week has started — finalize the previous week
    const result = finalizeWeek(state, lastTrackedWeek, activityWeek, mafZoneHigh)
    weeklyBonus = result.weeklyBonus
    weekFinalized = result.weekFinalized

    // Apply weekly bonus XP
    if (weeklyBonus) {
      state.xp_total += weeklyBonus.total

      // Update the finalized week's xp_earned
      const finalizedWeekEntry = state.weekly_history.find((w) => w.week === weekFinalized)
      if (finalizedWeekEntry) {
        finalizedWeekEntry.xp_earned += weeklyBonus.total
      }
    }
  }

  // ---- Step 3: Update current week tracking ----
  let currentWeekEntry = state.weekly_history.find((w) => w.week === activityWeek)
  if (!currentWeekEntry) {
    // First run of a new week
    currentWeekEntry = {
      week: activityWeek,
      zone_minutes: 0,
      target: state.weekly_target_zone_minutes,
      runs: 0,
      qualifying_runs: 0,
      target_met: false,
      pure_maf: true,
      xp_earned: 0,
    }
    state.weekly_history.push(currentWeekEntry)
  }

  currentWeekEntry.zone_minutes += activity.zone_minutes
  currentWeekEntry.zone_minutes = Math.round(currentWeekEntry.zone_minutes * 10) / 10
  currentWeekEntry.runs += 1
  if (activity.qualifying) currentWeekEntry.qualifying_runs += 1
  if (activity.avg_hr > mafZoneHigh + 5) currentWeekEntry.pure_maf = false
  currentWeekEntry.target_met = currentWeekEntry.zone_minutes >= currentWeekEntry.target
  currentWeekEntry.xp_earned += xpResult.base_xp

  // ---- Step 4: Check quest progress ----
  const questResult = checkQuestProgress(activity, state, recentActivities)
  applyQuestResult(state, questResult)

  // Also check weekly quest if target was just met this run
  if (currentWeekEntry.target_met && state.quest_active === 'first_full_week') {
    const weeklyQuestResult = checkWeeklyQuest(true, state)
    applyQuestResult(state, weeklyQuestResult)
  }

  // ---- Step 5: Check milestones ----
  const milestoneResult = checkMilestones(activity, state)
  applyMilestoneResult(state, milestoneResult)

  // ---- Step 6: Update lifetime stats, XP, level ----
  state.lifetime_zone_minutes += activity.zone_minutes
  state.lifetime_zone_minutes = Math.round(state.lifetime_zone_minutes * 10) / 10
  if (activity.qualifying) state.lifetime_qualifying_runs += 1

  // Add run XP + quest XP + milestone XP
  state.xp_total += xpResult.base_xp + questResult.quest_xp + milestoneResult.total_xp

  // Update level
  const levelInfo = getLevelFromXP(state.xp_total)
  state.level = levelInfo.level
  state.level_name = levelInfo.name

  const levelUp = state.level > previousLevel

  // Trim weekly history to last 52 weeks to prevent unbounded growth
  if (state.weekly_history.length > 52) {
    state.weekly_history = state.weekly_history.slice(-52)
  }

  // ---- Step 7: Save ----
  await saveGameState(kv, athleteId, state)

  return {
    xp: xpResult,
    quest: questResult,
    milestones: milestoneResult,
    weekly_bonus: weeklyBonus,
    week_finalized: weekFinalized,
    level_up: levelUp,
    new_level: levelUp ? state.level : null,
    new_level_name: levelUp ? state.level_name : null,
    game_state: state,
  }
}

// -----------------------------------------------------------------------------
// Week Finalization (Internal)
// -----------------------------------------------------------------------------

interface FinalizeWeekResult {
  weeklyBonus: WeeklyBonusResult | null
  weekFinalized: string | null
}

/**
 * Finalize a completed week: evaluate streak and calculate weekly bonus.
 * Mutates state in place (streak, weekly_history).
 */
function finalizeWeek(
  state: GameState,
  lastTrackedWeek: string,
  currentWeek: string,
  _mafZoneHigh: number
): FinalizeWeekResult {
  const previousWeekState = state.weekly_history.find((w) => w.week === lastTrackedWeek) || null
  const skippedWeeks = weeksBetween(lastTrackedWeek, currentWeek)

  // Evaluate streak
  const streakResult = evaluateStreak(currentWeek, previousWeekState, state.streak, skippedWeeks)
  state.streak = streakResult.new_streak

  // Calculate weekly bonus for the finalized week
  let weeklyBonus: WeeklyBonusResult | null = null
  if (previousWeekState) {
    weeklyBonus = calculateWeeklyBonus(previousWeekState, state.streak.current_weeks)
  }

  return {
    weeklyBonus,
    weekFinalized: streakResult.week_finalized,
  }
}

// -----------------------------------------------------------------------------
// Apply Quest & Milestone Results (Internal)
// -----------------------------------------------------------------------------

function applyQuestResult(state: GameState, result: QuestCheckResult): void {
  state.quest_progress = result.new_progress

  if (result.quest_completed) {
    state.quests_completed.push(result.quest_completed)
    state.quest_active = result.next_quest

    if (result.quest_badge) {
      state.badges.push(result.quest_badge)
    }
  }
}

function applyMilestoneResult(state: GameState, result: MilestoneCheckResult): void {
  for (const milestone of result.unlocked) {
    state.milestones_unlocked.push(milestone.id)
    state.badges.push(milestone.badge)
  }
}

// -----------------------------------------------------------------------------
// Settings Update Handler
// -----------------------------------------------------------------------------

/**
 * Handle settings update — checks first_steps quest and updates target.
 * Call this from PUT /api/settings.
 */
export async function handleSettingsUpdate(
  kv: KVNamespace,
  athleteId: string,
  weeklyTarget?: number,
  trainingStartDate?: string
): Promise<GameState> {
  const state = await loadGameState(kv, athleteId)

  // Check first_steps quest
  const questResult = checkSettingsQuest(state)
  applyQuestResult(state, questResult)
  if (questResult.quest_xp > 0) {
    state.xp_total += questResult.quest_xp
    const levelInfo = getLevelFromXP(state.xp_total)
    state.level = levelInfo.level
    state.level_name = levelInfo.name
  }

  // Update target if provided
  if (weeklyTarget !== undefined && weeklyTarget > 0) {
    state.weekly_target_zone_minutes = weeklyTarget
  }

  // Update training start date if provided
  if (trainingStartDate !== undefined) {
    state.training_start_date = trainingStartDate
  }

  await saveGameState(kv, athleteId, state)
  return state
}

// -----------------------------------------------------------------------------
// Undo Run (for activity deletion)
// -----------------------------------------------------------------------------

/**
 * Remove a run's contribution from game state.
 * Called when Strava sends a delete event.
 * 
 * Note: This is a best-effort reversal. Quest completions and milestones
 * are NOT reverted — they're considered permanently earned once triggered.
 * Only XP, zone minutes, and run counts are adjusted.
 */
export async function undoRun(
  kv: KVNamespace,
  athleteId: string,
  activity: MAFActivity
): Promise<GameState> {
  const state = await loadGameState(kv, athleteId)

  // Reverse XP
  const xpResult = calculateRunXP(activity)
  state.xp_total = Math.max(0, state.xp_total - xpResult.base_xp)

  // Reverse lifetime stats
  state.lifetime_zone_minutes = Math.max(0, state.lifetime_zone_minutes - activity.zone_minutes)
  if (activity.qualifying) {
    state.lifetime_qualifying_runs = Math.max(0, state.lifetime_qualifying_runs - 1)
  }

  // Reverse weekly tracking
  const activityWeek = getISOWeek(activity.date)
  const weekEntry = state.weekly_history.find((w) => w.week === activityWeek)
  if (weekEntry) {
    weekEntry.zone_minutes = Math.max(0, weekEntry.zone_minutes - activity.zone_minutes)
    weekEntry.runs = Math.max(0, weekEntry.runs - 1)
    if (activity.qualifying) {
      weekEntry.qualifying_runs = Math.max(0, weekEntry.qualifying_runs - 1)
    }
    weekEntry.target_met = weekEntry.zone_minutes >= weekEntry.target
    weekEntry.xp_earned = Math.max(0, weekEntry.xp_earned - xpResult.base_xp)
  }

  // Recalculate level
  const levelInfo = getLevelFromXP(state.xp_total)
  state.level = levelInfo.level
  state.level_name = levelInfo.name

  await saveGameState(kv, athleteId, state)
  return state
}

// -----------------------------------------------------------------------------
// API Response Helpers
// -----------------------------------------------------------------------------

/** Build the GET /api/game response payload */
export function buildGameAPIResponse(state: GameState) {
  const xpToNext = getXPToNextLevel(state.xp_total)
  const nextLevel = state.level < 10 ? state.level + 1 : null
  const currentWeek = state.weekly_history.length > 0
    ? state.weekly_history[state.weekly_history.length - 1]
    : null

  return {
    xp_total: state.xp_total,
    level: state.level,
    level_name: state.level_name,
    xp_to_next_level: xpToNext,
    next_level: nextLevel,
    streak: {
      current: state.streak.current_weeks,
      longest: state.streak.longest_ever,
      multiplier: getStreakMultiplier(state.streak.current_weeks),
      frozen: state.streak.frozen,
    },
    weekly: currentWeek
      ? {
          zone_minutes: currentWeek.zone_minutes,
          target: currentWeek.target,
          runs: currentWeek.runs,
          qualifying_runs: currentWeek.qualifying_runs,
          target_met: currentWeek.target_met,
          pure_maf: currentWeek.pure_maf,
        }
      : null,
    quest_active: state.quest_active
      ? {
          id: state.quest_active,
          progress: state.quest_progress[state.quest_active] || 0,
        }
      : null,
    quests_completed: state.quests_completed,
    milestones_unlocked: state.milestones_unlocked,
    badges: state.badges,
    lifetime: {
      zone_minutes: state.lifetime_zone_minutes,
      qualifying_runs: state.lifetime_qualifying_runs,
    },
  }
}
