import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { SummaryCards } from './SummaryCards'
import { TrendChart } from './TrendChart'
import { SettingsSidebar } from './SettingsSidebar'
import { CoachCard } from './CoachCard'
import { GameCard } from './GameCard'
import { RulesOfTheGame } from './RulesOfTheGame'
import { BadgeCelebration, BulkBadgeCelebration } from './BadgeCelebration'
import { DateRangePicker, getDefaultRange } from './DateRangePicker'
import type { DateRange } from './DateRangePicker'
import { BASE_PATH } from '../config'
import { getBadgeDef } from '../lib/gameTypes'
import type { BadgeDefinition } from '../lib/gameTypes'
import {
  analyzeActivity,
  computeTrends,
  computeSummary,
  formatPace,
} from '../lib/mafAnalysis'
import type {
  MAFActivity,
} from '../lib/mafAnalysis'

interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  start_date?: string | null
  maf_zone_low?: number
  maf_zone_high?: number
  qualifying_tolerance?: number
  athlete_name?: string
}

// Activity type icons from Strava sport_type
function ActivityIcon({ type }: { type?: string }) {
  const t = (type || '').toLowerCase()
  if (t.includes('walk')) return <span title="Walk" className="text-gray-600 text-xs">🚶</span>
  if (t.includes('hike')) return <span title="Hike" className="text-gray-600 text-xs">🥾</span>
  if (t.includes('ride') || t.includes('cycle')) return <span title="Ride" className="text-gray-600 text-xs">🚴</span>
  if (t.includes('trail')) return <span title="Trail Run" className="text-gray-600 text-xs">⛰️</span>
  return <span title="Run" className="text-gray-600 text-xs">🏃</span>
}

