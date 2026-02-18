import type { MAFActivity, MAFSummary } from '../lib/mafAnalysis'

interface Props {
  summary: MAFSummary
  activities: MAFActivity[]
  mafHr: number
  mafZoneLow: number
  mafZoneHigh: number
  units: 'km' | 'mi'
}

interface Advice {
  headline: string
  body: string
  focus: string
  color: string
}

function generateAdvice(
  summary: MAFSummary,
  activities: MAFActivity[],
  mafHr: number,
  mafZoneLow: number,
  mafZoneHigh: number,
  units: 'km' | 'mi'
): Advice {
  const zone = `${mafZoneLow}–${mafZoneHigh} bpm`

  // Days since last run
  const sorted = [...activities].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const lastRunDate = sorted.length > 0 ? new Date(sorted[0].date) : null
  const daysSinceLastRun = lastRunDate
    ? Math.floor((Date.now() - lastRunDate.getTime()) / (24 * 60 * 60 * 1000))
    : 999

  // Runs in last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentRuns = activities.filter((a) => new Date(a.date).getTime() >= sevenDaysAgo)
  const weeklyCount = recentRuns.length

  const avgZoneDiscipline = summary.zoneDiscipline || 0
  const avgCadence = summary.avgCadence || 0
  const avgDecoupling = summary.avgDecoupling || 0

  // Current avg HR relative to target
  const hrDeviation = summary.currentAvgHr !== null ? summary.currentAvgHr - mafHr : 0

  // Priority 1: Consistency
  if (daysSinceLastRun >= 3) {
    return {
      headline: 'Time to Run!',
      body: `It's been ${daysSinceLastRun} days since your last run. Get out for an easy 30–40 minute run. The key: keep your heart rate in the ${zone} zone. Walk uphills if needed — the pace doesn't matter, the HR does.`,
      focus: 'Consistency',
      color: 'border-yellow-500',
    }
  }

  // Priority 2: HR too high — the primary concern
  if (hrDeviation > 5) {
    return {
      headline: 'Bring Your Heart Rate Down',
      body: `Your average HR is running ${Math.round(hrDeviation)} bpm above your MAF target of ${mafHr}. This is the #1 thing to fix. Slow down significantly — walk if you have to. Your target zone is ${zone}. The pace will feel painfully slow at first, but that's the point. Your aerobic system needs this.`,
      focus: 'HR Control',
      color: 'border-red-500',
    }
  }

  // Priority 3: Zone discipline
  if (avgZoneDiscipline < 60) {
    return {
      headline: 'Stay in the Zone',
      body: `Only ${avgZoneDiscipline.toFixed(0)}% of your run time is in the MAF zone (${zone}). You're likely starting too fast or pushing on hills. Warm up with 5 minutes of walking, then ease into a pace where your HR stays between ${mafZoneLow}–${mafZoneHigh}. Walk uphills. Target: >75% time in zone.`,
      focus: 'Zone Discipline',
      color: 'border-red-500',
    }
  }

  // Priority 4: HR trending up
  if (summary.hrTrendDirection === 'regressing') {
    return {
      headline: 'Recovery Week',
      body: `Your heart rate is trending upward over the past 8 weeks — possible overtraining, poor sleep, illness, or heat stress. Consider a recovery week: 3 easy runs of 25–30 minutes max, keeping HR firmly in ${zone}. Reassess in 7 days.`,
      focus: 'Recovery',
      color: 'border-red-500',
    }
  }

  // Priority 5: Cadence
  if (avgCadence > 0 && avgCadence < 170) {
    return {
      headline: 'Work on Cadence',
      body: `Your average cadence is ${Math.round(avgCadence)} spm, below the 170 target. Higher cadence at MAF HR means lighter, more efficient steps. Try a cadence drill: 30 seconds at 180+ spm every 5 minutes during your next run. Keep HR in ${zone}.`,
      focus: 'Cadence',
      color: 'border-yellow-500',
    }
  }

  // Priority 6: Volume
  if (weeklyCount < 3 && summary.hrTrendDirection === 'plateau') {
    return {
      headline: 'Add Another Run',
      body: `Your HR trend has plateaued and you're running ${weeklyCount}× per week. Adding a 4th easy run at MAF HR (${zone}) can help your aerobic system adapt faster. Duration: 40–60 minutes.`,
      focus: 'Volume',
      color: 'border-yellow-500',
    }
  }

  // Priority 7: Progressing well
  if (summary.hrTrendDirection === 'improving' && avgDecoupling < 5) {
    const longestRecent = recentRuns.length > 0
      ? Math.max(...recentRuns.map((a) => a.duration_seconds))
      : 0
    const suggestedDuration = longestRecent > 0 ? Math.round(longestRecent / 60) + 10 : 50
    return {
      headline: 'Extend Your Long Run',
      body: `Your aerobic system is adapting well — HR is dropping and decoupling is under 5%. Try ${suggestedDuration} minutes this week at MAF HR (${zone}). Your body is ready for more volume.`,
      focus: 'Duration',
      color: 'border-green-500',
    }
  }

  if (summary.hrTrendDirection === 'improving') {
    return {
      headline: 'Keep It Up!',
      body: `Your heart rate is trending down — your aerobic system is building. Stay consistent with your current training at ${zone}. No changes needed, just patience.`,
      focus: 'Consistency',
      color: 'border-green-500',
    }
  }

  return {
    headline: 'Stay Consistent',
    body: `Keep running 3–4 times per week with your heart rate in ${zone}. Focus on the HR, not the pace. Walk uphills, slow down on hot days. Progress takes patience — trust the process.`,
    focus: 'Consistency',
    color: 'border-gray-500',
  }
}

export function RunAdvisor({ summary, activities, mafHr, mafZoneLow, mafZoneHigh, units }: Props) {
  const advice = generateAdvice(summary, activities, mafHr, mafZoneLow, mafZoneHigh, units)

  return (
    <div className={`bg-gray-900 border-l-4 ${advice.color} rounded-lg p-5 space-y-2`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{advice.headline}</h3>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
          {advice.focus}
        </span>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{advice.body}</p>
    </div>
  )
}
