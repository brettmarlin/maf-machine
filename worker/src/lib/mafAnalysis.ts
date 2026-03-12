// worker/src/lib/mafAnalysis.ts
// Server-side MAF analysis engine — v2 ceiling model
// This is the single source of truth for the MAFActivity interface.
// Every downstream module (XP, quests, streaks, coaching) imports from here.

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface UserSettings {
  age: number;
  modifier: number;
  units: 'km' | 'mi';
  maf_hr: number;            // 180 - age + modifier = CEILING
  start_date: string | null;
  training_start_date?: string | null;
  timezone?: string;          // IANA timezone from Strava (e.g., "America/New_York")
}

export interface MAFTiers {
  ceiling: number;            // maf_hr (e.g., 131) — do not cross
  controlled_low: number;     // ceiling - 6 (e.g., 125)
  controlled_high: number;    // ceiling - 1 (e.g., 130)
  easy_low: number;           // ceiling - 13 (e.g., 118)
  easy_high: number;          // ceiling - 7 (e.g., 124)
  recovery_below: number;     // ceiling - 13 (e.g., 118)
}

export function computeMAFTiers(maf_hr: number): MAFTiers {
  return {
    ceiling: maf_hr,
    controlled_low: maf_hr - 6,
    controlled_high: maf_hr - 1,
    easy_low: maf_hr - 13,
    easy_high: maf_hr - 7,
    recovery_below: maf_hr - 13,
  };
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
  start_date_local?: string;
  timezone?: string;
  start_latlng?: [number, number];
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  average_cadence?: number;
  total_elevation_gain: number;
  average_speed: number;
}

/**
 * MAFActivity — the core analysis result for a single run.
 *
 * Ceiling model: maf_hr is the cap. Everything at or below is good.
 * Tiers: controlled (ceiling-6 to ceiling-1), easy (ceiling-13 to ceiling-7), recovery (below).
 * Over ceiling = not aerobic training.
 */
export interface MAFActivity {
  // Identity
  id: number;
  date: string;
  name: string;
  duration_seconds: number;
  distance_meters: number;
  elevation_gain: number;

  // Core HR metrics
  avg_hr: number;
  avg_cadence: number;
  avg_pace: number;              // min/unit
  efficiency_factor: number;     // meters/min per bpm

  // Ceiling compliance
  time_below_ceiling_pct: number;   // % of run at or below ceiling (the main number)
  time_over_ceiling_pct: number;    // % of run above ceiling
  time_controlled_pct: number;      // % in controlled tier
  time_easy_pct: number;            // % in easy tier
  time_recovery_pct: number;        // % in recovery tier

  // Pace metrics
  maf_pace: number;                   // avg pace while below ceiling
  cardiac_drift: number | null;
  aerobic_decoupling: number | null;
  cadence_in_zone: number | null;     // cadence while below ceiling
  negative_split: boolean;
  pace_steadiness_score: number;

  // Discipline metrics
  zone_minutes: number;               // minutes below ceiling
  longest_zone_streak_minutes: number; // longest continuous stretch below ceiling
  zone_entries: number;               // times HR dropped back below ceiling after spiking over
  warmup_score: number;

  // Status
  qualifying: boolean;
  excluded: boolean;