export function Dashboard({
  settings: initialSettings,
  onSettingsChange,
}: {
  settings: Settings
  onSettingsChange: (s: Settings) => void
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [allActivities, setAllActivities] = useState<MAFActivity[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(!initialSettings.configured)
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getDefaultRange(initialSettings.start_date)
  )
  const lastSyncRange = useRef<string>('')

  // Coaching + Game state
  const [coaching, setCoaching] = useState<any>(null)
  const [gameState, setGameState] = useState<any>(null)
  const [coachLoading, setCoachLoading] = useState(true)
  const [rulesOpen, setRulesOpen] = useState(false)

  // Badge celebration state
  const [celebrationQueue, setCelebrationQueue] = useState<BadgeDefinition[]>([])
  const [showBulkCelebration, setShowBulkCelebration] = useState(false)
  const seenBadgesRef = useRef<Set<string>>(new Set(
    JSON.parse(localStorage.getItem('maf_seen_badges') || '[]')
  ))

  const handleCelebrationDismiss = useCallback(() => {
    setCelebrationQueue((prev) => prev.slice(1))
  }, [])

  const handleBulkDismiss = useCallback(() => {
    setShowBulkCelebration(false)
    setCelebrationQueue([])
  }, [])

  useEffect(() => {
    async function fetchCoachData() {
      setCoachLoading(true)
      try {
        const [coachRes, gameRes] = await Promise.all([
          fetch(`${BASE_PATH}/api/coaching/latest`),
          fetch(`${BASE_PATH}/api/game`),
        ])
        if (coachRes.ok) {
          const data = await coachRes.json()
          if (data && data.headline) setCoaching(data)
        }
        if (gameRes.ok) {
          const data = await gameRes.json()
          if (data && typeof data.level === 'number') {
            setGameState(data)

            // Detect new badges for celebration
            const earnedIds: string[] = data.badges_earned || []
            const newBadgeIds = earnedIds.filter((id: string) => !seenBadgesRef.current.has(id))
            if (newBadgeIds.length > 0) {
              const newBadges = newBadgeIds
                .map((id: string) => getBadgeDef(id))
                .filter((b): b is BadgeDefinition => !!b)

              // Update seen badges
              for (const id of earnedIds) seenBadgesRef.current.add(id)
              localStorage.setItem('maf_seen_badges', JSON.stringify([...seenBadgesRef.current]))

              if (newBadges.length > 3) {
                // Bulk celebration for many badges (e.g., after backfill)
                setCelebrationQueue(newBadges)
                setShowBulkCelebration(true)
              } else {
                setCelebrationQueue(newBadges)
              }
            } else {
              // Sync seen badges (in case state drifted)
              for (const id of earnedIds) seenBadgesRef.current.add(id)
              localStorage.setItem('maf_seen_badges', JSON.stringify([...seenBadgesRef.current]))
            }
          }
        }
      } catch {
        // Coaching not available
      }
      setCoachLoading(false)
    }
    if (initialSettings.configured) fetchCoachData()
    else setCoachLoading(false)
  }, [])

  const units = settings.units || 'mi'
  const mafHr = settings.maf_hr || 145
  const age = settings.age ?? 35

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
      const afterTs = Math.floor(range.start.getTime() / 1000)
      const res = await fetch(`${BASE_PATH}/api/activities?after=${afterTs}`)
      if (!res.ok) throw new Error('Failed to fetch activities')
      const data = await res.json()

      const rawActivities = data.activities || []
      setSyncStatus(`Processing ${rawActivities.length} runs...`)

      const excludedIds: Set<number> = new Set(
        JSON.parse(localStorage.getItem('maf_excluded') || '[]')
      )

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
            units,
            excludedIds.has(activity.id)
          )
        )
      }

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
        qualifying: !a.excluded
          && a.duration_seconds >= 1200
          && a.time_below_ceiling_pct >= 60
          && a.avg_hr <= mafHr,
      }))
      localStorage.setItem('maf_activities', JSON.stringify(rechecked))
      return rechecked
    })
  }

  // Settings sidebar close handler — triggers sync + re-analysis
  function handleSettingsClose(updated: Settings | null) {
    if (updated) {
      setSettings(updated)
      onSettingsChange(updated)
      // Clear cache so activities get re-analyzed with new settings
      localStorage.removeItem('maf_activities')
      setAllActivities([])
      setDateRange(getDefaultRange(updated.start_date))
    }
    setSidebarOpen(false)
    if (updated) {
      setTimeout(() => syncActivities(getDefaultRange(updated.start_date)), 100)
    }
  }

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

  useEffect(() => {
    const rangeKey = dateRange.start.toISOString()
    if (lastSyncRange.current && rangeKey < lastSyncRange.current) {
      syncActivities(dateRange)
    }
  }, [dateRange])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Settings Sidebar */}
      <SettingsSidebar
        open={sidebarOpen}
        onClose={handleSettingsClose}
        currentSettings={settings}
        athleteName={settings.athlete_name}
        onSync={() => syncActivities(dateRange)}
      />

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Left: Logo + wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl leading-none" aria-hidden>🔥</span>
            <h1 className="text-lg font-bold">MAF Machine</h1>
          </div>

          {/* Center-right: How it works + Upgrade */}
          <div className="flex items-center gap-3 hidden sm:flex">
            <button
              onClick={() => setRulesOpen(true)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              How it works
            </button>
            <span className="text-gray-800">·</span>
            <button className="text-xs font-medium text-green-500/80 hover:text-green-400 transition-colors">
              Upgrade to Pro
            </button>
          </div>

          {/* Right: Unified settings block */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-2 text-sm bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 pl-3 pr-2.5 py-1.5 rounded-lg transition-colors"
          >
            <span className="text-gray-300 text-xs truncate max-w-[80px] sm:max-w-none">
              {settings.athlete_name?.split(' ')[0] || 'Settings'}
            </span>
            <span className="text-gray-700">·</span>
            <span className="text-orange-400 font-medium">{mafHr}</span>
            <span className="text-gray-600 text-xs hidden sm:inline">bpm · {age} yrs</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-600 shrink-0 ml-0.5">
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Rules of the Game modal */}
      <RulesOfTheGame open={rulesOpen} onClose={() => setRulesOpen(false)} />

      {/* Content — dims when sidebar is open */}
      <div className={`transition-opacity duration-300 ${sidebarOpen ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
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

          {/* Game Card — streaks, next step, level, badges */}
          <GameCard
            game={gameState}
            loading={coachLoading}
          />

          {/* Coach Card */}
          <CoachCard
            coaching={coaching}
            game={gameState}
            loading={coachLoading}
            coachingEnabled={false}
          />

          {/* Summary Cards */}
          {filteredSummary && (
            <SummaryCards
              summary={filteredSummary}
              trends={filteredTrends}
              units={units}
              mafHr={mafHr}
            />
          )}

          {/* Trend Chart — date picker integrated into toggle bar */}
          {filteredTrends.length > 0 && (
            <TrendChart
              trends={filteredTrends}
              units={units}
              mafHr={mafHr}
              datePickerSlot={
                <DateRangePicker
                  value={dateRange}
                  onChange={setDateRange}
                  trainingStartDate={settings.start_date}
                />
              }
            />
          )}

          {/* Run List */}
          {filteredActivities.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="px-4 py-3 border-b border-gray-800">
                <div className="flex items-center gap-3 text-xs text-gray-500 uppercase tracking-wide">
                  <span className="w-16 shrink-0">Date</span>
                  <span className="w-5 shrink-0 hidden sm:inline"></span>
                  <span className="flex-1">Run</span>
                  <span className="w-14 text-right">HR</span>
                  <span className="w-10 text-right">Below</span>
                  <span className="w-16 text-right">Pace</span>
                  <span className="w-10 text-right hidden sm:inline">EF</span>
                  <span className="w-6 text-center">Q</span>
                  <span className="w-10 text-center hidden sm:inline">Inc.</span>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">
                  {filteredActivities.length} runs{filteredActivities.length !== allActivities.length ? ` of ${allActivities.length} total` : ''}
                </p>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-800/50 max-h-96 overflow-y-auto">
                {filteredActivities.map((a) => (
                  <div
                    key={a.id}
                    className={`px-4 py-2.5 flex items-center gap-3 text-sm transition-opacity ${
                      a.excluded ? 'opacity-30' : ''
                    }`}
                  >
                    {/* Date */}
                    <span className="text-gray-500 w-16 shrink-0 text-xs">
                      {new Date(a.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>

                    {/* Activity type icon — desktop only */}
                    <span className="w-5 shrink-0 text-center hidden sm:inline">
                      <ActivityIcon type={(a as any).sport_type || (a as any).type} />
                    </span>

                    {/* Name + quality badge + Strava link */}
                    <span className="text-gray-300 flex-1 truncate flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{a.name}</span>
                      {a.qualifying && a.time_below_ceiling_pct > 85 && (
                        <span className="text-[10px] shrink-0" title="Outstanding run">⭐</span>
                      )}
                      <a
                        href={`https://www.strava.com/activities/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#FC4C02] hover:underline text-[10px] shrink-0"
                      >
                        ↗
                      </a>
                    </span>

                    {/* HR */}
                    <span className={`w-14 text-right font-medium text-xs ${
                      a.avg_hr <= mafHr ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      {Math.round(a.avg_hr)}
                    </span>

                    {/* Below ceiling % */}
                    <span className="w-10 text-right text-gray-500 text-xs">
                      {a.time_below_ceiling_pct.toFixed(0)}%
                    </span>

                    {/* Pace */}
                    <span className="w-16 text-right text-gray-500 text-xs">
                      {a.avg_pace > 0 ? formatPace(a.avg_pace, units) : '—'}
                    </span>

                    {/* EF */}
                    <span className="w-10 text-right text-gray-500 text-xs hidden sm:inline">
                      {a.efficiency_factor > 0 ? a.efficiency_factor.toFixed(2) : '—'}
                    </span>

                    {/* Qualifying */}
                    <span className="w-6 text-center">
                      {a.qualifying ? (
                        <span className="text-orange-400 text-xs">✓</span>
                      ) : (
                        <span className="text-gray-700 text-xs">·</span>
                      )}
                    </span>

                    {/* Include/Exclude toggle */}
                    <button
                      onClick={() => toggleExclude(a.id)}
                      className={`w-10 hidden sm:flex items-center justify-center transition-colors ${
                        a.excluded
                          ? 'text-gray-600 hover:text-gray-400'
                          : 'text-orange-400/60 hover:text-orange-400'
                      }`}
                      title={a.excluded ? 'Click to include this run in analysis' : 'Click to exclude this run from analysis'}
                    >
                      {a.excluded ? (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <circle cx="9" cy="9" r="7" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
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
                Click the menu to sync your activities from Strava, or{' '}
                <button onClick={() => setSidebarOpen(true)} className="text-orange-400 hover:underline">
                  configure your MAF settings
                </button>{' '}
                first.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Badge celebrations */}
      {showBulkCelebration && celebrationQueue.length > 0 && (
        <BulkBadgeCelebration badges={celebrationQueue} onDismiss={handleBulkDismiss} />
      )}
      {!showBulkCelebration && celebrationQueue.length > 0 && (
        <BadgeCelebration badge={celebrationQueue[0]} onDismiss={handleCelebrationDismiss} />
      )}
    </div>
  )
}
