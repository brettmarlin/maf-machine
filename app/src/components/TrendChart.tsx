import { useState, useEffect, type ReactNode } from 'react'
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

const OVERLAY_CONFIG: { key: Overlay; label: string }[] = [
  { key: 'pace', label: 'Pace' },
  { key: 'ef', label: 'Eff' },
  { key: 'cadence', label: 'Cad' },
]

interface Props {
  trends: MAFTrend[]
  units: 'km' | 'mi'
  mafHr: number
  datePickerSlot?: ReactNode  // DateRangePicker rendered in toggle bar
}

// Custom diamond-heart shape for HR dots
function HeartDot(props: any) {
  const { cx, cy } = props
  if (!cx || !cy) return null
  const s = 1.4
  return (
    <svg x={cx - 5} y={cy - 4} width="10" height="8" viewBox="0 0 7 6" fill="none">
      <path d="M6.36328 1.91406L4.44922 3.82715L4.44336 3.82129L3.17871 5.08594L1.91699 3.82422L1.91406 3.82715L0 1.91406L1.91406 0L3.1748 1.26074L3.17871 1.25781L3.18457 1.26367L4.44922 0L6.36328 1.91406Z" fill="#E94605"/>
    </svg>
  )
}

// Custom diamond shape for pace dots
function DiamondDot(props: any) {
  const { cx, cy } = props
  if (!cx || !cy) return null
  const size = 4
  return (
    <polygon
      points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
      fill="#E0E0E0"
      fillOpacity={0.7}
      stroke="none"
    />
  )
}

