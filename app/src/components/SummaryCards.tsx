import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, ReferenceLine, YAxis } from 'recharts'
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
  color = '#E0E0E0',
  useGradient = false,
  dashed = false,
  reversed = false,
}: {
  data: { value: number | null }[]
  referenceLine?: number
  color?: string
  useGradient?: boolean
  dashed?: boolean
  reversed?: boolean
}) {
  const filtered = data.filter((d) => d.value !== null && d.value > 0)
  if (filtered.length < 2) return <div className="h-10" />

  const strokeColor = useGradient ? 'url(#sparkGradient)' : color

  return (
    <div className="relative">
      {useGradient && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="sparkGradient" x1="0" y1="0" x2="500" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F84590" />
              <stop offset="50%" stopColor="#EF6D11" />
              <stop offset="100%" stopColor="#F84590" />
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="-500 0"
                to="500 0"
                dur="3s"
                repeatCount="indefinite"
              />
            </linearGradient>
          </defs>
        </svg>
      )}
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={filtered} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <YAxis
            hide
            reversed={reversed}
            domain={([min, max]: [number, number]) => {
              const padding = (max - min) * 0.2
              return [min - padding, max + padding]
            }}
          />
          {referenceLine !== undefined && (
            <ReferenceLine y={referenceLine} stroke={color} strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.3} />
          )}
          <Line
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            strokeDasharray={dashed ? '4 4' : undefined}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function trendLabel(direction: TrendDirection, metric: string): string {
  if (direction === 'insufficient') return 'Not enough data'
  const labels: Record<string, Record<string, string>> = {
    hr: { improving: 'HR dropping', plateau: 'Stable', regressing: 'HR rising' },
    pace: { improving: 'Getting faster', plateau: 'Stable', regressing: 'Slowing' },
    ef: { improving: 'Improving', plateau: 'Stable', regressing: 'Declining' },
    recovery: { improving: 'Recovering faster', plateau: 'Stable', regressing: 'Slowing down' },
  }
  return labels[metric]?.[direction] || direction
}

function trendColor(direction: TrendDirection): string {
  if (direction === 'improving') return 'text-maf-improving'
  if (direction === 'regressing') return 'text-maf-declining'
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
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 text-xs text-gray-300 bg-maf-dark border border-maf-subtle rounded-lg shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}

export function SummaryCards({ summary, trends, units, mafHr }: Props) {
  const hrData = trends.map((t) => ({ value: t.avgHr }))
  const paceData = trends.map((t) => ({ value: t.mafPace }))

  const hrDeviation = summary.currentAvgHr !== null ? summary.currentAvgHr - mafHr : null

  return (
    <div className="space-y-2">
      {/* Primary: HR + MAF Pace — two equal cards with sparklines */}
      <div className="grid grid-cols-2 gap-3">
        {/* Heart Rate */}
        <div className="glass-card rounded-xl p-3 sm:p-4 space-y-2">
          <div>
            <p className="text-xs text-gray-500/70 font-semibold uppercase tracking-widest">
              Avg HR
              <InfoTooltip text="Overall average heart rate across all runs (matches Strava). Lower means your aerobic system is handling the work with less effort." />
            </p>
            <span className={`text-[10px] sm:text-xs ${trendColor(summary.hrTrendDirection)}`}>
              {trendArrow(summary.hrTrendDirection, 'hr')} {trendLabel(summary.hrTrendDirection, 'hr')}
            </span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold">
              <span style={{
                background: 'linear-gradient(135deg, #F84590, #EF6D11)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontWeight: 700,
              }}>
                {summary.currentAvgHr !== null ? Math.round(summary.currentAvgHr) : '—'}
              </span>
              <span className="text-sm font-normal text-gray-500 ml-1">bpm</span>
            </p>
            <p className={`text-xs mt-0.5 ${
              hrDeviation !== null && hrDeviation <= 0 ? 'text-maf-below-ceiling/70' : 'text-gray-500'
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
          <Sparkline data={hrData} referenceLine={mafHr} color="#ff6900" useGradient />
        </div>

        {/* MAF Pace */}
        <div className="glass-card rounded-xl p-3 sm:p-4 space-y-2">
          <div>
            <p className="text-xs text-gray-500/70 font-semibold uppercase tracking-widest">
              MAF Pace
              <InfoTooltip text="Average pace during below-ceiling seconds only — not your overall pace. This is the key metric that should get faster over months of MAF training." />
            </p>
            <span className={`text-[10px] sm:text-xs ${trendColor(summary.paceTrendDirection)}`}>
              {trendArrow(summary.paceTrendDirection, 'pace')} {trendLabel(summary.paceTrendDirection, 'pace')}
            </span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-gray-200">
              {summary.currentMafPace ? formatPace(summary.currentMafPace, units) : '—'}
              <span className="text-sm font-normal text-gray-500 ml-1">/{units}</span>
            </p>
            {summary.paceTrendSlope !== null && (
              <p className={`text-xs mt-0.5 ${trendColor(summary.paceTrendDirection)}`}>
                {summary.paceTrendSlope > 0 ? '+' : ''}{summary.paceTrendSlope.toFixed(1)}s/wk
              </p>
            )}
          </div>
          <Sparkline data={paceData} dashed reversed />
          
        </div>
      </div>

      {/* Secondary: Cadence, Time in Zone, Efficiency, Recovery — compact full-width cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Cadence */}
        <div className="glass-card rounded-xl p-3">
          <div>
            <p className="text-xs text-gray-500/70 font-semibold uppercase tracking-widest">
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

        {/* Time in Zone */}
        <div className="glass-card rounded-xl p-3">
          <div>
            <p className="text-xs text-gray-500/70 font-semibold uppercase tracking-widest">
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

        {/* Efficiency */}
        <div className="glass-card rounded-xl p-3">
          <div>
            <p className="text-xs text-gray-500/70 font-semibold uppercase tracking-widest">
              Efficiency
              <InfoTooltip text="Efficiency Factor: meters per minute divided by heart rate. Higher means more distance per heartbeat." />
            </p>
            <span className={`text-[10px] ${trendColor(summary.efTrendDirection)}`}>
              {trendArrow(summary.efTrendDirection, 'ef')} {trendLabel(summary.efTrendDirection, 'ef')}
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-300 mt-1">
            {summary.currentEf !== null ? formatEF(summary.currentEf) : '—'}
          </p>
        </div>

        {/* Recovery Rate */}
        <div className="glass-card rounded-xl p-3">
          <div>
            <p className="text-xs text-gray-500/70 font-semibold uppercase tracking-widest">
              Recovery
              <InfoTooltip text="How fast your heart rate drops when you walk after going over ceiling. Higher = better aerobic fitness. Measured in bpm per minute of recovery." />
            </p>
            <span className={`text-[10px] ${trendColor(summary.hrRecoveryTrendDirection)}`}>
              {trendArrow(summary.hrRecoveryTrendDirection, 'recovery')} {trendLabel(summary.hrRecoveryTrendDirection, 'recovery')}
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-300 mt-1">
            {summary.currentHrRecoveryRate !== null ? summary.currentHrRecoveryRate.toFixed(1) : '—'}
            {summary.currentHrRecoveryRate !== null && (
              <span className="text-xs font-normal text-gray-600 ml-1">bpm/min</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
