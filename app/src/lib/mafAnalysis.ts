// Client-side MAF analysis engine — v2 ceiling model
// Mirrors worker/src/lib/mafAnalysis.ts interface exactly.
// MAF HR is a ceiling — everything at or below is good.

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MAFTiers {
  ceiling: number;            // maf_hr — do not cross
  controlled_low: number;     // ceiling - 6
  controlled_high: number;    // ceiling - 1
  easy_low: number;           // ceiling - 13
  easy_high: number;          // ceiling - 7
  recovery_below: number;     // ceiling - 13
}

export function computeMAFTiers(maf_hr: number): MAFTiers {
  return {
    ceiling: maf_hr,
    controlled_low: maf_hr - 6,
    controlled_high: maf_hr - 1,
    easy_low: maf_hr - 13,
    easy_high: maf_hr - 7,
    recovery_below: maf_hr - 13,
  }
}

export interface MAFActivity {
  // Identity
  id: number
  date: string
  name: string
  sport_type: string
  duration_seconds: number
  distance_meters: number
  elevation_gain: number

  // Core HR metrics
  avg_hr: number
  avg_cadence: number
  avg_pace: number
  efficiency_factor: number

  // Ceiling compliance
  time_below_ceiling_pct: number     // % of run at or below ceiling (the main number)
  time_over_ceiling_pct: number      // % of run above ceiling
  time_controlled_pct: number        // % in controlled tier
  time_easy_pct: number              // % in easy tier
  time_recovery_pct: number          // % in recovery tier

  // Pace metrics
  maf_pace: number                   // avg pace while below ceiling
  cardiac_drift: number | null
  aerobic_decoupling: number | null
  cadence_in_zone: number | null     // cadence while below ceiling
  negative_split: boolean
  pace_steadiness_score: number

  // Discipline metrics
  zone_minutes: number               // minutes below ceiling
  longest_zone_streak_minutes: number
  zone_entries: number               // times HR dropped back below ceiling after spiking
  warmup_score: number

  // Status
  qualifying: boolean
  excluded: boolean

  // Backward compat aliases (so old code doesn't break during transition)
  time_in_maf_zone_pct: number
  time_in_qualifying_zone_pct: number
}

export interface MAFTrend {
  date: string
  name: string
  // Primary: Heart Rate
  avgHr: number | null
  rollingHr: number | null
  // Secondary overlays
  mafPace: number | null
  rollingMafPace: number | null
  ef: number | null
  rollingEf: number | null
  cadence: number | null
  rollingCadence: number | null
  // Context
  decoupling: number | null
  rollingDecoupling: number | null
  timeInZonePct: number   // now = time_below_ceiling_pct
  qualifying: boolean
}

export interface MAFSummary {
  // Primary: Heart Rate
  currentAvgHr: number | null
  hrTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  hrTrendSlope: number | null
  zoneDiscipline: number | null   // now = avg time_below_ceiling_pct
  zoneTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  // Secondary
  currentMafPace: number | null
  paceTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  paceTrendSlope: number | null
  currentEf: number | null
  efTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  avgDecoupling: number | null
  avgCadence: number | null
  cadenceTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  totalRuns: number
  totalQualifyingRuns: number
  qualifyingPct: number
}

