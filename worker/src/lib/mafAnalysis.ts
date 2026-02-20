// worker/src/lib/mafAnalysis.ts
// Server-side MAF analysis engine — v2 enhanced metrics
// This is the single source of truth for the MAFActivity interface.
// Every downstream module (XP, quests, streaks, coaching) imports from here.

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface UserSettings {
  age: number;
  modifier: number;
  units: 'km' | 'mi';
  maf_hr: number;
  maf_zone_low: number;
  maf_zone_high: number;
  qualifying_tolerance: number;
  start_date: string | null;
}

export interface StreamData {
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
  velocity_smooth?: { data: number[] };
  time?: { data: number[] };
  distance?: { data: number[] };
  altitude?: { data: number[] };
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  elapsed_time: number;
  distance: number;
  average_heartrate?: number;
  average_cadence?: number;
  total_elevation_gain: number;
  average_speed: number;
}

/**
 * MAFActivity — the core analysis result for a single run.
 *
 * v1 fields are used by the existing frontend dashboard.
 * v2 fields power the gamification and coaching engines.
 * All downstream modules import this interface.
 */
export interface MAFActivity {
  // Identity
  id: number;
  date: string;
  name: string;
  duration_seconds: number;
  distance_meters: number;
  elevation_gain: number;

  // v1 metrics (existing dashboard)
  avg_hr: number;
  avg_cadence: number;
  avg_pace: number;              // min/unit
  time_in_maf_zone_pct: number;  // 0–100
  time_in_qualifying_zone_pct: number;
  maf_pace: number;              // min/unit (pace while in MAF zone)
  cardiac_drift: number | null;  // % HR creep first→second half
  aerobic_decoupling: number | null; // % pace:HR ratio drift
  cadence_in_zone: number | null;    // avg cadence in MAF zone (spm)
  efficiency_factor: number;     // meters/min per bpm
  qualifying: boolean;           // ≥20 min && ≥60% in qualifying zone
  excluded: boolean;

