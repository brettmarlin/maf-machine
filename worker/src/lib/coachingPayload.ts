/**
 * coachingPayload.ts — Builds the structured context payload sent to Claude API
 * for post-run coaching assessments and weekly summaries.
 */

import type { MAFActivity, UserSettings } from './mafAnalysis';
import type { GameState, WeeklyRecord } from './gameTypes';
import { getLevelFromXP, getXPToNextLevel, getStreakMultiplier, LEVEL_TABLE } from './gameTypes';

// --- Payload Interfaces ---

export interface RunnerContext {
  age: number;
  maf_hr: number;
  maf_zone: [number, number];
  units: 'km' | 'mi';
  weekly_target_zone_minutes: number;
  training_start_date: string | null;
  weeks_in_training: number;
}

export interface ThisRunContext {
  date: string;
  name: string;
  duration_minutes: number;
  distance: number;
  distance_unit: string;
  avg_hr: number;
  zone_minutes: number;
  zone_pct: number;
  longest_zone_streak_minutes: number;
  zone_entries: number;
  warmup_score: number;
  cardiac_drift_pct: number;
  aerobic_decoupling_pct: number;
  avg_cadence: number;
  pace_at_maf: string;
  negative_split: boolean;
  pace_steadiness_score: number;
  elevation_gain: number;
  elevation_unit: string;
  xp_earned: number;
  xp_breakdown: Record<string, number>;
  milestones_unlocked: string[];
  quest_completed: string | null;
}

export interface RecentRunSummary {
  date: string;
  zone_minutes: number;
  zone_pct: number;
  pace_at_maf: string;
  cardiac_drift_pct: number;
  warmup_score: number;
  xp_earned: number;
}

export interface WeekContext {
  zone_minutes: number;
  target: number;
  runs: number;
  qualifying_runs: number;
  days_remaining: number;
}

export interface StreakContext {
  current_weeks: number;
  multiplier: number;
  longest_ever: number;
}

export interface TrendsContext {
  pace_at_maf_4wk_avg: string | null;
  pace_at_maf_8wk_avg: string | null;
  pace_improvement_pct: number | null;
  avg_zone_discipline_4wk: number | null;
  avg_cardiac_drift_4wk: number | null;
  total_zone_minutes_lifetime: number;
  total_qualifying_runs: number;
  total_xp: number;
  level: number;
  level_name: string;
  xp_to_next_level: number;
}

export interface CoachingPayload {
  runner: RunnerContext;
  this_run: ThisRunContext;
  recent_history: {
    last_5_runs: RecentRunSummary[];
    this_week: WeekContext;
    streak: StreakContext;
  };
  trends: TrendsContext;
}

export interface WeeklySummaryPayload {
  runner: RunnerContext;
  this_week: WeeklyRecord & { iso_week: string };
  last_week: (WeeklyRecord & { iso_week: string }) | null;
  streak: StreakContext;
  trends: TrendsContext;
  recent_runs: RecentRunSummary[];
}

// --- Helper Functions ---

function formatPace(metersPerSecond: number, units: 'km' | 'mi'): string {
  if (!metersPerSecond || metersPerSecond <= 0) return '--:--';

  const secondsPerMeter = 1 / metersPerSecond;
  const divisor = units === 'mi' ? 1609.344 : 1000;
  const secondsPerUnit = secondsPerMeter * divisor;

  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = Math.round(secondsPerUnit % 60);
  const unit = units === 'mi' ? '/mi' : '/km';

  return `${minutes}:${seconds.toString().padStart(2, '0')}${unit}`;
}

function getWeeksInTraining(startDate: string | null): number {
  if (!startDate) return 0;
  const start = new Date(startDate).getTime();
  const now = Date.now();
  const weeks = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, weeks);
}

function getDaysRemainingInWeek(): number {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  // ISO week ends on Sunday. Days remaining including today.
  // Monday=1 → 6 days left, Sunday=0 → 0 days left
  if (dayOfWeek === 0) return 0;
  return 7 - dayOfWeek;
}

