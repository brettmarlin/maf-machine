/**
 * coachingPayload.ts — Builds the structured context payload sent to Claude API
 * for post-run coaching assessments and weekly summaries.
 *
 * Ceiling model: maf_hr is the max. Everything at or below is good.
 */

import type { MAFActivity, UserSettings } from './mafAnalysis';
import { formatPace as formatPaceFromMinPerUnit } from './mafAnalysis';
import type { GameState, WeeklyRecord } from './gameTypes';
import { getLevelFromXP, getLevelProgressPct, getStreakMultiplier } from './gameTypes';

// --- Payload Interfaces ---

export interface RunnerContext {
  age: number;
  maf_hr: number;
  maf_ceiling: number;
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
  below_ceiling_pct: number;
  time_controlled_pct: number;
  time_easy_pct: number;
  time_over_ceiling_pct: number;
  longest_zone_streak_minutes: number;
  zone_entries: number;
  warmup_score: number;
  cardiac_drift_pct: number | null;
  aerobic_decoupling_pct: number | null;
  avg_cadence: number | null;
  pace_at_maf: string;
  negative_split: boolean;
  pace_steadiness_score: number;
  elevation_gain: number;
  elevation_unit: string;
  hr_recovery_rate_bpm_per_min: number | null;
  hr_recovery_events: number;
  xp_earned: number;
  xp_breakdown: Record<string, number>;
  badges_earned: string[];
  surprise_bonuses: string[];
  next_step: string | null;
}