interface StreamData {
  heartrate?: { data: number[] }
  cadence?: { data: number[] }
  velocity_smooth?: { data: number[] }
  time?: { data: number[] }
  distance?: { data: number[] }
  altitude?: { data: number[] }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METERS_PER_MILE = 1609.344
const METERS_PER_KM = 1000

// Minimum velocity threshold (m/s): filters out GPS drift, standing still, tying shoes.
// 0.5 m/s ≈ 53 min/mi — anything slower is not meaningful movement.
const MIN_VELOCITY = 0.5

// Walking threshold (m/s): below this is walking, not running.
// 1.7 m/s ≈ 15:45/mi or 9:48/km
const WALKING_VELOCITY = 1.7

// ─── Helpers ──────────────────────────────────────────────────────────────────

function velocityToPace(metersPerSec: number, units: 'km' | 'mi'): number {
  if (metersPerSec <= 0) return 0
  const divisor = units === 'mi' ? METERS_PER_MILE : METERS_PER_KM
  return (divisor / metersPerSec) / 60
}

function computeEF(avgSpeedMs: number, avgHr: number): number {
  if (avgHr <= 0 || avgSpeedMs <= 0) return 0
  const metersPerMin = avgSpeedMs * 60
  return metersPerMin / avgHr
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((sum, v) => sum + v, 0) / arr.length
}

function coefficientOfVariation(arr: number[]): number {
  if (arr.length < 2) return 0
  const avg = mean(arr)
  if (avg === 0) return 0
  const variance = arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / arr.length
  return Math.sqrt(variance) / avg
}

// ─── Tier Bucketing ──────────────────────────────────────────────────────────

interface TierBreakdown {
  below_ceiling_pct: number
  over_ceiling_pct: number
  controlled_pct: number
  easy_pct: number
  recovery_pct: number
}

function computeTierBreakdown(hr: number[], tiers: MAFTiers): TierBreakdown {
  if (hr.length === 0) {
    return { below_ceiling_pct: 0, over_ceiling_pct: 0, controlled_pct: 0, easy_pct: 0, recovery_pct: 0 }
  }

  let over = 0
  let controlled = 0
  let easy = 0
  let recovery = 0

  for (let i = 0; i < hr.length; i++) {
    const h = hr[i]
    if (h > tiers.ceiling) {
      over++
    } else if (h >= tiers.controlled_low) {
      controlled++
    } else if (h >= tiers.easy_low) {
      easy++
    } else {
      recovery++
    }
  }

  const total = hr.length
  return {
    below_ceiling_pct: ((controlled + easy + recovery) / total) * 100,
    over_ceiling_pct: (over / total) * 100,
    controlled_pct: (controlled / total) * 100,
    easy_pct: (easy / total) * 100,
    recovery_pct: (recovery / total) * 100,
  }
}

// ─── Metric Calculators ─────────────────────────────────────────────────────

function computeBelowCeilingMinutes(hr: number[], ceiling: number): number {
  let seconds = 0
  for (let i = 0; i < hr.length; i++) {
    if (hr[i] <= ceiling) seconds++
  }
  return seconds / 60
}

function computeCeilingStreaks(
  hr: number[],
  ceiling: number
): { longest_streak_minutes: number; zone_entries: number } {
  let longestStreak = 0
  let currentStreak = 0
  let entries = 0
  let wasBelow = false

  for (let i = 0; i < hr.length; i++) {
    const below = hr[i] <= ceiling

    if (below) {
      if (!wasBelow && i > 0) entries++
      currentStreak++
      if (currentStreak > longestStreak) longestStreak = currentStreak
    } else {
      currentStreak = 0
    }

    wasBelow = below
  }

  return {
    longest_streak_minutes: longestStreak / 60,
    zone_entries: entries,
  }
}

function computeWarmupScore(hr: number[], ceiling: number): number {
  const warmupWindow = Math.min(hr.length, 600)
  if (warmupWindow === 0) return 0

  const warmupTarget = ceiling - 10
  let belowTargetCount = 0
  let earlySpike = false

  for (let i = 0; i < warmupWindow; i++) {
    if (hr[i] <= warmupTarget) belowTargetCount++
    if (i < 300 && hr[i] > ceiling) earlySpike = true
  }

  let score = (belowTargetCount / warmupWindow) * 100
  if (earlySpike) score = Math.min(score, 50)

  return Math.round(score)
}

function computeNegativeSplit(velocity: number[]): boolean {
  const mid = Math.floor(velocity.length / 2)
  if (mid === 0) return false

  const firstHalf = mean(velocity.slice(0, mid))
  const secondHalf = mean(velocity.slice(mid))
  if (firstHalf <= 0) return false

  return (secondHalf - firstHalf) / firstHalf >= 0.02
}

function computePaceSteadiness(
  velocity: number[],
  hr: number[],
  ceiling: number
): number {
  const len = Math.min(velocity.length, hr.length)
  const belowCeilingVelocities: number[] = []

  for (let i = 0; i < len; i++) {
    if (hr[i] <= ceiling && velocity[i] > MIN_VELOCITY) {
      belowCeilingVelocities.push(velocity[i])
    }
  }

  if (belowCeilingVelocities.length < 10) return 0

  const cv = coefficientOfVariation(belowCeilingVelocities)
  return Math.round(Math.max(0, 100 - cv * 500))
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

/**
 * Analyze a single activity using the ceiling model.
 * mafHr is the only HR param needed — it is the ceiling.
 */
export function analyzeActivity(
  activity: any,
  streams: StreamData | null,
  mafHr: number,
  units: 'km' | 'mi',
  excluded: boolean
): MAFActivity {
  const tiers = computeMAFTiers(mafHr)

  const avgPace = activity.average_speed > 0
    ? velocityToPace(activity.average_speed, units)
    : 0

  const ef = computeEF(activity.average_speed, activity.average_heartrate || 0)

  // Defaults for no stream data
  let tierBreakdown: TierBreakdown = {
    below_ceiling_pct: 0, over_ceiling_pct: 0,
    controlled_pct: 0, easy_pct: 0, recovery_pct: 0,
  }
  let mafPace = avgPace
  let cardiacDrift: number | null = null
  let aerobicDecoupling: number | null = null
  let cadenceInZone: number | null = null
  let zoneMinutes = 0
  let longestZoneStreakMinutes = 0
  let zoneEntries = 0
  let warmupScore = 0
  let negativeSplit = false
  let paceSteadinessScore = 0

  if (streams?.heartrate?.data && streams?.velocity_smooth?.data) {
    const hr = streams.heartrate.data
    const velocity = streams.velocity_smooth.data
    const cadence = streams.cadence?.data
    const len = Math.min(hr.length, velocity.length)

    // ── Tier breakdown (single pass) ────────────────────────────────────
    tierBreakdown = computeTierBreakdown(hr.slice(0, len), tiers)

    // ── Pace + cadence while below ceiling ──────────────────────────────
    // FIX: Average velocities (m/s), then convert to pace once.
    // Old code averaged pace values, which is mathematically wrong because
    // pace is inversely proportional to speed. A single near-stop second
    // (e.g., 0.1 m/s = 268 min/mi) would massively skew the average.
    let belowCeilingVelocitySum = 0
    let belowCeilingVelocityCount = 0
    let belowCeilingCadenceSum = 0
    let belowCeilingCadenceCount = 0

    for (let i = 0; i < len; i++) {
      if (hr[i] <= tiers.ceiling) {
        if (velocity[i] > MIN_VELOCITY) {
          belowCeilingVelocitySum += velocity[i]
          belowCeilingVelocityCount++
        }
        // Only count cadence when actually running (not walking)
        if (cadence && cadence[i] > 0 && velocity[i] > WALKING_VELOCITY) {
          belowCeilingCadenceSum += cadence[i] * 2
          belowCeilingCadenceCount++
        }
      }
    }

    // Convert average velocity to pace (correct way)
    mafPace = belowCeilingVelocityCount > 0
      ? velocityToPace(belowCeilingVelocitySum / belowCeilingVelocityCount, units)
      : avgPace
    cadenceInZone = belowCeilingCadenceCount > 0 ? belowCeilingCadenceSum / belowCeilingCadenceCount : null

    // ── Cardiac drift ───────────────────────────────────────────────────
    const midpoint = Math.floor(len / 2)
    if (midpoint > 0) {
      const firstHalfHr = mean(hr.slice(0, midpoint))
      const secondHalfHr = mean(hr.slice(midpoint, len))
      cardiacDrift = firstHalfHr > 0
        ? ((secondHalfHr - firstHalfHr) / firstHalfHr) * 100
        : null
    }

    // ── Aerobic decoupling ──────────────────────────────────────────────
    if (midpoint > 0) {
      const firstHalfPace = mean(velocity.slice(0, midpoint))
      const secondHalfPace = mean(velocity.slice(midpoint, len))
      const firstHalfHrVal = mean(hr.slice(0, midpoint))
      const secondHalfHrVal = mean(hr.slice(midpoint, len))

      if (firstHalfPace > 0 && firstHalfHrVal > 0) {
        const paceRatio = secondHalfPace / firstHalfPace
        const hrRatio = secondHalfHrVal / firstHalfHrVal
        aerobicDecoupling = hrRatio > 0 ? ((paceRatio / hrRatio) - 1) * 100 : null
      }
    }

    // ── Discipline metrics ──────────────────────────────────────────────
    zoneMinutes = computeBelowCeilingMinutes(hr.slice(0, len), tiers.ceiling)

    const streaks = computeCeilingStreaks(hr.slice(0, len), tiers.ceiling)
    longestZoneStreakMinutes = streaks.longest_streak_minutes
    zoneEntries = streaks.zone_entries

    warmupScore = computeWarmupScore(hr, tiers.ceiling)
    negativeSplit = computeNegativeSplit(velocity.slice(0, len))
    paceSteadinessScore = computePaceSteadiness(velocity, hr, tiers.ceiling)

  } else {
    // No stream data — estimate from averages
    if (activity.average_heartrate) {
      const belowCeiling = activity.average_heartrate <= mafHr
      tierBreakdown.below_ceiling_pct = belowCeiling ? 75 : 25
      tierBreakdown.over_ceiling_pct = belowCeiling ? 25 : 75
      if (belowCeiling) {
        zoneMinutes = (activity.elapsed_time * 0.75) / 60
      }
    }
  }

  // Qualifying: ≥20 min AND ≥60% below ceiling AND avg HR ≤ ceiling
  const qualifying = !excluded
    && activity.elapsed_time >= 1200
    && tierBreakdown.below_ceiling_pct >= 60
    && (activity.average_heartrate || 0) <= mafHr

  const belowCeilingPct = tierBreakdown.below_ceiling_pct

  return {
    // Identity
    id: activity.id,
    date: activity.start_date,
    name: activity.name,
    sport_type: activity.sport_type || activity.type || '',
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
  }
}

// ─── Per-Metric Eligibility ──────────────────────────────────────────────────

const CYCLING_TYPES = ['ride', 'virtualride', 'ebike_ride', 'ebikeride', 'mountainbikeride', 'handcycle', 'velomobile']

function isCycling(a: MAFActivity): boolean {
  return CYCLING_TYPES.includes((a.sport_type ?? '').toLowerCase())
}

const hasHR = (a: MAFActivity): boolean => a.avg_hr > 0
const hasPace = (a: MAFActivity): boolean => a.avg_pace > 0 && !isCycling(a)
const hasEF = (a: MAFActivity): boolean => hasHR(a) && hasPace(a) && a.efficiency_factor > 0
const hasCadence = (a: MAFActivity): boolean => a.avg_cadence > 0

// ─── Trends & Summary ────────────────────────────────────────────────────────

export function computeTrends(activities: MAFActivity[]): MAFTrend[] {
  const included = [...activities]
    .filter((a) => !a.excluded)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (included.length === 0) return []

  // Adaptive rolling window: ~25% of total data points, minimum 3 runs
  const windowSize = Math.max(3, Math.round(included.length * 0.25))

  return included.map((a, i) => {
    // Take up to windowSize runs ending at current index
    const windowStart = Math.max(0, i - windowSize + 1)
    const window = included.slice(windowStart, i + 1)

    // HR rolling — only activities with HR data
    const hrWindow = window.filter(hasHR)
    const rollingHr = hrWindow.length >= 2
      ? hrWindow.reduce((sum, w) => sum + w.avg_hr, 0) / hrWindow.length
      : null

    // Pace rolling — exclude cycling and zero-pace activities
    const paceWindow = window.filter(hasPace)
    const rollingMafPace = paceWindow.length >= 2
      ? paceWindow.reduce((sum, w) => sum + w.maf_pace, 0) / paceWindow.length
      : null

    // EF rolling — requires both pace and HR, non-cycling
    const efWindow = window.filter(hasEF)
    const rollingEf = efWindow.length >= 2
      ? efWindow.reduce((sum, w) => sum + w.efficiency_factor, 0) / efWindow.length
      : null

    const cadenceWindow = window.filter((w) => w.cadence_in_zone !== null && hasCadence(w))
    const rollingCadence = cadenceWindow.length >= 2
      ? cadenceWindow.reduce((sum, w) => sum + w.cadence_in_zone!, 0) / cadenceWindow.length
      : null

    const decouplingWindow = window.filter((w) => w.aerobic_decoupling !== null)
    const rollingDecoupling = decouplingWindow.length >= 2
      ? decouplingWindow.reduce((sum, w) => sum + w.aerobic_decoupling!, 0) / decouplingWindow.length
      : null

    return {
      date: a.date,
      name: a.name,
      avgHr: hasHR(a) ? a.avg_hr : null,
      rollingHr,
      mafPace: hasPace(a) ? a.maf_pace : null,
      rollingMafPace,
      ef: hasEF(a) ? a.efficiency_factor : null,
      rollingEf,
      cadence: a.cadence_in_zone,
      rollingCadence,
      decoupling: a.aerobic_decoupling,
      rollingDecoupling,
      timeInZonePct: a.time_below_ceiling_pct,
      qualifying: a.qualifying,
    }
  })
}

export function computeSummary(activities: MAFActivity[]): MAFSummary {
  const included = activities.filter((a) => !a.excluded)
  const qualifying = included.filter((a) => a.qualifying)

  if (included.length === 0) {
    return {
      currentAvgHr: null,
      hrTrendDirection: 'insufficient',
      hrTrendSlope: null,
      zoneDiscipline: null,
      zoneTrendDirection: 'insufficient',
      currentMafPace: null,
      paceTrendDirection: 'insufficient',
      paceTrendSlope: null,
      currentEf: null,
      efTrendDirection: 'insufficient',
      avgDecoupling: null,
      avgCadence: null,
      cadenceTrendDirection: 'insufficient',
      totalRuns: 0,
      totalQualifyingRuns: 0,
      qualifyingPct: 0,
    }
  }

  const sorted = [...included].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const now = Date.now()
  const fourWeeksAgo = now - 28 * 24 * 60 * 60 * 1000
  const eightWeeksAgo = now - 56 * 24 * 60 * 60 * 1000

  const recent = sorted.filter((a) => new Date(a.date).getTime() >= fourWeeksAgo)
  const trendWindow = sorted.filter((a) => new Date(a.date).getTime() >= eightWeeksAgo)

  // Eligibility-filtered sets
  const recentHR = recent.filter(hasHR)
  const recentPace = recent.filter(hasPace)
  const recentEF = recent.filter(hasEF)
  const trendHR = trendWindow.filter(hasHR)
  const trendPace = trendWindow.filter(hasPace)
  const trendEF = trendWindow.filter(hasEF)
  const zoneActivities = included.filter(hasHR)

  const currentAvgHr = recentHR.length > 0
    ? recentHR.reduce((sum, a) => sum + a.avg_hr, 0) / recentHR.length
    : sorted.filter(hasHR).length > 0 ? sorted.filter(hasHR).pop()!.avg_hr : null

  const currentMafPace = recentPace.length > 0
    ? recentPace.reduce((sum, a) => sum + a.maf_pace, 0) / recentPace.length
    : sorted.filter(hasPace).length > 0 ? sorted.filter(hasPace).pop()!.maf_pace : null

  const currentEf = recentEF.length > 0
    ? recentEF.reduce((sum, a) => sum + a.efficiency_factor, 0) / recentEF.length
    : sorted.filter(hasEF).length > 0 ? sorted.filter(hasEF).pop()!.efficiency_factor : null

  let hrTrendSlope: number | null = null
  let hrTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'
  let paceTrendSlope: number | null = null
  let paceTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'
  let efTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'

  if (trendHR.length >= 3) {
    const baseTime = new Date(trendHR[0].date).getTime()
    const toWeeks = (d: string) => (new Date(d).getTime() - baseTime) / (7 * 24 * 60 * 60 * 1000)

    const hrPoints = trendHR.map((a) => ({ x: toWeeks(a.date), y: a.avg_hr }))
    hrTrendSlope = linearSlope(hrPoints)
    if (hrTrendSlope < -0.3) hrTrendDirection = 'improving'
    else if (hrTrendSlope > 0.3) hrTrendDirection = 'regressing'
    else hrTrendDirection = 'plateau'
  }

  if (trendPace.length >= 3) {
    const baseTime = new Date(trendPace[0].date).getTime()
    const toWeeks = (d: string) => (new Date(d).getTime() - baseTime) / (7 * 24 * 60 * 60 * 1000)
    const pacePoints = trendPace.map((a) => ({ x: toWeeks(a.date), y: a.maf_pace }))
    paceTrendSlope = linearSlope(pacePoints) * 60
    if (paceTrendSlope < -1) paceTrendDirection = 'improving'
    else if (paceTrendSlope > 1) paceTrendDirection = 'regressing'
    else paceTrendDirection = 'plateau'
  }

  if (trendEF.length >= 3) {
    const baseTime = new Date(trendEF[0].date).getTime()
    const toWeeks = (d: string) => (new Date(d).getTime() - baseTime) / (7 * 24 * 60 * 60 * 1000)
    const efPoints = trendEF.map((a) => ({ x: toWeeks(a.date), y: a.efficiency_factor }))
    const efSlope = linearSlope(efPoints)
    if (efSlope > 0.01) efTrendDirection = 'improving'
    else if (efSlope < -0.01) efTrendDirection = 'regressing'
    else efTrendDirection = 'plateau'
  }

  const zoneDiscipline = zoneActivities.length > 0
    ? zoneActivities.reduce((sum, a) => sum + a.time_below_ceiling_pct, 0) / zoneActivities.length
    : null

  // Zone trend: compare recent 4wk avg to prior 4wk avg
  let zoneTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'
  const trendZone = trendWindow.filter(hasHR)
  if (trendZone.length >= 3) {
    const baseTime = new Date(trendZone[0].date).getTime()
    const toWeeks = (d: string) => (new Date(d).getTime() - baseTime) / (7 * 24 * 60 * 60 * 1000)
    const zonePoints = trendZone.map((a) => ({ x: toWeeks(a.date), y: a.time_below_ceiling_pct }))
    const zoneSlope = linearSlope(zonePoints)
    if (zoneSlope > 0.5) zoneTrendDirection = 'improving'
    else if (zoneSlope < -0.5) zoneTrendDirection = 'regressing'
    else zoneTrendDirection = 'plateau'
  }

  const withDecoupling = qualifying.filter((a) => a.aerobic_decoupling !== null)
  const avgDecoupling = withDecoupling.length > 0
    ? withDecoupling.reduce((sum, a) => sum + a.aerobic_decoupling!, 0) / withDecoupling.length
    : null

  const withCadence = qualifying.filter((a) => a.cadence_in_zone !== null && hasCadence(a))
  const avgCadence = withCadence.length > 0
    ? withCadence.reduce((sum, a) => sum + a.cadence_in_zone!, 0) / withCadence.length
    : null

  // Cadence trend
  let cadenceTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'
  const cadenceTrend = trendWindow.filter((a) => a.cadence_in_zone !== null && hasCadence(a))
  if (cadenceTrend.length >= 3) {
    const baseTime = new Date(cadenceTrend[0].date).getTime()
    const toWeeks = (d: string) => (new Date(d).getTime() - baseTime) / (7 * 24 * 60 * 60 * 1000)
    const cadencePoints = cadenceTrend.map((a) => ({ x: toWeeks(a.date), y: a.cadence_in_zone! }))
    const cadenceSlope = linearSlope(cadencePoints)
    if (cadenceSlope > 0.2) cadenceTrendDirection = 'improving'
    else if (cadenceSlope < -0.2) cadenceTrendDirection = 'regressing'
    else cadenceTrendDirection = 'plateau'
  }

  return {
    currentAvgHr,
    hrTrendDirection,
    hrTrendSlope,
    zoneDiscipline,
    zoneTrendDirection,
    currentMafPace,
    paceTrendDirection,
    paceTrendSlope,
    currentEf,
    efTrendDirection,
    avgDecoupling,
    avgCadence,
    cadenceTrendDirection,
    totalRuns: included.length,
    totalQualifyingRuns: qualifying.length,
    qualifyingPct: included.length > 0 ? (qualifying.length / included.length) * 100 : 0,
  }
}

function linearSlope(points: { x: number; y: number }[]): number {
  const n = points.length
  if (n < 2) return 0
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumXX - sumX * sumX
  return denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
}

// ─── Utility Exports ─────────────────────────────────────────────────────────

export function formatPace(pace: number, units: 'km' | 'mi'): string {
  const minutes = Math.floor(pace)
  const seconds = Math.round((pace - minutes) * 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')} /${units}`
}

export function formatEF(ef: number): string {
  return ef.toFixed(2)
}
