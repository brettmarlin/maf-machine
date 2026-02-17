import type { MAFSummary } from '../lib/mafAnalysis'
import { formatPace, formatEF } from '../lib/mafAnalysis'

const TREND_COLORS = {
  improving: 'text-green-400',
  plateau: 'text-yellow-400',
  regressing: 'text-red-400',
  insufficient: 'text-gray-500',
}

const TREND_ICONS = {
  improving: '▼',
  plateau: '●',
  regressing: '▲',
  insufficient: '—',
}

interface Props {
  summary: MAFSummary
  units: 'km' | 'mi'
  mafHr: number
  mafZoneLow: number
  mafZoneHigh: number
}

export function SummaryCards({ summary, units, mafHr, mafZoneLow, mafZoneHigh }: Props) {
  // HR deviation from MAF target
  const hrDeviation = summary.currentAvgHr !== null
    ? summary.currentAvgHr - mafHr
    : null

  const hrDeviationLabel = hrDeviation !== null
    ? hrDeviation > 0
      ? `+${hrDeviation.toFixed(0)} above target`
      : hrDeviation < 0
        ? `${hrDeviation.toFixed(0)} below target`
        : 'On target'
    : null

  const hrDeviationColor = hrDeviation !== null
    ? Math.abs(hrDeviation) <= 3
      ? 'text-green-400'
      : Math.abs(hrDeviation) <= 5
        ? 'text-yellow-400'
        : 'text-red-400'
    : 'text-gray-500'

  return (
    <div className="space-y-3">
      {/* Primary: Heart Rate row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Avg HR */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Heart Rate</p>
          <p className="text-3xl font-bold mt-1 text-red-400">
            {summary.currentAvgHr !== null ? `${Math.round(summary.currentAvgHr)}` : '—'}
            <span className="text-base font-normal text-gray-500 ml-1">bpm</span>
          </p>
          <p className={`text-xs mt-1 ${hrDeviationColor}`}>
            {hrDeviationLabel || '4-week avg'}
          </p>
        </div>

        {/* Zone Discipline */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Zone Discipline</p>
          <p className="text-3xl font-bold mt-1">
            {summary.zoneDiscipline !== null ? `${summary.zoneDiscipline.toFixed(0)}%` : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Time in {mafZoneLow}–{mafZoneHigh}
          </p>
        </div>

        {/* HR Trend */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">HR Trend</p>
          <p className={`text-2xl font-bold mt-1 ${TREND_COLORS[summary.hrTrendDirection]}`}>
            {summary.hrTrendSlope !== null
              ? `${summary.hrTrendSlope > 0 ? '+' : ''}${summary.hrTrendSlope.toFixed(1)} bpm/wk`
              : '—'}
          </p>
          <p className={`text-xs mt-1 ${TREND_COLORS[summary.hrTrendDirection]}`}>
            {TREND_ICONS[summary.hrTrendDirection]}{' '}
            {summary.hrTrendDirection === 'improving' ? 'HR Dropping'
              : summary.hrTrendDirection === 'regressing' ? 'HR Rising'
              : summary.hrTrendDirection === 'plateau' ? 'Stable'
              : 'Not enough data'}
          </p>
        </div>

        {/* Qualifying Runs */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Qualifying</p>
          <p className="text-2xl font-bold mt-1">
            {summary.totalQualifyingRuns}/{summary.totalRuns}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {summary.qualifyingPct.toFixed(0)}% of runs
          </p>
        </div>
      </div>

      {/* Secondary: Pace / EF / Cadence row */}
      <div className="grid grid-cols-3 gap-3">
        {/* MAF Pace */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">MAF Pace</p>
          <p className="text-xl font-semibold mt-1 text-orange-400">
            {summary.currentMafPace ? formatPace(summary.currentMafPace, units) : '—'}
          </p>
          <p className={`text-xs mt-1 ${TREND_COLORS[summary.paceTrendDirection]}`}>
            {summary.paceTrendSlope !== null
              ? `${summary.paceTrendSlope > 0 ? '+' : ''}${summary.paceTrendSlope.toFixed(1)}s/wk`
              : '—'}
          </p>
        </div>

        {/* Efficiency Factor */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Efficiency</p>
          <p className="text-xl font-semibold mt-1 text-blue-400">
            {summary.currentEf !== null ? formatEF(summary.currentEf) : '—'}
          </p>
          <p className={`text-xs mt-1 ${TREND_COLORS[summary.efTrendDirection]}`}>
            {TREND_ICONS[summary.efTrendDirection]}{' '}
            {summary.efTrendDirection === 'improving' ? 'Improving'
              : summary.efTrendDirection === 'regressing' ? 'Regressing'
              : summary.efTrendDirection === 'plateau' ? 'Plateau'
              : '—'}
          </p>
        </div>

        {/* Cadence */}
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cadence</p>
          <p className="text-xl font-semibold mt-1 text-green-400">
            {summary.avgCadence !== null ? `${Math.round(summary.avgCadence)}` : '—'}
            <span className="text-sm font-normal text-gray-500 ml-1">spm</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {summary.avgCadence !== null && summary.avgCadence >= 170 ? 'On target' : summary.avgCadence !== null ? 'Below 170 target' : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}
