export interface MAFActivity {
  id: number
  date: string
  name: string
  duration_seconds: number
  distance_meters: number
  avg_hr: number
  avg_cadence: number
  avg_pace: number
  time_in_maf_zone_pct: number
  time_in_qualifying_zone_pct: number
  maf_pace: number
  elevation_gain: number
  cardiac_drift: number | null
  aerobic_decoupling: number | null
  cadence_in_zone: number | null
  efficiency_factor: number
  qualifying: boolean
  excluded: boolean
}

export interface MAFTrend {
  date: string
  // Primary: Heart Rate
  avgHr: number
  rollingHr: number | null
  // Secondary overlays
  mafPace: number
  rollingMafPace: number | null
  ef: number
  rollingEf: number | null
  cadence: number | null
  rollingCadence: number | null
  // Context
  decoupling: number | null
  rollingDecoupling: number | null
  timeInZonePct: number
  qualifying: boolean
}

export interface MAFSummary {
  // Primary: Heart Rate
  currentAvgHr: number | null
  hrTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  hrTrendSlope: number | null // bpm per week
  zoneDiscipline: number | null
  // Secondary
  currentMafPace: number | null
  paceTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  paceTrendSlope: number | null
  currentEf: number | null
  efTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient'
  avgDecoupling: number | null
  avgCadence: number | null
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

const METERS_PER_MILE = 1609.344
const METERS_PER_KM = 1000

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

export function analyzeActivity(
  activity: any,
  streams: StreamData | null,
  mafHr: number,
  mafZoneLow: number,
  mafZoneHigh: number,
  qualifyingTolerance: number,
  units: 'km' | 'mi',
  excluded: boolean
): MAFActivity {
  const avgPace = activity.average_speed > 0
    ? velocityToPace(activity.average_speed, units)
    : 0

  const ef = computeEF(activity.average_speed, activity.average_heartrate || 0)
  const qualifyingHigh = mafZoneHigh + qualifyingTolerance

  let timeInZonePct = 0
  let timeInQualifyingPct = 0
  let mafPace = avgPace
  let cardiacDrift: number | null = null
  let aerobicDecoupling: number | null = null
  let cadenceInZone: number | null = null

  if (streams?.heartrate?.data && streams?.velocity_smooth?.data) {
    const hr = streams.heartrate.data
    const velocity = streams.velocity_smooth.data
    const cadence = streams.cadence?.data
    const len = Math.min(hr.length, velocity.length)

    let inZoneCount = 0
    let inQualifyingCount = 0
    let inZonePaceSum = 0
    let inZoneCadenceSum = 0
    let inZoneCadenceCount = 0

    for (let i = 0; i < len; i++) {
      if (hr[i] >= mafZoneLow && hr[i] <= mafZoneHigh) {
        inZoneCount++
        if (velocity[i] > 0) {
          inZonePaceSum += velocityToPace(velocity[i], units)
        }
        if (cadence && cadence[i] > 0) {
          inZoneCadenceSum += cadence[i] * 2
          inZoneCadenceCount++
        }
      }
      if (hr[i] >= mafZoneLow && hr[i] <= qualifyingHigh) {
        inQualifyingCount++
      }
    }

    timeInZonePct = len > 0 ? (inZoneCount / len) * 100 : 0
    timeInQualifyingPct = len > 0 ? (inQualifyingCount / len) * 100 : 0
    mafPace = inZoneCount > 0 ? inZonePaceSum / inZoneCount : avgPace
    cadenceInZone = inZoneCadenceCount > 0 ? inZoneCadenceSum / inZoneCadenceCount : null

    const midpoint = Math.floor(len / 2)
    if (midpoint > 0) {
      const firstHalfHr = hr.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint
      const secondHalfHr = hr.slice(midpoint).reduce((a, b) => a + b, 0) / (len - midpoint)
      cardiacDrift = firstHalfHr > 0 ? ((secondHalfHr - firstHalfHr) / firstHalfHr) * 100 : null
    }

    if (midpoint > 0) {
      const p1 = velocity.slice(0, midpoint)
      const p2 = velocity.slice(midpoint)
      const h1 = hr.slice(0, midpoint)
      const h2 = hr.slice(midpoint)
      const p1Count = p1.length
      const p2Count = p2.length
      const firstHalfPace = p1.reduce((a, b) => a + b, 0) / p1Count
      const secondHalfPace = p2.reduce((a, b) => a + b, 0) / p2Count
      const firstHalfHr = h1.reduce((a, b) => a + b, 0) / p1Count
      const secondHalfHr = h2.reduce((a, b) => a + b, 0) / p2Count

      if (firstHalfPace > 0 && firstHalfHr > 0) {
        const paceRatio = secondHalfPace / firstHalfPace
        const hrRatio = secondHalfHr / firstHalfHr
        aerobicDecoupling = hrRatio > 0 ? ((paceRatio / hrRatio) - 1) * 100 : null
      }
    }
  } else {
    if (activity.average_heartrate) {
      timeInZonePct = (activity.average_heartrate >= mafZoneLow && activity.average_heartrate <= mafZoneHigh) ? 75 : 25
      timeInQualifyingPct = (activity.average_heartrate >= mafZoneLow && activity.average_heartrate <= qualifyingHigh) ? 75 : 25
    }
  }

  const qualifying = !excluded && activity.elapsed_time >= 1200 && timeInQualifyingPct >= 60

  return {
    id: activity.id,
    date: activity.start_date,
    name: activity.name,
    duration_seconds: activity.elapsed_time,
    distance_meters: activity.distance,
    avg_hr: activity.average_heartrate || 0,
    avg_cadence: activity.average_cadence ? activity.average_cadence * 2 : 0,
    avg_pace: avgPace,
    time_in_maf_zone_pct: timeInZonePct,
    time_in_qualifying_zone_pct: timeInQualifyingPct,
    maf_pace: mafPace,
    elevation_gain: activity.total_elevation_gain || 0,
    cardiac_drift: cardiacDrift,
    aerobic_decoupling: aerobicDecoupling,
    cadence_in_zone: cadenceInZone,
    efficiency_factor: ef,
    qualifying,
    excluded,
  }
}

export function computeTrends(activities: MAFActivity[]): MAFTrend[] {
  const included = [...activities]
    .filter((a) => !a.excluded)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (included.length === 0) return []

  return included.map((a, i) => {
    const fourWeeksAgo = new Date(a.date).getTime() - 28 * 24 * 60 * 60 * 1000
    const window = included.filter((w, wi) => wi <= i && new Date(w.date).getTime() >= fourWeeksAgo)

    const rollingHr = window.length >= 2
      ? window.reduce((sum, w) => sum + w.avg_hr, 0) / window.length
      : null

    const rollingMafPace = window.length >= 2
      ? window.reduce((sum, w) => sum + w.maf_pace, 0) / window.length
      : null

    const rollingEf = window.length >= 2
      ? window.reduce((sum, w) => sum + w.efficiency_factor, 0) / window.length
      : null

    const cadenceWindow = window.filter((w) => w.cadence_in_zone !== null)
    const rollingCadence = cadenceWindow.length >= 2
      ? cadenceWindow.reduce((sum, w) => sum + w.cadence_in_zone!, 0) / cadenceWindow.length
      : null

    const decouplingWindow = window.filter((w) => w.aerobic_decoupling !== null)
    const rollingDecoupling = decouplingWindow.length >= 2
      ? decouplingWindow.reduce((sum, w) => sum + w.aerobic_decoupling!, 0) / decouplingWindow.length
      : null

    return {
      date: a.date,
      avgHr: a.avg_hr,
      rollingHr,
      mafPace: a.maf_pace,
      rollingMafPace,
      ef: a.efficiency_factor,
      rollingEf,
      cadence: a.cadence_in_zone,
      rollingCadence,
      decoupling: a.aerobic_decoupling,
      rollingDecoupling,
      timeInZonePct: a.time_in_maf_zone_pct,
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
      currentMafPace: null,
      paceTrendDirection: 'insufficient',
      paceTrendSlope: null,
      currentEf: null,
      efTrendDirection: 'insufficient',
      avgDecoupling: null,
      avgCadence: null,
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

  // Current values (4-week avg)
  const currentAvgHr = recent.length > 0
    ? recent.reduce((sum, a) => sum + a.avg_hr, 0) / recent.length
    : sorted[sorted.length - 1].avg_hr

  const currentMafPace = recent.length > 0
    ? recent.reduce((sum, a) => sum + a.maf_pace, 0) / recent.length
    : sorted[sorted.length - 1].maf_pace

  const currentEf = recent.length > 0
    ? recent.reduce((sum, a) => sum + a.efficiency_factor, 0) / recent.length
    : sorted[sorted.length - 1].efficiency_factor

  // Trends (8-week slopes)
  let hrTrendSlope: number | null = null
  let hrTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'
  let paceTrendSlope: number | null = null
  let paceTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'
  let efTrendDirection: 'improving' | 'plateau' | 'regressing' | 'insufficient' = 'insufficient'

  if (trendWindow.length >= 3) {
    const baseTime = new Date(trendWindow[0].date).getTime()
    const toWeeks = (d: string) => (new Date(d).getTime() - baseTime) / (7 * 24 * 60 * 60 * 1000)

    // HR trend: negative slope = HR dropping = improving (body adapting)
    const hrPoints = trendWindow.map((a) => ({ x: toWeeks(a.date), y: a.avg_hr }))
    hrTrendSlope = linearSlope(hrPoints)
    if (hrTrendSlope < -0.3) hrTrendDirection = 'improving'
    else if (hrTrendSlope > 0.3) hrTrendDirection = 'regressing'
    else hrTrendDirection = 'plateau'

    // Pace trend: negative slope = pace getting faster = improving
    const pacePoints = trendWindow.map((a) => ({ x: toWeeks(a.date), y: a.maf_pace }))
    paceTrendSlope = linearSlope(pacePoints) * 60 // seconds per week
    if (paceTrendSlope < -1) paceTrendDirection = 'improving'
    else if (paceTrendSlope > 1) paceTrendDirection = 'regressing'
    else paceTrendDirection = 'plateau'

    // EF trend: positive slope = more speed per HR beat = improving
    const efPoints = trendWindow.map((a) => ({ x: toWeeks(a.date), y: a.efficiency_factor }))
    const efSlope = linearSlope(efPoints)
    if (efSlope > 0.01) efTrendDirection = 'improving'
    else if (efSlope < -0.01) efTrendDirection = 'regressing'
    else efTrendDirection = 'plateau'
  }

  const zoneDiscipline = included.length > 0
    ? included.reduce((sum, a) => sum + a.time_in_maf_zone_pct, 0) / included.length
    : null

  const withDecoupling = qualifying.filter((a) => a.aerobic_decoupling !== null)
  const avgDecoupling = withDecoupling.length > 0
    ? withDecoupling.reduce((sum, a) => sum + a.aerobic_decoupling!, 0) / withDecoupling.length
    : null

  const withCadence = qualifying.filter((a) => a.cadence_in_zone !== null)
  const avgCadence = withCadence.length > 0
    ? withCadence.reduce((sum, a) => sum + a.cadence_in_zone!, 0) / withCadence.length
    : null

  return {
    currentAvgHr,
    hrTrendDirection,
    hrTrendSlope,
    zoneDiscipline,
    currentMafPace,
    paceTrendDirection,
    paceTrendSlope,
    currentEf,
    efTrendDirection,
    avgDecoupling,
    avgCadence,
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

export function formatPace(pace: number, units: 'km' | 'mi'): string {
  const minutes = Math.floor(pace)
  const seconds = Math.round((pace - minutes) * 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')} /${units}`
}

export function formatEF(ef: number): string {
  return ef.toFixed(2)
}
