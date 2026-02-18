import { ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts'
import type { MAFSummary, MAFTrend } from '../lib/mafAnalysis'
import { formatPace, formatEF } from '../lib/mafAnalysis'

interface Props {
  summary: MAFSummary
  trends: MAFTrend[]
  units: 'km' | 'mi'
  mafHr: number
  mafZoneLow: number
  mafZoneHigh: number
}

type TrendDirection = 'improving' | 'plateau' | 'regressing' | 'insufficient'

const TREND_COLORS: Record<TrendDirection, string> = {
  improving: 'text-green-400',
  plateau: 'text-yellow-400',
  regressing: 'text-red-400',
  insufficient: 'text-gray-500',
}

const TREND_ARROWS: Record<TrendDirection, string> = {
  improving: '↓',
  plateau: '→',
  regressing: '↑',
  insufficient: '—',
}

function Sparkline({
  data,
  color,
  referenceLine,
}: {
  data: { value: number | null }[]
  color: string
  referenceLine?: number
}) {
  const filtered = data.filter((d) => d.value !== null && d.value > 0)
  if (filtered.length < 2) return <div className="h-10" />

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={filtered} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        {referenceLine !== undefined && (
          <ReferenceLine y={referenceLine} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5} />
        )}
        <Line
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function trendLabel(direction: TrendDirection, metric: string): string {
  if (direction === 'insufficient') return 'Not enough data'
  const labels: Record<string, Record<string, string>> = {
    hr: { improving: 'HR dropping', plateau: 'Stable', regressing: 'HR rising' },
    pace: { improving: 'Getting faster', plateau: 'Stable', regressing: 'Slowing' },
    ef: { improving: 'Improving', plateau: 'Stable', regressing: 'Declining' },
  }
  return labels[metric]?.[direction] || direction
}

export function SummaryCards({ summary, trends, units, mafHr, mafZoneLow, mafZoneHigh }: Props) {
  // Build sparkline data from trends
  const hrData = trends.map((t) => ({ value: t.rollingHr ?? t.avgHr }))
  const cadenceData = trends.map((t) => ({ value: t.cadence }))
  const paceData = trends.map((t) => ({ value: t.rollingMafPace ?? t.mafPace }))
  const zoneData = trends.map((t) => ({ value: t.timeInZonePct }))
  const efData = trends.map((t) => ({ value: t.rollingEf ?? t.ef }))

  // Qualifying runs as cumulative sparkline
  let qualCount = 0
  const qualData = trends.map((t) => {
    if (t.qualifying) qualCount++
    return { value: qualCount }
  })

  // HR deviation from MAF
  const hrDeviation = summary.currentAvgHr !== null ? summary.currentAvgHr - mafHr : null
  const hrDeviationColor =
    hrDeviation !== null
      ? Math.abs(hrDeviation) <= 3
        ? 'text-green-400'
        : Math.abs(hrDeviation) <= 5
          ? 'text-yellow-400'
          : 'text-red-400'
      : 'text-gray-500'

  // Cadence assessment
  const cadenceNote =
    summary.avgCadence !== null
      ? summary.avgCadence >= 170
        ? 'On target'
        : 'Below 170 target'
      : '—'

  return (
    <div className="space-y-3">
      {/* Row 1: 4 metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Avg HR */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Avg HR</p>
            <span className={`text-xs ${TREND_COLORS[summary.hrTrendDirection]}`}>
              {TREND_ARROWS[summary.hrTrendDirection]} {trendLabel(summary.hrTrendDirection, 'hr')}
            </span>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-400">
              {summary.currentAvgHr !== null ? Math.round(summary.currentAvgHr) : '—'}
              <span className="text-sm font-normal text-gray-500 ml-1">bpm</span>
            </p>
            <p className={`text-xs mt-0.5 ${hrDeviationColor}`}>
              {hrDeviation !== null
                ? hrDeviation > 0
                  ? `+${hrDeviation.toFixed(0)} above target`
                  : hrDeviation < 0
                    ? `${hrDeviation.toFixed(0)} below target`
                    : 'On target'
                : '—'}
            </p>
          </div>
          <Sparkline data={hrData} color="#ef4444" referenceLine={mafHr} />
        </div>

        {/* Avg Cadence */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Cadence</p>
            <span className="text-xs text-gray-500">{cadenceNote}</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">
              {summary.avgCadence !== null ? Math.round(summary.avgCadence) : '—'}
              <span className="text-sm font-normal text-gray-500 ml-1">spm</span>
            </p>
          </div>
          <Sparkline data={cadenceData} color="#22c55e" referenceLine={170} />
        </div>

        {/* Avg Pace */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Pace</p>
            <span className={`text-xs ${TREND_COLORS[summary.paceTrendDirection]}`}>
              {TREND_ARROWS[summary.paceTrendDirection]} {trendLabel(summary.paceTrendDirection, 'pace')}
            </span>
          </div>
          <div>
            <p className="text-2xl font-bold text-orange-400">
              {summary.currentMafPace ? formatPace(summary.currentMafPace, units) : '—'}
              <span className="text-sm font-normal text-gray-500 ml-1">/{units}</span>
            </p>
            {summary.paceTrendSlope !== null && (
              <p className={`text-xs mt-0.5 ${TREND_COLORS[summary.paceTrendDirection]}`}>
                {summary.paceTrendSlope > 0 ? '+' : ''}{summary.paceTrendSlope.toFixed(1)}s/wk
              </p>
            )}
          </div>
          <Sparkline data={paceData} color="#f97316" />
        </div>

        {/* % Time in Zone */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Time in Zone</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {summary.zoneDiscipline !== null ? `${summary.zoneDiscipline.toFixed(0)}%` : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              In {mafZoneLow}–{mafZoneHigh}
            </p>
          </div>
          <Sparkline data={zoneData} color="#8b5cf6" />
        </div>
      </div>

      {/* Row 2: 3 sparkline cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* HR Trend */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">HR Trend</p>
            <span className={`text-xs ${TREND_COLORS[summary.hrTrendDirection]}`}>
              {summary.hrTrendSlope !== null
                ? `${summary.hrTrendSlope > 0 ? '+' : ''}${summary.hrTrendSlope.toFixed(1)} bpm/wk`
                : '—'}
            </span>
          </div>
          <Sparkline data={hrData} color="#ef4444" referenceLine={mafHr} />
        </div>

        {/* Efficiency */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Efficiency</p>
            <span className={`text-xs ${TREND_COLORS[summary.efTrendDirection]}`}>
              {summary.currentEf !== null ? formatEF(summary.currentEf) : '—'}
            </span>
          </div>
          <Sparkline data={efData} color="#3b82f6" />
        </div>

        {/* Qualifying Runs */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Qualifying</p>
            <span className="text-xs text-gray-400">
              {summary.totalQualifyingRuns}/{summary.totalRuns}
              <span className="text-gray-600 ml-1">({summary.qualifyingPct.toFixed(0)}%)</span>
            </span>
          </div>
          <Sparkline data={qualData} color="#22c55e" />
        </div>
      </div>
    </div>
  )
}
