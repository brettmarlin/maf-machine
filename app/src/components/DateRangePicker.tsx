import { useState, useRef, useEffect } from 'react'

export interface DateRange {
  start: Date
  end: Date
  label: string
}

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
  trainingStartDate?: string | null
  compact?: boolean
}

const PRESETS: { label: string; days: number }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 28 days', days: 28 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last year', days: 365 },
  { label: 'All time', days: 99999 },
]

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

function formatCompact(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return startOfDay(d)
}

export function getDefaultRange(trainingStartDate?: string | null): DateRange {
  if (trainingStartDate) {
    return {
      start: startOfDay(new Date(trainingStartDate + 'T00:00:00')),
      end: endOfDay(new Date()),
      label: 'Since MAF Start Date',
    }
  }
  return {
    start: daysAgo(90),
    end: endOfDay(new Date()),
    label: 'Last 3 months',
  }
}

function CalendarMonth({
  year,
  month,
  rangeStart,
  rangeEnd,
  onSelectDate,
}: {
  year: number
  month: number
  rangeStart: Date | null
  rangeEnd: Date | null
  onSelectDate: (d: Date) => void
}) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = firstDay.getDay()

  const monthName = firstDay.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div>
      <p className="text-xs font-medium text-gray-400 text-center mb-2">{monthName}</p>
      <div className="grid grid-cols-7 gap-0 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[10px] text-gray-600 py-0.5">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />

          const cellDate = new Date(year, month, day)
          cellDate.setHours(0, 0, 0, 0)

          const isToday = cellDate.getTime() === today.getTime()
          const isFuture = cellDate > today
          const isStart = rangeStart && cellDate.getTime() === startOfDay(rangeStart).getTime()
          const isEnd = rangeEnd && cellDate.getTime() === startOfDay(rangeEnd).getTime()
          const inRange =
            rangeStart && rangeEnd &&
            cellDate >= startOfDay(rangeStart) &&
            cellDate <= startOfDay(rangeEnd)

          return (
            <button
              key={i}
              onClick={() => !isFuture && onSelectDate(cellDate)}
              disabled={isFuture}
              className={`text-xs py-1 rounded transition-colors ${
                isStart || isEnd
                  ? 'bg-orange-500 text-white font-medium'
                  : inRange
                    ? 'bg-orange-500/20 text-orange-300'
                    : isToday
                      ? 'ring-1 ring-gray-500 text-white'
                      : isFuture
                        ? 'text-gray-700 cursor-not-allowed'
                        : 'text-gray-400 hover:bg-gray-700'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const COMPACT_LABELS: Record<string, string> = {
  'Since MAF Start Date': 'Start Date',
  'Last 3 months': '3 mo',
  'Last 6 months': '6 mo',
  'Last year': '1 yr',
  'Last 7 days': '7d',
  'Last 28 days': '28d',
  'All time': 'All',
}

export function DateRangePicker({ value, onChange, trainingStartDate, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'presets' | 'custom'>('presets')
  const [customStart, setCustomStart] = useState<Date>(value.start)
  const [customEnd, setCustomEnd] = useState<Date>(value.end)
  const [selectingStart, setSelectingStart] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function selectPreset(preset: typeof PRESETS[0]) {
    let start: Date
    if (preset.days === 99999 && trainingStartDate) {
      start = startOfDay(new Date(trainingStartDate + 'T00:00:00'))
    } else if (preset.days === 99999) {
      start = daysAgo(365 * 3)
    } else {
      start = daysAgo(preset.days)
    }
    const range: DateRange = {
      start,
      end: endOfDay(new Date()),
      label: preset.label,
    }
    onChange(range)
    setOpen(false)
  }

  function handleCalendarClick(d: Date) {
    if (selectingStart) {
      setCustomStart(d)
      setSelectingStart(false)
      if (d > customEnd) {
        setCustomEnd(endOfDay(new Date()))
      }
    } else {
      if (d < customStart) {
        setCustomStart(d)
        setSelectingStart(false)
      } else {
        setCustomEnd(d)
        setSelectingStart(true)
      }
    }
  }

  function applyCustom() {
    onChange({
      start: startOfDay(customStart),
      end: endOfDay(customEnd),
      label: `${formatCompact(customStart)} – ${formatCompact(customEnd)}`,
    })
    setOpen(false)
  }

  function prevMonth() {
    const d = new Date(viewDate)
    d.setMonth(d.getMonth() - 1)
    setViewDate(d)
  }

  function nextMonth() {
    const d = new Date(viewDate)
    d.setMonth(d.getMonth() + 1)
    setViewDate(d)
  }

  const month1 = { year: viewDate.getFullYear(), month: viewDate.getMonth() }
  const nextM = new Date(viewDate)
  nextM.setMonth(nextM.getMonth() + 1)
  const month2 = { year: nextM.getFullYear(), month: nextM.getMonth() }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger — emoji pill on mobile, text pill on desktop */}
      <button
        onClick={() => setOpen(!open)}
        className={compact
          ? 'flex items-center text-xs rounded-full border bg-white/10 border-white/20 px-2.5 py-1.5 cursor-pointer'
          : 'flex items-center gap-1.5 text-xs rounded-full border bg-white/5 border-white/15 px-3.5 py-1.5 text-gray-300 cursor-pointer'
        }
      >
        {compact ? (
          <span style={{ fontSize: 12 }}>📅</span>
        ) : (
          <>{value.label} <span style={{ opacity: 0.6 }}>↓</span></>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="fixed sm:absolute right-4 sm:right-0 left-4 sm:left-auto top-auto sm:top-full mt-1 shadow-2xl z-[9999] flex overflow-hidden sm:max-w-[calc(100vw-2rem)]" style={{
            background: 'rgba(15, 15, 19, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '12px',
          }}>
          {/* Presets column */}
          <div className="w-40 border-r border-white/8 py-2 shrink-0">
            <button
              onClick={() => setMode('custom')}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                mode === 'custom' ? 'bg-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
              style={mode === 'custom' ? {
                background: 'linear-gradient(135deg, #F84590, #EF6D11)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              } : undefined}
            >
              Custom
            </button>
            <div className="h-px bg-white/8 my-1" />
            {trainingStartDate && (
              <>
                <button
                  onClick={() => {
                    onChange({
                      start: startOfDay(new Date(trainingStartDate + 'T00:00:00')),
                      end: endOfDay(new Date()),
                      label: 'Since MAF Start Date',
                    })
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    value.label === 'Since MAF Start Date'
                      ? 'bg-white/5'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                  style={value.label === 'Since MAF Start Date' ? {
                    background: 'linear-gradient(135deg, #F84590, #EF6D11)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  } : undefined}
                >
                  Since MAF Start Date
                </button>
                <div className="h-px bg-white/8 my-1" />
              </>
            )}
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => selectPreset(p)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  value.label === p.label
                    ? 'bg-white/5'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
                style={value.label === p.label ? {
                  background: 'linear-gradient(135deg, #F84590, #EF6D11)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar column */}
          {mode === 'custom' && (
            <div className="p-3 space-y-3 w-[280px]">
              {/* Date inputs */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className={`text-[10px] uppercase tracking-wide ${selectingStart ? 'text-orange-400' : 'text-gray-500'}`}>
                    Start
                  </label>
                  <input
                    type="date"
                    value={formatInputDate(customStart)}
                    onChange={(e) => {
                      if (e.target.value) setCustomStart(new Date(e.target.value + 'T00:00:00'))
                    }}
                    onClick={() => setSelectingStart(true)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <span className="text-gray-600 text-xs mt-3">–</span>
                <div className="flex-1">
                  <label className={`text-[10px] uppercase tracking-wide ${!selectingStart ? 'text-orange-400' : 'text-gray-500'}`}>
                    End
                  </label>
                  <input
                    type="date"
                    value={formatInputDate(customEnd)}
                    onChange={(e) => {
                      if (e.target.value) setCustomEnd(new Date(e.target.value + 'T00:00:00'))
                    }}
                    onClick={() => setSelectingStart(false)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Month navigation */}
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className="text-gray-500 hover:text-gray-300 text-sm">‹</button>
                <button onClick={nextMonth} className="text-gray-500 hover:text-gray-300 text-sm">›</button>
              </div>

              {/* Two calendars */}
              <div className="space-y-3">
                <CalendarMonth
                  year={month1.year}
                  month={month1.month}
                  rangeStart={customStart}
                  rangeEnd={customEnd}
                  onSelectDate={handleCalendarClick}
                />
                <CalendarMonth
                  year={month2.year}
                  month={month2.month}
                  rangeStart={customStart}
                  rangeEnd={customEnd}
                  onSelectDate={handleCalendarClick}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
                <button
                  onClick={() => setMode('presets')}
                  className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={applyCustom}
                  className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