export interface RecentRunSummary {
  date: string;
  name: string;
  zone_minutes: number;
  below_ceiling_pct: number;
  pace_at_maf: string;
  cardiac_drift_pct: number | null;
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
  avg_below_ceiling_4wk: number | null;
  avg_cardiac_drift_4wk: number | null;
  hr_recovery_rate_4wk_avg: number | null;
  hr_recovery_trend: 'improving' | 'declining' | 'stable' | null;
  total_zone_minutes_lifetime: number;
  total_qualifying_runs: number;
  level: number;
  level_name: string;
  level_progress_pct: number;
  badges_earned: string[];
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

function fmtPace(paceMinPerUnit: number, units: 'km' | 'mi'): string {
  if (!paceMinPerUnit || paceMinPerUnit <= 0) return '--:--';
  return formatPaceFromMinPerUnit(paceMinPerUnit, units);
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
  const dayOfWeek = now.getDay();
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

function roundTo1(n: number | null): number | null {
  if (n === null || n === undefined) return null;
  return Math.round(n * 10) / 10;
}

// --- Payload Builders ---

function buildRunnerContext(settings: UserSettings, gameState: GameState): RunnerContext {
  return {
    age: settings.age,
    maf_hr: settings.maf_hr,
    maf_ceiling: settings.maf_hr,
    units: settings.units || 'mi',
    weekly_target_zone_minutes: gameState.weekly_target_zone_minutes,
    training_start_date: settings.start_date,
    weeks_in_training: getWeeksInTraining(settings.start_date),
  };
}

function buildStreakContext(gameState: GameState): StreakContext {
  return {
    current_weeks: gameState.streak_current_weeks || 0,
    multiplier: getStreakMultiplier(gameState.streak_current_weeks || 0),
    longest_ever: gameState.streak_longest || 0,
  };
}

function buildTrends(recentActivities: MAFActivity[], gameState: GameState, units: 'km' | 'mi'): TrendsContext {
  const qualifying = recentActivities.filter((a) => a.qualifying);
  const last4Weeks = qualifying.slice(0, 12);
  const last8Weeks = qualifying.slice(0, 24);

  // Average MAF pace (min/unit — lower is faster)
  const avg4wkPace = last4Weeks.length > 0
    ? last4Weeks.reduce((sum, a) => sum + a.maf_pace, 0) / last4Weeks.length
    : 0;
  const avg8wkPace = last8Weeks.length > 0
    ? last8Weeks.reduce((sum, a) => sum + a.maf_pace, 0) / last8Weeks.length
    : 0;

  // Pace improvement: lower pace = faster = improvement
  const paceImprovement = avg8wkPace > 0 && avg4wkPace < avg8wkPace
    ? Math.round(((avg8wkPace - avg4wkPace) / avg8wkPace) * 1000) / 10
    : null;

  const avg4wkDrift = last4Weeks.length > 0
    ? roundTo1(last4Weeks.reduce((sum, a) => sum + (a.cardiac_drift || 0), 0) / last4Weeks.length)
    : null;

  const avg4wkBelowCeiling = last4Weeks.length > 0
    ? roundTo1(last4Weeks.reduce((sum, a) => sum + a.time_below_ceiling_pct, 0) / last4Weeks.length)
    : null;

  // HR Recovery Rate — 4wk average and trend
  const recoveryRuns4wk = last4Weeks.filter((a) => a.hr_recovery_rate_bpm_per_min !== null);
  const recoveryRuns8wk = last8Weeks.filter((a) => a.hr_recovery_rate_bpm_per_min !== null);
  const avg4wkRecovery = recoveryRuns4wk.length > 0
    ? roundTo1(recoveryRuns4wk.reduce((sum, a) => sum + a.hr_recovery_rate_bpm_per_min!, 0) / recoveryRuns4wk.length)
    : null;
  const avg8wkRecovery = recoveryRuns8wk.length > 0
    ? recoveryRuns8wk.reduce((sum, a) => sum + a.hr_recovery_rate_bpm_per_min!, 0) / recoveryRuns8wk.length
    : null;

  let hrRecoveryTrend: 'improving' | 'declining' | 'stable' | null = null;
  if (avg4wkRecovery !== null && avg8wkRecovery !== null && avg8wkRecovery > 0) {
    const change = ((avg4wkRecovery - avg8wkRecovery) / avg8wkRecovery) * 100;
    if (change > 5) hrRecoveryTrend = 'improving';
    else if (change < -5) hrRecoveryTrend = 'declining';
    else hrRecoveryTrend = 'stable';
  }

  const level = getLevelFromXP(gameState.xp_total);

  return {
    pace_at_maf_4wk_avg: avg4wkPace > 0 ? fmtPace(avg4wkPace, units) : null,
    pace_at_maf_8wk_avg: avg8wkPace > 0 ? fmtPace(avg8wkPace, units) : null,
    pace_improvement_pct: paceImprovement,
    avg_below_ceiling_4wk: avg4wkBelowCeiling,
    avg_cardiac_drift_4wk: avg4wkDrift,
    hr_recovery_rate_4wk_avg: avg4wkRecovery,
    hr_recovery_trend: hrRecoveryTrend,
    total_zone_minutes_lifetime: Math.round(
      recentActivities.reduce((sum, a) => sum + a.zone_minutes, 0)
    ),
    total_qualifying_runs: qualifying.length,
    level: level.level,
    level_name: level.name,
    level_progress_pct: Math.round(getLevelProgressPct(gameState.xp_total)),
    badges_earned: gameState.badges_earned || [],
  };
}

function buildRecentRunSummary(a: MAFActivity, units: 'km' | 'mi'): RecentRunSummary {
  return {
    date: a.date,
    name: a.name,
    zone_minutes: Math.round(a.zone_minutes * 10) / 10,
    below_ceiling_pct: Math.round(a.time_below_ceiling_pct * 10) / 10,
    pace_at_maf: fmtPace(a.maf_pace, units),
    cardiac_drift_pct: roundTo1(a.cardiac_drift),
    warmup_score: Math.round(a.warmup_score),
    xp_earned: 0,
  };
}

export function buildPostRunPayload(
  activity: MAFActivity,
  recentActivities: MAFActivity[],
  gameState: GameState,
  settings: UserSettings,
  xpEarned: number,
  xpBreakdown: Record<string, number>,
  badgesEarned: string[],
  surpriseBonuses: string[],
  nextStep: string | null,
): CoachingPayload {
  const units = settings.units || 'mi';
  const currentWeek = getCurrentISOWeek();

  const runner = buildRunnerContext(settings, gameState);

  // Distance conversion
  const distanceRaw = activity.distance_meters / (units === 'mi' ? 1609.344 : 1000);
  const distance = Math.round(distanceRaw * 10) / 10;
  const elevGain = units === 'mi'
    ? Math.round((activity.elevation_gain || 0) * 3.28084)
    : Math.round(activity.elevation_gain || 0);

  const this_run: ThisRunContext = {
    date: activity.date,
    name: activity.name,
    duration_minutes: Math.round(activity.duration_seconds / 60 * 10) / 10,
    distance,
    distance_unit: units,
    avg_hr: activity.avg_hr,
    zone_minutes: Math.round(activity.zone_minutes * 10) / 10,
    below_ceiling_pct: Math.round(activity.time_below_ceiling_pct * 10) / 10,
    time_controlled_pct: Math.round(activity.time_controlled_pct * 10) / 10,
    time_easy_pct: Math.round(activity.time_easy_pct * 10) / 10,
    time_over_ceiling_pct: Math.round(activity.time_over_ceiling_pct * 10) / 10,
    longest_zone_streak_minutes: Math.round(activity.longest_zone_streak_minutes * 10) / 10,
    zone_entries: activity.zone_entries,
    warmup_score: Math.round(activity.warmup_score),
    cardiac_drift_pct: roundTo1(activity.cardiac_drift),
    aerobic_decoupling_pct: roundTo1(activity.aerobic_decoupling),
    avg_cadence: roundTo1(activity.cadence_in_zone),
    pace_at_maf: fmtPace(activity.maf_pace, units),
    negative_split: activity.negative_split,
    pace_steadiness_score: Math.round(activity.pace_steadiness_score),
    elevation_gain: elevGain,
    elevation_unit: units === 'mi' ? 'ft' : 'm',
    hr_recovery_rate_bpm_per_min: activity.hr_recovery_rate_bpm_per_min,
    hr_recovery_events: activity.hr_recovery_events,
    xp_earned: xpEarned,
    xp_breakdown: xpBreakdown,
    badges_earned: badgesEarned,
    surprise_bonuses: surpriseBonuses,
    next_step: nextStep,
  };

  // Recent history (last 5, excluding current)
  const last5 = recentActivities
    .filter((a) => a.id !== activity.id)
    .slice(0, 5)
    .map((a) => buildRecentRunSummary(a, units));

  // This week's progress
  const currentWeekRecord = gameState.weekly_history.find((w) => w.week === currentWeek);
  const this_week: WeekContext = {
    zone_minutes: Math.round((currentWeekRecord?.zone_minutes || 0) * 10) / 10,
    target: gameState.weekly_target_zone_minutes,
    runs: currentWeekRecord?.runs || 0,
    qualifying_runs: currentWeekRecord?.qualifying_runs || 0,
    days_remaining: getDaysRemainingInWeek(),
  };

  const streak = buildStreakContext(gameState);
  const trends = buildTrends(recentActivities, gameState, units);

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

  const runner = buildRunnerContext(settings, gameState);
  const streak = buildStreakContext(gameState);
  const trends = buildTrends(recentActivities, gameState, units);

  const recentRuns = recentActivities
    .slice(0, 10)
    .map((a) => buildRecentRunSummary(a, units));

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
