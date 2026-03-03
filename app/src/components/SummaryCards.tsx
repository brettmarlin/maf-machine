import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts'
import type { MAFSummary, MAFTrend } from '../lib/mafAnalysis'
import { formatPace, formatEF } from '../lib/mafAnalysis'

interface Props {
  summary: MAFSummary
  trends: MAFTrend[]
  units: 'km' | 'mi'
  mafHr: number
}

type TrendDirection = 'improving' | 'plateau' | 'regressing' | 'insufficient'

function Sparkline({
  data,
  referenceLine,
  color = '#f97316',
}: {
  data: { value: number | null }[]
  referenceLine?: number
  color?: string
}) {
  const filtered = data.filter((d) => d.value !== null && d.value > 0)
  if (filtered.length < 2) return <div className="h-10" />

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={filtered} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        {referenceLine !== undefined && (
          <ReferenceLine y={referenceLine} stroke={color} strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.3} />
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

function trendColor(direction: TrendDirection): string {
  if (direction === 'improving') return 'text-green-400'
  if (direction === 'regressing') return 'text-red-400'
  return 'text-gray-500'
}

function trendArrow(direction: TrendDirection, metric: string): string {
  if (direction === 'insufficient') return '—'
  if (direction === 'plateau') return '→'
  if (metric === 'hr') return direction === 'improving' ? '↘' : '↗'
  if (metric === 'pace') return direction === 'improving' ? '↗' : '↘'
  if (metric === 'ef') return direction === 'improving' ? '↗' : '↘'
  return direction === 'improving' ? '↗' : '↘'
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="text-gray-600 hover:text-gray-400 transition-colors ml-1 text-[10px]"
        aria-label="Info"
      >
        ⓘ
      </button>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 text-xs text-gray-300 bg-gray-800 border border-gray-700 rounded-lg shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}

export function SummaryCards({ summary, trends, units, mafHr }: Props) {
  const hrData = trends.map((t) => ({ value: t.rollingHr ?? t.avgHr }))
  const paceData = trends.map((t) => ({ value: t.rollingMafPace ?? t.mafPace }))

  const hrDeviation = summary.currentAvgHr !== null ? summary.currentAvgHr - mafHr : null

  return (
    <div className="space-y-2">
      {/* Primary: HR + MAF Pace — two equal cards with sparklines */}
      <div className="grid grid-cols-2 gap-3">
        {/* Heart Rate */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4 space-y-2">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Heart Rate
              <InfoTooltip text="Average heart rate across qualifying runs. Lower means your aerobic system is handling the work with less effort." />
            </p>
            <span className={`text-[10px] sm:text-xs ${trendColor(summary.hrTrendDirection)}`}>
              {trendArrow(summary.hrTrendDirection, 'hr')} {trendLabel(summary.hrTrendDirection, 'hr')}
            </span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-orange-400">
              {summary.currentAvgHr !== null ? Math.round(summary.currentAvgHr) : '—'}
              <span className="text-sm font-normal text-gray-500 ml-1">bpm</span>
            </p>
            <p className={`text-xs mt-0.5 ${
              hrDeviation !== null && hrDeviation <= 0 ? 'text-green-400/70' : 'text-gray-500'
            }`}>
              {hrDeviation !== null
                ? hrDeviation > 0
                  ? `${hrDeviation.toFixed(0)} above ceiling`
                  : hrDeviation < 0
                    ? `${Math.abs(hrDeviation).toFixed(0)} below ceiling`
                    : 'At ceiling'
                : '—'}
            </p>
          </div>
          <Sparkline data={hrData} referenceLine={mafHr} />
        </div>

        {/* MAF Pace */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4 space-y-2">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              MAF Pace
              <InfoTooltip text="Average pace while heart rate is below your ceiling. The key metric — this should get faster over months of training." />
            </p>
            <span className={`text-[10px] sm:text-xs ${trendColor(summary.paceTrendDirection)}`}>
              {trendArrow(summary.paceTrendDirection, 'pace')} {trendLabel(summary.paceTrendDirection, 'pace')}
            </span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-orange-400">
              {summary.currentMafPace ? formatPace(summary.currentMafPace, units) : '—'}
              <span className="text-sm font-normal text-gray-500 ml-1">/{units}</span>
            </p>
            {summary.paceTrendSlope !== null && (
              <p className={`text-xs mt-0.5 ${trendColor(summary.paceTrendDirection)}`}>
                {summary.paceTrendSlope > 0 ? '+' : ''}{summary.paceTrendSlope.toFixed(1)}s/wk
              </p>
            )}
          </div>
          <Sparkline data={paceData} />
        </div>
      </div>

      {/* Secondary: Below Ceiling, Cadence, Efficiency — compact full-width cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Time in Zone */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Time in Zone
              <InfoTooltip text="Percentage of run time at or below your MAF ceiling. Higher is better — aim for 80%+ as your discipline improves." />
            </p>
            <span className={`text-[10px] ${trendColor(summary.zoneTrendDirection)}`}>
              {trendArrow(summary.zoneTrendDirection, 'ef')} {trendLabel(summary.zoneTrendDirection, 'ef')}
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-300 mt-1">
            {summary.zoneDiscipline !== null ? `${summary.zoneDiscipline.toFixed(0)}%` : '—'}
            <span className="text-xs font-normal text-gray-600 ml-1">≤{mafHr}</span>
          </p>
        </div>

        {/* Cadence */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Cadence
              <InfoTooltip text="Steps per minute while running (walking excluded). Target 170+ for lighter, more efficient steps." />
            </p>
            <span className={`text-[10px] ${trendColor(summary.cadenceTrendDirection)}`}>
              {trendArrow(summary.cadenceTrendDirection, 'ef')} {trendLabel(summary.cadenceTrendDirection, 'ef')}
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-300 mt-1">
            {summary.avgCadence !== null ? Math.round(summary.avgCadence) : '—'}
            <span className="text-xs font-normal text-gray-600 ml-1">spm</span>
          </p>
        </div>

        {/* Efficiency */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Efficiency
              <InfoTooltip text="Efficiency Factor: meters per minute divided by heart rate. Higher means more distance per heartbeat." />
            </p>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-lg font-semibold text-gray-300">
              {summary.currentEf !== null ? formatEF(summary.currentEf) : '—'}
            </p>
            <span className={`text-[10px] ${trendColor(summary.efTrendDirection)}`}>
              {trendArrow(summary.efTrendDirection, 'ef')} {trendLabel(summary.efTrendDirection, 'ef')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
