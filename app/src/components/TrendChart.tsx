import { useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import type { MAFTrend } from '../lib/mafAnalysis'
import { formatPace, computeMAFTiers } from '../lib/mafAnalysis'

type Overlay = 'pace' | 'ef' | 'cadence'

const OVERLAY_CONFIG: { key: Overlay; label: string; color: string; activeColor: string }[] = [
  { key: 'pace', label: 'Pace', color: 'bg-gray-800 text-gray-400', activeColor: 'bg-orange-600 text-white' },
  { key: 'ef', label: 'Efficiency', color: 'bg-gray-800 text-gray-400', activeColor: 'bg-blue-600 text-white' },
  { key: 'cadence', label: 'Cadence', color: 'bg-gray-800 text-gray-400', activeColor: 'bg-green-600 text-white' },
]

interface Props {
  trends: MAFTrend[]
  units: 'km' | 'mi'
  mafHr: number
}

export function TrendChart({ trends, units, mafHr }: Props) {
  // Default: HR always on + Pace overlay on
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(['pace']))
  const [showRolling, setShowRolling] = useState(true)

  const tiers = computeMAFTiers(mafHr)

  const toggleOverlay = (overlay: Overlay) => {
    const next = new Set(overlays)
    if (next.has(overlay)) next.delete(overlay)
    else next.add(overlay)
    setOverlays(next)
  }

  const chartData = trends.map((t) => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    rawDate: t.date,
    avgHr: t.avgHr,
    rollingHr: t.rollingHr,
    mafPace: t.mafPace,
    rollingMafPace: t.rollingMafPace,
    ef: t.ef,
    rollingEf: t.rollingEf,
    cadence: t.cadence,
    rollingCadence: t.rollingCadence,
    qualifying: t.qualifying,
    timeInZonePct: t.timeInZonePct,
  }))

  // HR Y-axis domain — show from below easy tier to above ceiling
  const allHr = chartData.map((d) => d.avgHr).filter(Boolean)
  const minHr = Math.min(...allHr, tiers.easy_low - 5)
  const maxHr = Math.max(...allHr, tiers.ceiling + 10)
  const hrDomain: [number, number] = [Math.floor(minHr / 5) * 5, Math.ceil(maxHr / 5) * 5]

  const hasOverlay = overlays.size > 0

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const data = payload[0]?.payload
    const aboveCeiling = data.avgHr > mafHr
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm shadow-lg">
        <p className="text-gray-400 mb-2 font-medium">{label}</p>
        <p className={aboveCeiling ? 'text-red-400' : 'text-green-400'}>
          HR: <span className="font-semibold">{Math.round(data.avgHr)} bpm</span>
          {data.rollingHr && <span className="text-gray-500 ml-1">(avg: {Math.round(data.rollingHr)})</span>}
          {aboveCeiling && <span className="text-red-500 ml-1">above ceiling</span>}
        </p>
        <p className="text-gray-500 text-xs">
          Below ceiling: {data.timeInZonePct?.toFixed(0)}%
          {data.qualifying ? ' ✓' : ''}
        </p>
        {overlays.has('pace') && data.mafPace > 0 && (
          <p className="text-orange-400 mt-1">
            Pace: <span className="font-semibold">{formatPace(data.mafPace, units)}</span>
            {data.rollingMafPace && <span className="text-gray-500 ml-1">(avg: {formatPace(data.rollingMafPace, units)})</span>}
          </p>
        )}
        {overlays.has('ef') && data.ef > 0 && (
          <p className="text-blue-400 mt-1">
            EF: <span className="font-semibold">{data.ef.toFixed(2)}</span>
            {data.rollingEf && <span className="text-gray-500 ml-1">(avg: {data.rollingEf.toFixed(2)})</span>}
          </p>
        )}
        {overlays.has('cadence') && data.cadence && (
          <p className="text-green-400 mt-1">
            Cadence: <span className="font-semibold">{Math.round(data.cadence)} spm</span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
      {/* Overlay Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white">
          ♥ Heart Rate
        </span>
        <span className="text-xs text-gray-600">|</span>
        {OVERLAY_CONFIG.map((o) => (
          <button
            key={o.key}
            onClick={() => toggleOverlay(o.key)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              overlays.has(o.key) ? o.activeColor : o.color
            }`}
          >
            {o.label}
          </button>
        ))}
        <span className="text-xs text-gray-600">|</span>
        <button
          onClick={() => setShowRolling(!showRolling)}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            showRolling ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-500'
          }`}
        >
          4wk Avg
        </button>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={chartData} margin={{ top: 10, right: hasOverlay ? 60 : 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={{ stroke: '#374151' }}
            />

            {/* Primary Y-axis: Heart Rate */}
            <YAxis
              yAxisId="hr"
              domain={hrDomain}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={{ stroke: '#374151' }}
              label={{ value: 'bpm', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }}
            />

            {/* Secondary Y-axis for overlays */}
            {overlays.has('pace') && (
              <YAxis
                yAxisId="pace"
                orientation="right"
                reversed
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={(v) => formatPace(v, units)}
                domain={['auto', 'auto']}
                label={{ value: `min/${units}`, angle: 90, position: 'insideRight', fill: '#6b7280', fontSize: 11 }}
              />
            )}

            {overlays.has('ef') && !overlays.has('pace') && (
              <YAxis
                yAxisId="ef"
                orientation="right"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                domain={['auto', 'auto']}
                label={{ value: 'EF', angle: 90, position: 'insideRight', fill: '#6b7280', fontSize: 11 }}
              />
            )}

            {overlays.has('cadence') && !overlays.has('pace') && !overlays.has('ef') && (
              <YAxis
                yAxisId="cadence"
                orientation="right"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                domain={['auto', 'auto']}
                label={{ value: 'spm', angle: 90, position: 'insideRight', fill: '#6b7280', fontSize: 11 }}
              />
            )}

            <Tooltip content={<CustomTooltip />} />

            {/* ─── Ceiling Model Visualization ─── */}

            {/* Tier shading: Controlled (light green) */}
            <ReferenceArea
              yAxisId="hr"
              y1={tiers.controlled_low}
              y2={tiers.controlled_high}
              fill="#22c55e"
              fillOpacity={0.08}
              stroke="none"
            />

            {/* Tier shading: Easy (light blue) */}
            <ReferenceArea
              yAxisId="hr"
              y1={tiers.easy_low}
              y2={tiers.easy_high}
              fill="#3b82f6"
              fillOpacity={0.05}
              stroke="none"
            />

            {/* Over ceiling zone: red tint */}
            <ReferenceArea
              yAxisId="hr"
              y1={tiers.ceiling}
              y2={hrDomain[1]}
              fill="#ef4444"
              fillOpacity={0.04}
              stroke="none"
            />

            {/* MAF Ceiling Line — the hard cap */}
            <ReferenceLine
              yAxisId="hr"
              y={tiers.ceiling}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{ value: `Ceiling ${tiers.ceiling}`, fill: '#ef4444', fontSize: 10, position: 'left' }}
            />

            {/* Tier boundaries — subtle */}
            <ReferenceLine
              yAxisId="hr"
              y={tiers.controlled_low}
              stroke="#22c55e"
              strokeDasharray="2 4"
              strokeWidth={0.5}
              strokeOpacity={0.4}
            />
            <ReferenceLine
              yAxisId="hr"
              y={tiers.easy_low}
              stroke="#3b82f6"
              strokeDasharray="2 4"
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />

            {/* Heart Rate */}
            <Scatter yAxisId="hr" dataKey="avgHr" fill="#ef4444" r={4} fillOpacity={0.7} name="Avg HR" />
            {showRolling && (
              <Line yAxisId="hr" dataKey="rollingHr" stroke="#ef4444" strokeWidth={2.5} dot={false} connectNulls name="HR (4wk avg)" />
            )}

            {/* Pace overlay */}
            {overlays.has('pace') && (
              <>
                <Scatter yAxisId="pace" dataKey="mafPace" fill="#f97316" r={3} fillOpacity={0.5} name="MAF Pace" />
                {showRolling && (
                  <Line yAxisId="pace" dataKey="rollingMafPace" stroke="#f97316" strokeWidth={2} dot={false} connectNulls name="Pace (4wk avg)" strokeDasharray="4 2" />
                )}
              </>
            )}

            {/* EF overlay */}
            {overlays.has('ef') && (
              <>
                <Scatter yAxisId={overlays.has('pace') ? 'pace' : 'ef'} dataKey="ef" fill="#3b82f6" r={3} fillOpacity={0.5} name="EF" />
                {showRolling && (
                  <Line yAxisId={overlays.has('pace') ? 'pace' : 'ef'} dataKey="rollingEf" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls name="EF (4wk avg)" strokeDasharray="4 2" />
                )}
              </>
            )}

            {/* Cadence overlay */}
            {overlays.has('cadence') && (
              <Scatter yAxisId={overlays.has('pace') ? 'pace' : overlays.has('ef') ? 'ef' : 'cadence'} dataKey="cadence" fill="#22c55e" r={3} fillOpacity={0.5} name="Cadence" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-500">
          No runs to display
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 px-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-red-500 rounded"></span>
          Ceiling ({tiers.ceiling} bpm)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 opacity-30"></span>
          Controlled ({tiers.controlled_low}–{tiers.controlled_high})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500 opacity-30"></span>
          Easy ({tiers.easy_low}–{tiers.easy_high})
        </span>
        {overlays.has('pace') && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-orange-500 rounded"></span>
            Pace (right axis, inverted)
          </span>
        )}
        {overlays.has('ef') && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-500 rounded"></span>
            Efficiency Factor
          </span>
        )}
        {overlays.has('cadence') && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Cadence (spm)
          </span>
        )}
      </div>
    </div>
  )
}