  // Backward compat aliases (frontend v1 reads these)
  time_in_maf_zone_pct: number;
  time_in_qualifying_zone_pct: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

// Minimum velocity threshold (m/s): filters out GPS drift, standing still, tying shoes.
// 0.5 m/s ≈ 53 min/mi — anything slower is not meaningful movement.
const MIN_VELOCITY = 0.5;

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

// ─── Tier Bucketing ──────────────────────────────────────────────────────────

interface TierBreakdown {
  below_ceiling_pct: number;
  over_ceiling_pct: number;
  controlled_pct: number;
  easy_pct: number;
  recovery_pct: number;
}

/**
 * Single pass through HR stream — bucket each second into a tier.
 */
function computeTierBreakdown(hr: number[], tiers: MAFTiers): TierBreakdown {
  if (hr.length === 0) {
    return { below_ceiling_pct: 0, over_ceiling_pct: 0, controlled_pct: 0, easy_pct: 0, recovery_pct: 0 };
  }

  let over = 0;
  let controlled = 0;
  let easy = 0;
  let recovery = 0;

  for (let i = 0; i < hr.length; i++) {
    const h = hr[i];
    if (h > tiers.ceiling) {
      over++;
    } else if (h >= tiers.controlled_low) {
      controlled++;
    } else if (h >= tiers.easy_low) {
      easy++;
    } else {
      recovery++;
    }
  }

  const total = hr.length;
  return {
    below_ceiling_pct: ((controlled + easy + recovery) / total) * 100,
    over_ceiling_pct: (over / total) * 100,
    controlled_pct: (controlled / total) * 100,
    easy_pct: (easy / total) * 100,
    recovery_pct: (recovery / total) * 100,
  };
}

// ─── Metric Calculators ─────────────────────────────────────────────────────

/**
 * Minutes below ceiling: total seconds where HR ≤ ceiling, converted to minutes.
 */
function computeBelowCeilingMinutes(hr: number[], ceiling: number): number {
  let seconds = 0;
  for (let i = 0; i < hr.length; i++) {
    if (hr[i] <= ceiling) {
      seconds++;
    }
  }
  return seconds / 60;
}

/**
 * Ceiling streaks: consecutive seconds at or below ceiling.
 * Entry = HR drops back below ceiling after being over.
 */
function computeCeilingStreaks(
  hr: number[],
  ceiling: number
): { longest_streak_minutes: number; zone_entries: number } {
  let longestStreak = 0;
  let currentStreak = 0;
  let entries = 0;
  let wasBelow = false;

  for (let i = 0; i < hr.length; i++) {
    const below = hr[i] <= ceiling;

    if (below) {
      if (!wasBelow && i > 0) {
        // Came back below ceiling after being over
        entries++;
      }
      currentStreak++;
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
    } else {
      currentStreak = 0;
    }

    wasBelow = below;
  }

  return {
    longest_streak_minutes: longestStreak / 60,
    zone_entries: entries,
  };
}

/**
 * Warm-up quality score (0–100).
 * First 10 minutes should be gradual, HR ≥10 bpm below ceiling.
 * Penalty: if HR spikes above ceiling in first 5 minutes, score capped at 50.
 */
function computeWarmupScore(hr: number[], ceiling: number): number {
  const warmupWindow = Math.min(hr.length, 600);
  if (warmupWindow === 0) return 0;

  const warmupTarget = ceiling - 10;
  let belowTargetCount = 0;
  let earlySpike = false;

  for (let i = 0; i < warmupWindow; i++) {
    if (hr[i] <= warmupTarget) {
      belowTargetCount++;
    }
    if (i < 300 && hr[i] > ceiling) {
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
 * Second half ≥2% faster = true.
 */
function computeNegativeSplit(velocity: number[]): boolean {
  const mid = Math.floor(velocity.length / 2);
  if (mid === 0) return false;

  const firstHalf = mean(velocity.slice(0, mid));
  const secondHalf = mean(velocity.slice(mid));
  if (firstHalf <= 0) return false;

  return (secondHalf - firstHalf) / firstHalf >= 0.02;
}

/**
 * Pace steadiness score (0–100).
 * CV of velocity while HR is at or below ceiling.
 */
function computePaceSteadiness(
  velocity: number[],
  hr: number[],
  ceiling: number
): number {
  const len = Math.min(velocity.length, hr.length);
  const belowCeilingVelocities: number[] = [];

  for (let i = 0; i < len; i++) {
    if (hr[i] <= ceiling && velocity[i] > MIN_VELOCITY) {
      belowCeilingVelocities.push(velocity[i]);
    }
  }

  if (belowCeilingVelocities.length < 10) return 0;

  const cv = coefficientOfVariation(belowCeilingVelocities);
  return Math.round(Math.max(0, 100 - cv * 500));
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

/**
 * Analyze a single Strava activity with full stream data.
 * Uses ceiling model: maf_hr is the cap, everything below is good.
 */
export function analyzeActivity(
  activity: StravaActivity,
  streams: StreamData | null,
  settings: UserSettings,
  excluded: boolean = false
): MAFActivity {
  const { maf_hr, units } = settings;
  const tiers = computeMAFTiers(maf_hr);

  // avg_pace = moving_time / distance (matches Strava display, includes walks)
  const movingTime = activity.moving_time || activity.elapsed_time;
  const avgPace = movingTime > 0 && activity.distance > 0
    ? (movingTime / 60) / (activity.distance / (units === 'mi' ? METERS_PER_MILE : METERS_PER_KM))
    : 0;

  const ef = computeEF(activity.average_speed, activity.average_heartrate || 0);

  // Defaults for no stream data
  let tierBreakdown: TierBreakdown = {
    below_ceiling_pct: 0, over_ceiling_pct: 0,
    controlled_pct: 0, easy_pct: 0, recovery_pct: 0,
  };
  let mafPace = avgPace;
  let cardiacDrift: number | null = null;
  let aerobicDecoupling: number | null = null;
  let cadenceInZone: number | null = null;
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

    // ── Tier breakdown (single pass) ────────────────────────────────────
    tierBreakdown = computeTierBreakdown(hr.slice(0, len), tiers);

    // ── Pace + cadence while below ceiling ──────────────────────────────
    // FIX: Average velocities (m/s), then convert to pace once.
    // Old code averaged pace values, which is mathematically wrong because
    // pace is inversely proportional to speed. A single near-stop second
    // (e.g., 0.1 m/s = 268 min/mi) would massively skew the average.
    let belowCeilingVelocitySum = 0;
    let belowCeilingVelocityCount = 0;
    let belowCeilingCadenceSum = 0;
    let belowCeilingCadenceCount = 0;

    for (let i = 0; i < len; i++) {
      if (hr[i] <= tiers.ceiling) {
        if (velocity[i] > MIN_VELOCITY) {
          belowCeilingVelocitySum += velocity[i];
          belowCeilingVelocityCount++;
        }
        if (cadence && cadence[i] > 0) {
          belowCeilingCadenceSum += cadence[i] * 2;
          belowCeilingCadenceCount++;
        }
      }
    }

    // Convert average velocity to pace (correct way)
    mafPace = belowCeilingVelocityCount > 0
      ? velocityToPace(belowCeilingVelocitySum / belowCeilingVelocityCount, units)
      : avgPace;
    cadenceInZone = belowCeilingCadenceCount > 0 ? belowCeilingCadenceSum / belowCeilingCadenceCount : null;

    // ── Cardiac drift ───────────────────────────────────────────────────
    const midpoint = Math.floor(len / 2);
    if (midpoint > 0) {
      const firstHalfHr = mean(hr.slice(0, midpoint));
      const secondHalfHr = mean(hr.slice(midpoint, len));
      cardiacDrift = firstHalfHr > 0
        ? ((secondHalfHr - firstHalfHr) / firstHalfHr) * 100
        : null;
    }

    // ── Aerobic decoupling ──────────────────────────────────────────────
    if (midpoint > 0) {
      const firstHalfPace = mean(velocity.slice(0, midpoint));
      const secondHalfPace = mean(velocity.slice(midpoint, len));
      const firstHalfHrVal = mean(hr.slice(0, midpoint));
      const secondHalfHrVal = mean(hr.slice(midpoint, len));

      if (firstHalfPace > 0 && firstHalfHrVal > 0) {
        const paceRatio = secondHalfPace / firstHalfPace;
        const hrRatio = secondHalfHrVal / firstHalfHrVal;
        aerobicDecoupling = hrRatio > 0 ? ((paceRatio / hrRatio) - 1) * 100 : null;
      }
    }

    // ── Discipline metrics ──────────────────────────────────────────────
    zoneMinutes = computeBelowCeilingMinutes(hr.slice(0, len), tiers.ceiling);

    const streaks = computeCeilingStreaks(hr.slice(0, len), tiers.ceiling);
    longestZoneStreakMinutes = streaks.longest_streak_minutes;
    zoneEntries = streaks.zone_entries;

    warmupScore = computeWarmupScore(hr, tiers.ceiling);
    negativeSplit = computeNegativeSplit(velocity.slice(0, len));
    paceSteadinessScore = computePaceSteadiness(velocity, hr, tiers.ceiling);

  } else {
    // No stream data — estimate from averages
    if (activity.average_heartrate) {
      const belowCeiling = activity.average_heartrate <= maf_hr;
      tierBreakdown.below_ceiling_pct = belowCeiling ? 75 : 25;
      tierBreakdown.over_ceiling_pct = belowCeiling ? 25 : 75;
      if (belowCeiling) {
        zoneMinutes = (activity.elapsed_time * 0.75) / 60;
      }
    }
  }

  console.log(`Pace check — avg: ${avgPace.toFixed(4)}, maf: ${mafPace.toFixed(4)}, strava_moving_time: ${movingTime}`);

  // Qualifying: ≥20 min AND ≥60% below ceiling AND avg HR ≤ ceiling
  const qualifying = !excluded
    && activity.elapsed_time >= 1200
    && tierBreakdown.below_ceiling_pct >= 60
    && (activity.average_heartrate || 0) <= maf_hr;

  const belowCeilingPct = tierBreakdown.below_ceiling_pct;

  return {
    // Identity
    id: activity.id,
    date: activity.start_date,
    name: activity.name,
    duration_seconds: activity.elapsed_time,
    distance_meters: activity.distance,
    elevation_gain: activity.total_elevation_gain || 0,

    // Core HR
    avg_hr: activity.average_heartrate || 0,
    avg_cadence: activity.average_cadence ? activity.average_cadence * 2 : 0,
    avg_pace: avgPace,
    efficiency_factor: ef,

    // Ceiling compliance
    time_below_ceiling_pct: belowCeilingPct,
    time_over_ceiling_pct: tierBreakdown.over_ceiling_pct,
    time_controlled_pct: tierBreakdown.controlled_pct,
    time_easy_pct: tierBreakdown.easy_pct,
    time_recovery_pct: tierBreakdown.recovery_pct,

    // Pace
    maf_pace: mafPace,
    cardiac_drift: cardiacDrift,
    aerobic_decoupling: aerobicDecoupling,
    cadence_in_zone: cadenceInZone,
    negative_split: negativeSplit,
    pace_steadiness_score: paceSteadinessScore,

    // Discipline
    zone_minutes: zoneMinutes,
    longest_zone_streak_minutes: longestZoneStreakMinutes,
    zone_entries: zoneEntries,
    warmup_score: warmupScore,

    // Status
    qualifying,
    excluded,

    // Backward compat aliases
    time_in_maf_zone_pct: belowCeilingPct,
    time_in_qualifying_zone_pct: belowCeilingPct,
  };
}

// ─── Utility Exports ─────────────────────────────────────────────────────────

export function formatPace(pace: number, units: 'km' | 'mi'): string {
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /${units}`;
}

export function formatEF(ef: number): string {
  return ef.toFixed(2);
}
