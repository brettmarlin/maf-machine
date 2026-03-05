import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { SummaryCards } from './SummaryCards'
import { TrendChart } from './TrendChart'
import { SettingsSidebar } from './SettingsSidebar'
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
  training_start_date?: string | null
  maf_zone_low?: number
  maf_zone_high?: number
  qualifying_tolerance?: number
  athlete_name?: string
  display_name?: string
  avatar_url?: string
  firstname?: string
  lastname?: string
  profile?: string
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
  const trainingStart = initialSettings.training_start_date || initialSettings.start_date
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getDefaultRange(trainingStart)
  )
  const lastSyncRange = useRef<string>('')

  // Coaching + Game state
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
        const gameRes = await fetch(`${BASE_PATH}/api/game`)
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
      const updatedStart = updated.training_start_date || updated.start_date
      setDateRange(getDefaultRange(updatedStart))
    }
    setSidebarOpen(false)
    if (updated) {
      const updatedStart = updated.training_start_date || updated.start_date
      setTimeout(() => syncActivities(getDefaultRange(updatedStart)), 100)
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
        devMode={gameState?.dev_mode === true}
      />

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Left: Logo + wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl leading-none" aria-hidden>🔥</span>
            <h1 className="text-lg font-bold">MAF Machine</h1>
          </div>

          {/* Right: How it works + settings block */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRulesOpen(true)}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors hidden sm:inline"
            >
              How it works
            </button>
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-2 text-sm bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 pl-2 pr-2.5 py-1.5 rounded-lg transition-colors"
            >
              {(settings.profile || settings.avatar_url) ? (
                <img
                  src={settings.profile || settings.avatar_url}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-[11px] shrink-0">
                  {(settings.firstname || settings.display_name || settings.athlete_name || '?')[0]?.toUpperCase()}
                </span>
              )}
              <span className="text-gray-300 text-xs truncate max-w-[80px] sm:max-w-none">
                {settings.firstname || settings.display_name || settings.athlete_name?.split(' ')[0] || 'Settings'}
              </span>
              <span className="text-gray-700">·</span>
              <span className="text-green-500 font-medium">{mafHr}</span>
              <span className="text-gray-600 text-xs hidden sm:inline">bpm</span>
              {/* Gear icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-gray-500 shrink-0">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Rules of the Game modal */}
      <RulesOfTheGame open={rulesOpen} onClose={() => setRulesOpen(false)} currentLevel={gameState?.level} />

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

          {/* Trend Chart — date picker integrated into toggle bar */}
          <TrendChart
            trends={filteredTrends}
            units={units}
            mafHr={mafHr}
            datePickerSlot={
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
                trainingStartDate={settings.training_start_date || settings.start_date}
              />
            }
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
                  <span className="w-10 text-right">Zone</span>
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
                      <ActivityIcon type={a.sport_type} />
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
                        View on Strava
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
          {filteredActivities.length === 0 && allActivities.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-500">
                Your first run will show up after syncing with Strava
              </p>
            </div>
          )}

          {/* Footer */}
          <footer className="border-t border-gray-800 py-4 mt-8 flex flex-col items-center gap-2">
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
            <a href="/privacy" className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors">Privacy Policy</a>
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
