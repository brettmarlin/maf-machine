import { useState, useEffect, useMemo, useRef } from 'react'
import { SummaryCards } from './SummaryCards'
import { TrendChart } from './TrendChart'
import { RunAdvisor } from './RunAdvisor'
import { SettingsModal } from './SettingsModal'
import { DateRangePicker, getDefaultRange } from './DateRangePicker'
import type { DateRange } from './DateRangePicker'
import { BASE_PATH } from '../config'
import {
  analyzeActivity,
  computeTrends,
  computeSummary,
  formatPace,
} from '../lib/mafAnalysis'
import type {
  MAFActivity,
  MAFTrend,
  MAFSummary,
} from '../lib/mafAnalysis'

interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  maf_zone_low?: number
  maf_zone_high?: number
  qualifying_tolerance?: number
  start_date?: string | null
}

export function Dashboard({
  settings: initialSettings,
  onSettingsChange,
}: {
  settings: Settings
  onSettingsChange: (s: Settings) => void
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  // allActivities = full local cache of every analyzed activity
  const [allActivities, setAllActivities] = useState<MAFActivity[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(!initialSettings.configured)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange)
  const lastSyncRange = useRef<string>('')

  const units = settings.units || 'mi'
  const mafHr = settings.maf_hr || 145
  const mafZoneLow = settings.maf_zone_low || 140
  const mafZoneHigh = settings.maf_zone_high || 150
  const qualifyingTolerance = settings.qualifying_tolerance ?? 10
  const qualifyingHigh = mafZoneHigh + qualifyingTolerance
  const age = settings.age ?? 35

  // Filter the full cache by the current date range for display
  const filteredActivities = useMemo(
    () => allActivities.filter((a) => {
      const d = new Date(a.date)
      return d >= dateRange.start && d <= dateRange.end
    }),
    [allActivities, dateRange]
  )
  const filteredTrends = useMemo(
    () => computeTrends(filteredActivities),
    [filteredActivities]
  )
  const filteredSummary = useMemo(
    () => (filteredActivities.length > 0 ? computeSummary(filteredActivities) : null),
    [filteredActivities]
  )

  // Merge analyzed activities into the full cache (deduped by id)
  function mergeIntoCache(newActivities: MAFActivity[]) {
    setAllActivities((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]))
      for (const a of newActivities) {
        map.set(a.id, a)
      }
      const merged = Array.from(map.values())
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      localStorage.setItem('maf_activities', JSON.stringify(merged))
      return merged
    })
  }

  async function syncActivities(range: DateRange) {
    setSyncing(true)
    setError(null)
    setSyncStatus('Fetching activities from Strava...')

    try {
      // Only fetch activities within the date range
      const afterTs = Math.floor(range.start.getTime() / 1000)
      const res = await fetch(`${BASE_PATH}/api/activities?after=${afterTs}`)
      if (!res.ok) throw new Error('Failed to fetch activities')
      const data = await res.json()

      const rawActivities = data.activities || []
      setSyncStatus(`Processing ${rawActivities.length} runs...`)

      const excludedIds: Set<number> = new Set(
        JSON.parse(localStorage.getItem('maf_excluded') || '[]')
      )

      // Check which activities we already have analyzed in cache
      const cachedMap = new Map(allActivities.map((a) => [a.id, a]))
      const toAnalyze = rawActivities.filter((a: any) => !cachedMap.has(a.id))
      const alreadyCached = rawActivities
        .filter((a: any) => cachedMap.has(a.id))
        .map((a: any) => cachedMap.get(a.id)!)

      setSyncStatus(
        toAnalyze.length > 0
          ? `Analyzing ${toAnalyze.length} new runs (${alreadyCached.length} cached)...`
          : `${alreadyCached.length} runs loaded from cache`
      )

      const analyzed: MAFActivity[] = []

      for (let i = 0; i < toAnalyze.length; i++) {
        const activity = toAnalyze[i]
        setSyncStatus(`Analyzing run ${i + 1} of ${toAnalyze.length}...`)

        let streams = null
        try {
          const streamRes = await fetch(`${BASE_PATH}/api/activities/${activity.id}/streams`)
          if (streamRes.ok) {
            streams = await streamRes.json()
          }
        } catch {
          // Streams not available
        }

        analyzed.push(
          analyzeActivity(
            activity,
            streams,
            mafHr,
            mafZoneLow,
            mafZoneHigh,
            qualifyingTolerance,
            units,
            excludedIds.has(activity.id)
          )
        )
      }

      // Merge all into cache
      mergeIntoCache([...alreadyCached, ...analyzed])
      setSyncStatus(
        toAnalyze.length > 0
          ? `Synced ${toAnalyze.length} new + ${alreadyCached.length} cached runs`
          : `${alreadyCached.length} runs up to date`
      )
      lastSyncRange.current = range.start.toISOString()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  function toggleExclude(id: number) {
    const excludedIds: Set<number> = new Set(
      JSON.parse(localStorage.getItem('maf_excluded') || '[]')
    )

    if (excludedIds.has(id)) {
      excludedIds.delete(id)
    } else {
      excludedIds.add(id)
    }

    localStorage.setItem('maf_excluded', JSON.stringify([...excludedIds]))

    setAllActivities((prev) => {
      const updated = prev.map((a) =>
        a.id === id ? { ...a, excluded: excludedIds.has(id) } : a
      )
      const rechecked = updated.map((a) => ({
        ...a,
        qualifying: !a.excluded && a.duration_seconds >= 1200 && a.time_in_qualifying_zone_pct >= 60,
      }))
      localStorage.setItem('maf_activities', JSON.stringify(rechecked))
      return rechecked
    })
  }

  // Load cache on mount, then sync
  useEffect(() => {
    const cached = localStorage.getItem('maf_activities')
    if (cached) {
      try {
        const parsed: MAFActivity[] = JSON.parse(cached)
        setAllActivities(parsed)
      } catch {
        // Ignore bad cache
      }
    }
    syncActivities(dateRange)
  }, [])

  // When date range changes, sync if we need data we haven't fetched yet
  useEffect(() => {
    const rangeKey = dateRange.start.toISOString()
    if (lastSyncRange.current && rangeKey < lastSyncRange.current) {
      // Range expanded earlier than what we've synced — need to fetch more
      syncActivities(dateRange)
    }
    // If range narrowed or stayed the same, local filtering handles it
  }, [dateRange])

  function handleSettingsClose(updated: Settings | null) {
    if (updated) {
      setSettings(updated)
      onSettingsChange(updated)
      // Settings changed — re-analyze everything
      localStorage.removeItem('maf_activities')
      setAllActivities([])
    }
    setShowSettings(false)
    if (updated) {
      setTimeout(() => syncActivities(dateRange), 100)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={handleSettingsClose} currentSettings={settings} />
      )}

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: Title */}
          <h1 className="text-lg font-bold shrink-0">MAF Machine</h1>

          {/* Center: MAF info (clickable to open settings) */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-sm bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span className="text-gray-400">My MAF:</span>
            <span className="text-white font-medium">
              {age} YRs = {mafHr} BPM
            </span>
            <span className="text-gray-500">±{mafZoneHigh - mafHr}</span>
          </button>

          {/* Right: Date range + actions */}
          <div className="flex items-center gap-3 shrink-0">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
            />

            {/* Sync */}
            <button
              onClick={() => syncActivities(dateRange)}
              disabled={syncing}
              className="text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {syncing ? '↻' : '↻ Sync'}
            </button>

            {/* Logout */}
            <a
              href={`${BASE_PATH}/api/auth/logout`}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Logout
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Sync Status */}
        {syncing && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm text-gray-400">
            {syncStatus}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Summary Cards with Sparklines */}
        {filteredSummary && (
          <SummaryCards
            summary={filteredSummary}
            trends={filteredTrends}
            units={units}
            mafHr={mafHr}
            mafZoneLow={mafZoneLow}
            mafZoneHigh={mafZoneHigh}
          />
        )}

        {/* Trend Chart */}
        {filteredTrends.length > 0 && (
          <TrendChart
            trends={filteredTrends}
            units={units}
            mafHr={mafHr}
            mafZoneLow={mafZoneLow}
            mafZoneHigh={mafZoneHigh}
            qualifyingHigh={qualifyingHigh}
          />
        )}

        {/* Run Advisor */}
        {filteredSummary && filteredActivities.length > 0 && (
          <RunAdvisor
            summary={filteredSummary}
            activities={filteredActivities}
            mafHr={mafHr}
            mafZoneLow={mafZoneLow}
            mafZoneHigh={mafZoneHigh}
            units={units}
          />
        )}

        {/* Run List */}
        {filteredActivities.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-400">
                Runs ({filteredActivities.length}{filteredActivities.length !== allActivities.length ? ` of ${allActivities.length}` : ''})
              </h2>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span>HR</span>
                <span>Zone</span>
                <span>Pace</span>
                <span>EF</span>
              </div>
            </div>
            <div className="divide-y divide-gray-800/50 max-h-96 overflow-y-auto">
              {filteredActivities.map((a) => (
                <div
                  key={a.id}
                  className={`px-4 py-3 flex items-center gap-4 text-sm ${
                    a.excluded ? 'opacity-40' : ''
                  }`}
                >
                  <span className="text-gray-500 w-20 shrink-0">
                    {new Date(a.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>

                  <span className="text-gray-300 flex-1 truncate flex items-center gap-2 min-w-0">
                    <span className="truncate">{a.name}</span>
                    <a
                      href={`https://www.strava.com/activities/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FC4C02] hover:underline text-xs shrink-0"
                    >
                      View on Strava ↗
                    </a>
                  </span>

                  <span className={`w-16 text-right font-medium ${
                    a.avg_hr >= mafZoneLow && a.avg_hr <= mafZoneHigh
                      ? 'text-green-400'
                      : a.avg_hr <= qualifyingHigh
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  }`}>
                    {Math.round(a.avg_hr)} bpm
                  </span>

                  <span className="w-12 text-right text-gray-500">
                    {a.time_in_maf_zone_pct.toFixed(0)}%
                  </span>

                  <span className="w-20 text-right text-gray-500">
                    {a.avg_pace > 0 ? formatPace(a.avg_pace, units) : '—'}
                  </span>

                  <span className="w-12 text-right text-gray-500">
                    {a.efficiency_factor > 0 ? a.efficiency_factor.toFixed(2) : '—'}
                  </span>

                  <span className="w-6 text-center">
                    {a.qualifying ? (
                      <span className="text-green-400 text-xs">✓</span>
                    ) : (
                      <span className="text-gray-700 text-xs">·</span>
                    )}
                  </span>

                  <button
                    onClick={() => toggleExclude(a.id)}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    title={a.excluded ? 'Include this run' : 'Exclude this run'}
                  >
                    {a.excluded ? '↩' : '×'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer - Powered by Strava */}
        <footer className="border-t border-gray-800 py-4 mt-8 flex justify-center">
          <a
            href="https://www.strava.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src={`${BASE_PATH}/api_logo_pwrdBy_strava_horiz_white.svg`}
              alt="Powered by Strava"
              width={130}
              height={13}
              className="h-4 w-auto"
            />
          </a>
        </footer>

        {/* Empty state */}
        {!syncing && allActivities.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <p className="text-gray-400 text-lg">No runs yet</p>
            <p className="text-gray-500 text-sm">
              Click Sync to pull your activities from Strava, or{' '}
              <button onClick={() => setShowSettings(true)} className="text-orange-400 hover:underline">
                configure your MAF settings
              </button>{' '}
              first.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