  // v2 metrics (gamification + coaching)
  zone_minutes: number;                   // absolute minutes in MAF zone
  longest_zone_streak_minutes: number;    // longest continuous in-zone stretch
  zone_entries: number;                   // times HR re-entered zone after leaving
  warmup_score: number;                   // 0–100
  negative_split: boolean;                // second half ≥2% faster
  pace_steadiness_score: number;          // 0–100
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function velocityToPace(metersPerSec: number, units: 'km' | 'mi'): number {
  if (metersPerSec <= 0) return 0;
  const divisor = units === 'mi' ? METERS_PER_MILE : METERS_PER_KM;
  return (divisor / metersPerSec) / 60;
}

function computeEF(avgSpeedMs: number, avgHr: number): number {
  if (avgHr <= 0 || avgSpeedMs <= 0) return 0;
  const metersPerMin = avgSpeedMs * 60;
  return metersPerMin / avgHr;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function coefficientOfVariation(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  if (avg === 0) return 0;
  const variance = arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance) / avg;
}

// ─── V2 Metric Calculators ───────────────────────────────────────────────────

/**
 * Zone minutes: total seconds where HR is in [zoneLow, zoneHigh], converted to minutes.
 * Assumes 1-second stream sampling (standard for Strava).
 */
function computeZoneMinutes(
  hr: number[],
  zoneLow: number,
  zoneHigh: number
): number {
  let inZoneSeconds = 0;
  for (let i = 0; i < hr.length; i++) {
    if (hr[i] >= zoneLow && hr[i] <= zoneHigh) {
      inZoneSeconds++;
    }
  }
  return inZoneSeconds / 60;
}

/**
 * Zone streaks: scan HR stream for consecutive seconds in zone.
 * Returns longest continuous stretch (minutes) and number of zone entries.
 */
function computeZoneStreaks(
  hr: number[],
  zoneLow: number,
  zoneHigh: number
): { longest_streak_minutes: number; zone_entries: number } {
  let longestStreak = 0;
  let currentStreak = 0;
  let entries = 0;
  let wasInZone = false;

  for (let i = 0; i < hr.length; i++) {
    const inZone = hr[i] >= zoneLow && hr[i] <= zoneHigh;

    if (inZone) {
      if (!wasInZone) {
        entries++;
      }
      currentStreak++;
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
    } else {
      currentStreak = 0;
    }

    wasInZone = inZone;
  }

  return {
    longest_streak_minutes: longestStreak / 60,
    zone_entries: entries,
  };
}

/**
 * Warm-up quality score (0–100).
 * From MAF tips: first 10–15 minutes should be gradual, HR ≥10 bpm below MAF max.
 *
 * Score = % of first 600 seconds where HR ≤ (maf_hr - 10).
 * Penalty: if HR spikes above maf_zone_high in first 300 seconds, score capped at 50.
 */
function computeWarmupScore(
  hr: number[],
  mafHr: number,
  mafZoneHigh: number
): number {
  const warmupWindow = Math.min(hr.length, 600); // first 10 minutes
  if (warmupWindow === 0) return 0;

  const warmupTarget = mafHr - 10;
  let belowTargetCount = 0;
  let earlySpike = false;

  for (let i = 0; i < warmupWindow; i++) {
    if (hr[i] <= warmupTarget) {
      belowTargetCount++;
    }
    // Check for spike in first 5 minutes
    if (i < 300 && hr[i] > mafZoneHigh) {
      earlySpike = true;
    }
  }

  let score = (belowTargetCount / warmupWindow) * 100;

  if (earlySpike) {
    score = Math.min(score, 50);
  }

  return Math.round(score);
}

/**
 * Negative split detection.
 * Compare avg velocity in second half vs first half.
 * Negative split = true if second half is ≥2% faster.
 */
function computeNegativeSplit(velocity: number[]): boolean {
  const mid = Math.floor(velocity.length / 2);
  if (mid === 0) return false;

  const firstHalf = mean(velocity.slice(0, mid));
  const secondHalf = mean(velocity.slice(mid));

  if (firstHalf <= 0) return false;

  const improvement = (secondHalf - firstHalf) / firstHalf;
  return improvement >= 0.02;
}

/**
 * Pace steadiness score (0–100).
 * Based on coefficient of variation of velocity within MAF zone segments.
 * Lower CV = more even pacing = better discipline.
 * Score = max(0, 100 - (CV × 500))
 */
function computePaceSteadiness(
  velocity: number[],
  hr: number[],
  zoneLow: number,
  zoneHigh: number
): number {
  const len = Math.min(velocity.length, hr.length);
  const inZoneVelocities: number[] = [];

  for (let i = 0; i < len; i++) {
    if (hr[i] >= zoneLow && hr[i] <= zoneHigh && velocity[i] > 0) {
      inZoneVelocities.push(velocity[i]);
    }
  }

  if (inZoneVelocities.length < 10) return 0; // not enough data

  const cv = coefficientOfVariation(inZoneVelocities);
  const score = Math.max(0, 100 - cv * 500);
  return Math.round(score);
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

/**
 * Analyze a single Strava activity with full stream data.
 * Produces the complete MAFActivity record used by all downstream systems.
 */
export function analyzeActivity(
  activity: StravaActivity,
  streams: StreamData | null,
  settings: UserSettings,
  excluded: boolean = false
): MAFActivity {
  const { maf_hr, maf_zone_low, maf_zone_high, qualifying_tolerance, units } = settings;
  const qualifyingHigh = maf_zone_high + qualifying_tolerance;

  const avgPace = activity.average_speed > 0
    ? velocityToPace(activity.average_speed, units)
    : 0;

  const ef = computeEF(activity.average_speed, activity.average_heartrate || 0);

  // Defaults for when we have no stream data
  let timeInZonePct = 0;
  let timeInQualifyingPct = 0;
  let mafPace = avgPace;
  let cardiacDrift: number | null = null;
  let aerobicDecoupling: number | null = null;
  let cadenceInZone: number | null = null;

  // v2 defaults
  let zoneMinutes = 0;
  let longestZoneStreakMinutes = 0;
  let zoneEntries = 0;
  let warmupScore = 0;
  let negativeSplit = false;
  let paceSteadinessScore = 0;

  if (streams?.heartrate?.data && streams?.velocity_smooth?.data) {
    const hr = streams.heartrate.data;
    const velocity = streams.velocity_smooth.data;
    const cadence = streams.cadence?.data;
    const len = Math.min(hr.length, velocity.length);

    // ── v1 metrics ──────────────────────────────────────────────────────

    let inZoneCount = 0;
    let inQualifyingCount = 0;
    let inZonePaceSum = 0;
    let inZoneCadenceSum = 0;
    let inZoneCadenceCount = 0;

    for (let i = 0; i < len; i++) {
      if (hr[i] >= maf_zone_low && hr[i] <= maf_zone_high) {
        inZoneCount++;
        if (velocity[i] > 0) {
          inZonePaceSum += velocityToPace(velocity[i], units);
        }
        if (cadence && cadence[i] > 0) {
          inZoneCadenceSum += cadence[i] * 2;
          inZoneCadenceCount++;
        }
      }
      if (hr[i] >= maf_zone_low && hr[i] <= qualifyingHigh) {
        inQualifyingCount++;
      }
    }

    timeInZonePct = len > 0 ? (inZoneCount / len) * 100 : 0;
    timeInQualifyingPct = len > 0 ? (inQualifyingCount / len) * 100 : 0;
    mafPace = inZoneCount > 0 ? inZonePaceSum / inZoneCount : avgPace;
    cadenceInZone = inZoneCadenceCount > 0 ? inZoneCadenceSum / inZoneCadenceCount : null;

    // Cardiac drift: HR creep first half vs second half
    const midpoint = Math.floor(len / 2);
    if (midpoint > 0) {
      const firstHalfHr = mean(hr.slice(0, midpoint));
      const secondHalfHr = mean(hr.slice(midpoint));
      cardiacDrift = firstHalfHr > 0
        ? ((secondHalfHr - firstHalfHr) / firstHalfHr) * 100
        : null;
    }

    // Aerobic decoupling: pace:HR ratio drift
    if (midpoint > 0) {
      const firstHalfPace = mean(velocity.slice(0, midpoint));
      const secondHalfPace = mean(velocity.slice(midpoint));
      const firstHalfHrVal = mean(hr.slice(0, midpoint));
      const secondHalfHrVal = mean(hr.slice(midpoint));

      if (firstHalfPace > 0 && firstHalfHrVal > 0) {
        const paceRatio = secondHalfPace / firstHalfPace;
        const hrRatio = secondHalfHrVal / firstHalfHrVal;
        aerobicDecoupling = hrRatio > 0 ? ((paceRatio / hrRatio) - 1) * 100 : null;
      }
    }

    // ── v2 metrics ──────────────────────────────────────────────────────

    zoneMinutes = computeZoneMinutes(hr, maf_zone_low, maf_zone_high);

    const streaks = computeZoneStreaks(hr, maf_zone_low, maf_zone_high);
    longestZoneStreakMinutes = streaks.longest_streak_minutes;
    zoneEntries = streaks.zone_entries;

    warmupScore = computeWarmupScore(hr, maf_hr, maf_zone_high);
    negativeSplit = computeNegativeSplit(velocity);
    paceSteadinessScore = computePaceSteadiness(velocity, hr, maf_zone_low, maf_zone_high);

  } else {
    // No stream data — estimate from averages (v1 fallback)
    if (activity.average_heartrate) {
      const inZone = activity.average_heartrate >= maf_zone_low
        && activity.average_heartrate <= maf_zone_high;
      const inQualifying = activity.average_heartrate >= maf_zone_low
        && activity.average_heartrate <= qualifyingHigh;
      timeInZonePct = inZone ? 75 : 25;
      timeInQualifyingPct = inQualifying ? 75 : 25;

      // Rough zone minutes estimate from percentage
      if (inZone) {
        zoneMinutes = (activity.elapsed_time * 0.75) / 60;
      }
    }
  }

  const qualifying = !excluded
    && activity.elapsed_time >= 1200
    && timeInQualifyingPct >= 60;

  return {
    // Identity
    id: activity.id,
    date: activity.start_date,
    name: activity.name,
    duration_seconds: activity.elapsed_time,
    distance_meters: activity.distance,
    elevation_gain: activity.total_elevation_gain || 0,

    // v1 metrics
    avg_hr: activity.average_heartrate || 0,
    avg_cadence: activity.average_cadence ? activity.average_cadence * 2 : 0,
    avg_pace: avgPace,
    time_in_maf_zone_pct: timeInZonePct,
    time_in_qualifying_zone_pct: timeInQualifyingPct,
    maf_pace: mafPace,
    cardiac_drift: cardiacDrift,
    aerobic_decoupling: aerobicDecoupling,
    cadence_in_zone: cadenceInZone,
    efficiency_factor: ef,
    qualifying,
    excluded,

    // v2 metrics
    zone_minutes: zoneMinutes,
    longest_zone_streak_minutes: longestZoneStreakMinutes,
    zone_entries: zoneEntries,
    warmup_score: warmupScore,
    negative_split: negativeSplit,
    pace_steadiness_score: paceSteadinessScore,
  };
}

// ─── Utility Exports ─────────────────────────────────────────────────────────

export function formatPace(pace: number, units: 'km' | 'mi'): string {
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /${units}`;
}