function getCurrentISOWeek(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

// --- Payload Builders ---

export function buildPostRunPayload(
  activity: MAFActivity,
  recentActivities: MAFActivity[],
  gameState: GameState,
  settings: UserSettings,
  xpEarned: number,
  xpBreakdown: Record<string, number>,
  milestonesUnlocked: string[],
  questCompleted: string | null
): CoachingPayload {
  const units = settings.units || 'mi';
  const currentWeek = getCurrentISOWeek();

  // Build runner context
  const runner: RunnerContext = {
    age: settings.age,
    maf_hr: settings.maf_hr,
    maf_zone: [settings.maf_zone_low, settings.maf_zone_high],
    units,
    weekly_target_zone_minutes: gameState.weekly_target_zone_minutes,
    training_start_date: settings.start_date,
    weeks_in_training: getWeeksInTraining(settings.start_date),
  };

  // Distance conversion
  const distanceRaw = activity.distance_meters / (units === 'mi' ? 1609.344 : 1000);
  const distance = Math.round(distanceRaw * 10) / 10;
  const elevGain = units === 'mi'
    ? Math.round((activity.elevation_gain || 0) * 3.28084)
    : Math.round(activity.elevation_gain || 0);

  // Build this_run context
  const this_run: ThisRunContext = {
    date: activity.start_date,
    name: activity.name,
    duration_minutes: Math.round(activity.duration_seconds / 60 * 10) / 10,
    distance,
    distance_unit: units,
    avg_hr: activity.avg_hr,
    zone_minutes: Math.round(activity.zone_minutes * 10) / 10,
    zone_pct: Math.round(activity.time_in_maf_zone_pct * 10) / 10,
    longest_zone_streak_minutes: Math.round(activity.longest_zone_streak_minutes * 10) / 10,
    zone_entries: activity.zone_entries,
    warmup_score: Math.round(activity.warmup_score),
    cardiac_drift_pct: Math.round(activity.cardiac_drift * 10) / 10,
    aerobic_decoupling_pct: Math.round(activity.aerobic_decoupling * 10) / 10,
    avg_cadence: Math.round(activity.cadence_in_zone * 10) / 10,
    pace_at_maf: formatPace(activity.efficiency_factor > 0 ? activity.avg_speed : 0, units),
    negative_split: activity.negative_split,
    pace_steadiness_score: Math.round(activity.pace_steadiness_score),
    elevation_gain: elevGain,
    elevation_unit: units === 'mi' ? 'ft' : 'm',
    xp_earned: xpEarned,
    xp_breakdown: xpBreakdown,
    milestones_unlocked: milestonesUnlocked,
    quest_completed: questCompleted,
  };

  // Build recent history (last 5 runs, excluding current)
  const last5 = recentActivities
    .filter((a) => a.activity_id !== activity.activity_id)
    .slice(0, 5)
    .map((a): RecentRunSummary => ({
      date: a.start_date,
      zone_minutes: Math.round(a.zone_minutes * 10) / 10,
      zone_pct: Math.round(a.time_in_maf_zone_pct * 10) / 10,
      pace_at_maf: formatPace(a.avg_speed, units),
      cardiac_drift_pct: Math.round(a.cardiac_drift * 10) / 10,
      warmup_score: Math.round(a.warmup_score),
      xp_earned: 0, // We don't store XP on analysis; approximation is fine
    }));

  // This week's progress
  const currentWeekRecord = gameState.weekly_history.find((w) => w.week === currentWeek);
  const this_week: WeekContext = {
    zone_minutes: Math.round((currentWeekRecord?.zone_minutes || 0) * 10) / 10,
    target: gameState.weekly_target_zone_minutes,
    runs: currentWeekRecord?.runs || 0,
    qualifying_runs: currentWeekRecord?.qualifying_runs || 0,
    days_remaining: getDaysRemainingInWeek(),
  };

  // Streak
  const streak: StreakContext = {
    current_weeks: gameState.streak_current_weeks,
    multiplier: getStreakMultiplier(gameState.streak_current_weeks),
    longest_ever: gameState.streak_longest,
  };

  // Trends (computed from recent activities)
  const qualifying = recentActivities.filter((a) => a.qualifying);
  const last4Weeks = qualifying.slice(0, 12); // Approximate 4 weeks
  const last8Weeks = qualifying.slice(0, 24);

  const avg4wkPace = last4Weeks.length > 0
    ? last4Weeks.reduce((sum, a) => sum + a.avg_speed, 0) / last4Weeks.length
    : 0;
  const avg8wkPace = last8Weeks.length > 0
    ? last8Weeks.reduce((sum, a) => sum + a.avg_speed, 0) / last8Weeks.length
    : 0;

  const paceImprovement = avg8wkPace > 0 && avg4wkPace > avg8wkPace
    ? Math.round(((avg4wkPace - avg8wkPace) / avg8wkPace) * 1000) / 10
    : null;

  const avg4wkDrift = last4Weeks.length > 0
    ? Math.round(last4Weeks.reduce((sum, a) => sum + a.cardiac_drift, 0) / last4Weeks.length * 10) / 10
    : null;

  const avg4wkZonePct = last4Weeks.length > 0
    ? Math.round(last4Weeks.reduce((sum, a) => sum + a.time_in_maf_zone_pct, 0) / last4Weeks.length * 10) / 10
    : null;

  const level = getLevelFromXP(gameState.xp_total);

  const trends: TrendsContext = {
    pace_at_maf_4wk_avg: avg4wkPace > 0 ? formatPace(avg4wkPace, units) : null,
    pace_at_maf_8wk_avg: avg8wkPace > 0 ? formatPace(avg8wkPace, units) : null,
    pace_improvement_pct: paceImprovement,
    avg_zone_discipline_4wk: avg4wkZonePct,
    avg_cardiac_drift_4wk: avg4wkDrift,
    total_zone_minutes_lifetime: Math.round(
      recentActivities.reduce((sum, a) => sum + a.zone_minutes, 0)
    ),
    total_qualifying_runs: qualifying.length,
    total_xp: gameState.xp_total,
    level: level.level,
    level_name: level.name,
    xp_to_next_level: getXPToNextLevel(gameState.xp_total),
  };

  return {
    runner,
    this_run,
    recent_history: {
      last_5_runs: last5,
      this_week,
      streak,
    },
    trends,
  };
}

export function buildWeeklySummaryPayload(
  gameState: GameState,
  recentActivities: MAFActivity[],
  settings: UserSettings
): WeeklySummaryPayload {
  const units = settings.units || 'mi';
  const history = gameState.weekly_history;

  const thisWeekRecord = history.length > 0 ? history[history.length - 1] : null;
  const lastWeekRecord = history.length > 1 ? history[history.length - 2] : null;

  const runner: RunnerContext = {
    age: settings.age,
    maf_hr: settings.maf_hr,
    maf_zone: [settings.maf_zone_low, settings.maf_zone_high],
    units,
    weekly_target_zone_minutes: gameState.weekly_target_zone_minutes,
    training_start_date: settings.start_date,
    weeks_in_training: getWeeksInTraining(settings.start_date),
  };

  const streak: StreakContext = {
    current_weeks: gameState.streak_current_weeks,
    multiplier: getStreakMultiplier(gameState.streak_current_weeks),
    longest_ever: gameState.streak_longest,
  };

  const qualifying = recentActivities.filter((a) => a.qualifying);
  const last4Weeks = qualifying.slice(0, 12);
  const last8Weeks = qualifying.slice(0, 24);

  const avg4wkPace = last4Weeks.length > 0
    ? last4Weeks.reduce((sum, a) => sum + a.avg_speed, 0) / last4Weeks.length
    : 0;
  const avg8wkPace = last8Weeks.length > 0
    ? last8Weeks.reduce((sum, a) => sum + a.avg_speed, 0) / last8Weeks.length
    : 0;

  const paceImprovement = avg8wkPace > 0 && avg4wkPace > avg8wkPace
    ? Math.round(((avg4wkPace - avg8wkPace) / avg8wkPace) * 1000) / 10
    : null;

  const avg4wkDrift = last4Weeks.length > 0
    ? Math.round(last4Weeks.reduce((sum, a) => sum + a.cardiac_drift, 0) / last4Weeks.length * 10) / 10
    : null;

  const avg4wkZonePct = last4Weeks.length > 0
    ? Math.round(last4Weeks.reduce((sum, a) => sum + a.time_in_maf_zone_pct, 0) / last4Weeks.length * 10) / 10
    : null;

  const level = getLevelFromXP(gameState.xp_total);

  const trends: TrendsContext = {
    pace_at_maf_4wk_avg: avg4wkPace > 0 ? formatPace(avg4wkPace, units) : null,
    pace_at_maf_8wk_avg: avg8wkPace > 0 ? formatPace(avg8wkPace, units) : null,
    pace_improvement_pct: paceImprovement,
    avg_zone_discipline_4wk: avg4wkZonePct,
    avg_cardiac_drift_4wk: avg4wkDrift,
    total_zone_minutes_lifetime: Math.round(
      recentActivities.reduce((sum, a) => sum + a.zone_minutes, 0)
    ),
    total_qualifying_runs: qualifying.length,
    total_xp: gameState.xp_total,
    level: level.level,
    level_name: level.name,
    xp_to_next_level: getXPToNextLevel(gameState.xp_total),
  };

  const recentRuns: RecentRunSummary[] = recentActivities.slice(0, 10).map((a) => ({
    date: a.start_date,
    zone_minutes: Math.round(a.zone_minutes * 10) / 10,
    zone_pct: Math.round(a.time_in_maf_zone_pct * 10) / 10,
    pace_at_maf: formatPace(a.avg_speed, units),
    cardiac_drift_pct: Math.round(a.cardiac_drift * 10) / 10,
    warmup_score: Math.round(a.warmup_score),
    xp_earned: 0,
  }));

  return {
    runner,
    this_week: thisWeekRecord
      ? { ...thisWeekRecord, iso_week: thisWeekRecord.week }
      : { week: getCurrentISOWeek(), iso_week: getCurrentISOWeek(), zone_minutes: 0, runs: 0, qualifying_runs: 0, target_met: false, xp_earned: 0, pure_maf: true },
    last_week: lastWeekRecord
      ? { ...lastWeekRecord, iso_week: lastWeekRecord.week }
      : null,
    streak,
    trends,
    recent_runs: recentRuns,
  };
}