export function TrendChart({ trends, units, mafHr, datePickerSlot }: Props) {
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(['pace']))
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 500)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 500)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const tiers = computeMAFTiers(mafHr)

  // Empty state — no runs yet
  if (trends.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400">Trend</h3>
          {datePickerSlot}
        </div>
        <div className="h-48 flex flex-col items-center justify-center text-center space-y-2">
          <div className="w-full h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
          <p className="text-xs text-green-500/60 font-medium">MAF ceiling: {mafHr} bpm</p>
          <p className="text-xs text-gray-600 mt-2">Your runs will appear here</p>
        </div>
      </div>
    )
  }

  const toggleOverlay = (overlay: Overlay) => {
    const next = new Set(overlays)
    if (next.has(overlay)) next.delete(overlay)
    else next.add(overlay)
    setOverlays(next)
  }

  const chartData = trends.map((t) => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    rawDate: t.date,
    name: (t as any).name || '',
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

  const allHr = chartData.map((d) => d.avgHr).filter(Boolean)
  const minHr = Math.min(...allHr, tiers.easy_low - 5)
  const maxHr = Math.max(...allHr, tiers.ceiling + 10)
  const hrDomain: [number, number] = [Math.floor(minHr / 5) * 5, Math.ceil(maxHr / 5) * 5]

  // Compute EF domain for dedicated axis
  const allEf = chartData.map((d) => d.ef).filter((v) => v > 0)
  const efMin = allEf.length > 0 ? Math.floor((Math.min(...allEf) - 0.02) * 100) / 100 : 0.5
  const efMax = allEf.length > 0 ? Math.ceil((Math.max(...allEf) + 0.02) * 100) / 100 : 1.5
  const efDomain: [number, number] = [efMin, efMax]

  const hasPace = overlays.has('pace')
  const hasEf = overlays.has('ef')
  const hasCadence = overlays.has('cadence')

  const rightMargin = isMobile ? 2 : 5
  const leftMargin = isMobile ? -20 : -10
  const leftAxisWidth = isMobile ? 28 : 35

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const data = payload[0]?.payload
    const aboveCeiling = data.avgHr > mafHr
    const belowPct = data.timeInZonePct?.toFixed(0)

    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm shadow-lg max-w-[220px]">
        {/* Run name + date */}
        {data.name && (
          <p className="text-white font-medium text-xs truncate mb-0.5">{data.name}</p>
        )}
        <p className="text-gray-500 text-xs mb-2">{label}</p>

        {/* HR */}
        <p>
          <span className="text-gray-500">HR:</span>{' '}
          <span className="font-semibold" style={{ color: aboveCeiling ? '#9ca3af' : '#ff6900' }}>{Math.round(data.avgHr)} bpm</span>
          {aboveCeiling && <span className="text-gray-500 text-xs ml-1">over</span>}
        </p>

        {/* Pace */}
        {overlays.has('pace') && data.mafPace > 0 && (
          <p className="text-gray-300 mt-0.5">
            <span className="text-gray-500">Pace:</span>{' '}
            <span className="font-semibold">{formatPace(data.mafPace, units)}</span>
          </p>
        )}

        {/* Below ceiling */}
        {belowPct && (
          <p className="text-gray-500 text-xs mt-1">
            {belowPct}% in zone{data.qualifying ? ' ✓' : ''}
          </p>
        )}

        {/* EF if toggled */}
        {overlays.has('ef') && data.ef > 0 && (
          <p className="text-gray-400 text-xs mt-0.5">
            EF: {data.ef.toFixed(2)}
          </p>
        )}

        {/* Cadence if toggled */}
        {overlays.has('cadence') && data.cadence && (
          <p className="text-gray-400 text-xs mt-0.5">
            Cadence: {Math.round(data.cadence)} spm
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-1 py-4 sm:px-4 space-y-4 outline-none focus:outline-none [&_*]:outline-none [&_svg]:outline-none [&_svg]:!outline-0" tabIndex={-1} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
      {/* Unified toggle-legend row */}
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* HR — always on, not toggleable */}
          <span className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-white/10 text-white border border-white/20">
            <svg width="7" height="6" viewBox="0 0 7 6" className="shrink-0">
              <path d="M6.36328 1.91406L4.44922 3.82715L4.44336 3.82129L3.17871 5.08594L1.91699 3.82422L1.91406 3.82715L0 1.91406L1.91406 0L3.1748 1.26074L3.17871 1.25781L3.18457 1.26367L4.44922 0L6.36328 1.91406Z" fill="#ff6900"/>
            </svg>
            HR
          </span>

          {/* Toggleable overlays */}
          {OVERLAY_CONFIG.map((o) => {
            const active = overlays.has(o.key)
            const isEf = o.key === 'ef'
            return (
              <button
                key={o.key}
                onClick={() => toggleOverlay(o.key)}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg transition-colors border ${
                  active
                    ? isEf
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                      : 'bg-white/10 text-white border-white/20'
                    : 'bg-transparent text-gray-600 border-transparent hover:text-gray-400'
                }`}
              >
                {o.key === 'pace' && <span className={`w-2 h-2 rotate-45 ${active ? 'bg-gray-300' : 'bg-gray-700'}`} />}
                {o.label}
              </button>
            )
          })}
        </div>

        {/* Spacer + date picker at right end */}
        {datePickerSlot && (
          <>
            <div className="flex-1 min-w-[8px]" />
            <div className="shrink-0">{datePickerSlot}</div>
          </>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={chartData} margin={{ top: 10, right: rightMargin, bottom: 0, left: leftMargin }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={{ stroke: '#374151' }}
              padding={{ right: 20 }}
            />

            {/* Primary Y-axis: Heart Rate — hide tick labels on mobile */}
            <YAxis
              yAxisId="hr"
              domain={hrDomain}
              tick={isMobile ? false : { fill: '#6b7280', fontSize: 11 }}
              tickLine={!isMobile}
              axisLine={!isMobile}
              width={isMobile ? 2 : leftAxisWidth}
            />

            {/* Secondary Y-axis: Pace (right side) — hidden on mobile */}
            {hasPace && (
              <YAxis
                yAxisId="pace"
                orientation="right"
                reversed
                tick={isMobile ? false : { fill: '#6b7280', fontSize: 10 }}
                tickLine={!isMobile}
                axisLine={!isMobile}
                tickFormatter={(v) => formatPace(v, units)}
                domain={['auto', 'auto']}
                width={isMobile ? 2 : 50}
              />
            )}

            {/* Tertiary Y-axis: EF (right side) — hidden on mobile */}
            {hasEf && (
              <YAxis
                yAxisId="ef"
                orientation="right"
                domain={efDomain}
                tick={isMobile ? false : { fill: '#6b7280', fontSize: 10 }}
                tickLine={!isMobile}
                axisLine={!isMobile}
                tickFormatter={(v) => v.toFixed(2)}
                width={isMobile ? 2 : 40}
              />
            )}

            {/* Cadence axis (only if no pace or ef to share with) — hidden on mobile */}
            {hasCadence && !hasPace && !hasEf && (
              <YAxis
                yAxisId="cadence"
                orientation="right"
                tick={isMobile ? false : { fill: '#6b7280', fontSize: 11 }}
                tickLine={!isMobile}
                axisLine={!isMobile}
                domain={['auto', 'auto']}
                label={isMobile ? undefined : { value: 'spm', angle: 90, position: 'insideRight', fill: '#4b5563', fontSize: 11 }}
                width={isMobile ? 2 : undefined}
              />
            )}

            <Tooltip content={<CustomTooltip />} />

            {/* Tier shading: Controlled (ceiling down to controlled_low) — green */}
            <ReferenceArea
              yAxisId="hr"
              y1={tiers.controlled_low}
              y2={tiers.ceiling}
              fill="#22c55e"
              fillOpacity={0.12}
              stroke="none"
            />

            {/* Tier shading: Easy — lighter green */}
            <ReferenceArea
              yAxisId="hr"
              y1={tiers.easy_low}
              y2={tiers.controlled_low}
              fill="#22c55e"
              fillOpacity={0.06}
              stroke="none"
            />

            {/* Over ceiling: subtle red tint */}
            <ReferenceArea
              yAxisId="hr"
              y1={tiers.ceiling}
              y2={hrDomain[1]}
              fill="#ef4444"
              fillOpacity={0.04}
              stroke="none"
            />

            {/* MAF Ceiling Line — green = safe boundary */}
            <ReferenceLine
              yAxisId="hr"
              y={tiers.ceiling}
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{ value: `Ceiling ${tiers.ceiling}`, fill: '#22c55e', fontSize: 10, position: 'left' }}
            />

            {/* Tier boundary: controlled_low — very subtle */}
            <ReferenceLine
              yAxisId="hr"
              y={tiers.controlled_low}
              stroke="#22c55e"
              strokeDasharray="2 4"
              strokeWidth={0.5}
              strokeOpacity={0.2}
            />
            <ReferenceLine
              yAxisId="hr"
              y={tiers.easy_low}
              stroke="#22c55e"
              strokeDasharray="2 4"
              strokeWidth={0.5}
              strokeOpacity={0.12}
            />

            {/* Heart Rate dots — heart shapes */}
            <Scatter
              yAxisId="hr"
              dataKey="avgHr"
              shape={<HeartDot />}
              name="Avg HR"
            />
            <Line
              yAxisId="hr"
              dataKey="rollingHr"
              stroke="#ff6900"
              strokeWidth={2}
              strokeOpacity={0.7}
              dot={false}
              connectNulls
              name="HR avg"
            />

            {/* Pace overlay — diamond shapes for data, dashed line for average */}
            {hasPace && (
              <>
                <Scatter
                  yAxisId="pace"
                  dataKey="mafPace"
                  shape={<DiamondDot />}
                  name="MAF Pace"
                />
                <Line
                  yAxisId="pace"
                  dataKey="rollingMafPace"
                  stroke="#E0E0E0"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name="Pace avg"
                  strokeDasharray="4 2"
                />
              </>
            )}

            {/* EF overlay — own axis, line only */}
            {hasEf && (
              <>
                {/* EF scatter dots — light purple */}
                <Scatter
                  yAxisId="ef"
                  dataKey="ef"
                  fill="#a78bfa"
                  stroke="#a78bfa"
                  r={2.5}
                  fillOpacity={0.4}
                  name="EF"
                />
                <Line
                  yAxisId="ef"
                  dataKey="rollingEf"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  name="EF avg"
                  strokeDasharray="2 2"
                />
              </>
            )}

            {/* Cadence overlay — line only */}
            {hasCadence && (
              <Line
                yAxisId={hasPace ? 'pace' : hasEf ? 'ef' : 'cadence'}
                dataKey="rollingCadence"
                stroke="#4b5563"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                name="Cadence avg"
                strokeDasharray="2 2"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-500">
          No runs to display
        </div>
      )}

    </div>
  )
}
