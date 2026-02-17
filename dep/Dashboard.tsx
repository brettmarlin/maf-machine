import { useState, useEffect } from 'react'
import { SummaryCards } from './SummaryCards'
import { TrendChart } from './TrendChart'
import { RunAdvisor } from './RunAdvisor'
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
}

const QUALIFYING_TOLERANCE = 10 // bpm above maf_zone_high

export function Dashboard({ settings }: { settings: Settings }) {
  const [activities, setActivities] = useState<MAFActivity[]>([])
  const [trends, setTrends] = useState<MAFTrend[]>([])
  const [summary, setSummary] = useState<MAFSummary | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const units = settings.units || 'mi'
  const mafHr = settings.maf_hr || 130
  const mafZoneLow = settings.maf_zone_low || 125
  const mafZoneHigh = settings.maf_zone_high || 135
  const qualifyingHigh = mafZoneHigh + QUALIFYING_TOLERANCE

  async function syncActivities() {
    setSyncing(true)
    setError(null)
    setSyncStatus('Fetching activities from Strava...')

    try {
      const res = await fetch('/api/activities')
      if (!res.ok) throw new Error('Failed to fetch activities')
      const data = await res.json()

      const rawActivities = data.activities || []
      setSyncStatus(`Processing ${rawActivities.length} runs...`)

      // Load exclusions from localStorage
      const excludedIds: Set<number> = new Set(
        JSON.parse(localStorage.getItem('maf_excluded') || '[]')
      )

      const analyzed: MAFActivity[] = []

      for (let i = 0; i < rawActivities.length; i++) {
        const activity = rawActivities[i]
        setSyncStatus(`Analyzing run ${i + 1} of ${rawActivities.length}...`)

        let streams = null
        try {
          const streamRes = await fetch(`/api/activities/${activity.id}/streams`)
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
            QUALIFYING_TOLERANCE,
            units,
            excludedIds.has(activity.id)
          )
        )
      }

      setActivities(analyzed)
      setTrends(computeTrends(analyzed))
      setSummary(computeSummary(analyzed))
      setSyncStatus(`Synced ${analyzed.length} runs`)

      localStorage.setItem('maf_activities', JSON.stringify(analyzed))
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

    // Recompute
    const updated = activities.map((a) =>
      a.id === id ? { ...a, excluded: excludedIds.has(id) } : a
    )
    const rechecked = updated.map((a) => ({
      ...a,
      qualifying: !a.excluded && a.duration_seconds >= 1200 && a.time_in_qualifying_zone_pct >= 60,
    }))

    setActivities(rechecked)
    setTrends(computeTrends(rechecked))
    setSummary(computeSummary(rechecked))
    localStorage.setItem('maf_activities', JSON.stringify(rechecked))
  }

  useEffect(() => {
    const cached = localStorage.getItem('maf_activities')
    if (cached) {
      try {
        const parsed: MAFActivity[] = JSON.parse(cached)
        setActivities(parsed)
        setTrends(computeTrends(parsed))
        setSummary(computeSummary(parsed))
      } catch {
        // Ignore bad cache
      }
    }
    syncActivities()
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">MAF Machine</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              MAF HR: <span className="text-red-400 font-medium">{mafHr}</span> bpm
              <span className="text-gray-600 ml-1">
                ({mafZoneLow}–{mafZoneHigh}, qual: {qualifyingHigh})
              </span>
            </span>
            <button
              onClick={syncActivities}
              disabled={syncing}
              className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
            <a
              href="/api/auth/logout"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Logout
            </a>
          </div>
        </div>

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

        {/* Summary Cards — HR primary, pace/ef/cadence secondary */}
        {summary && (
          <SummaryCards
            summary={summary}
            units={units}
            mafHr={mafHr}
            mafZoneLow={mafZoneLow}
            mafZoneHigh={mafZoneHigh}
          />
        )}

        {/* Trend Chart — HR as primary axis with MAF zone band */}
        {trends.length > 0 && (
          <TrendChart
            trends={trends}
            units={units}
            mafHr={mafHr}
            mafZoneLow={mafZoneLow}
            mafZoneHigh={mafZoneHigh}
            qualifyingHigh={qualifyingHigh}
          />
        )}

        {/* Run Advisor */}
        {summary && activities.length > 0 && (
          <RunAdvisor
            summary={summary}
            activities={activities}
            mafHr={mafHr}
            mafZoneLow={mafZoneLow}
            mafZoneHigh={mafZoneHigh}
            units={units}
          />
        )}

        {/* Run List */}
        {activities.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-400">
                All Runs ({activities.length})
              </h2>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span>HR</span>
                <span>Zone</span>
                <span>Pace</span>
                <span>EF</span>
              </div>
            </div>
            <div className="divide-y divide-gray-800/50 max-h-96 overflow-y-auto">
              {activities.map((a) => (
                <div
                  key={a.id}
                  className={`px-4 py-3 flex items-center gap-4 text-sm ${
                    a.excluded ? 'opacity-40' : ''
                  }`}
                >
                  {/* Date */}
                  <span className="text-gray-500 w-20 shrink-0">
                    {new Date(a.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>

                  {/* Name */}
                  <span className="text-gray-300 flex-1 truncate">{a.name}</span>

                  {/* HR — primary metric, color-coded by zone */}
                  <span className={`w-16 text-right font-medium ${
                    a.avg_hr >= mafZoneLow && a.avg_hr <= mafZoneHigh
                      ? 'text-green-400'
                      : a.avg_hr <= qualifyingHigh
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  }`}>
                    {Math.round(a.avg_hr)} bpm
                  </span>

                  {/* Zone % */}
                  <span className="w-12 text-right text-gray-500">
                    {a.time_in_maf_zone_pct.toFixed(0)}%
                  </span>

                  {/* Pace */}
                  <span className="w-20 text-right text-gray-500">
                    {a.avg_pace > 0 ? formatPace(a.avg_pace, units) : '—'}
                  </span>

                  {/* EF */}
                  <span className="w-12 text-right text-gray-500">
                    {a.efficiency_factor > 0 ? a.efficiency_factor.toFixed(2) : '—'}
                  </span>

                  {/* Qualifying badge */}
                  <span className="w-6 text-center">
                    {a.qualifying ? (
                      <span className="text-green-400 text-xs">✓</span>
                    ) : (
                      <span className="text-gray-700 text-xs">·</span>
                    )}
                  </span>

                  {/* Exclude toggle */}
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
      </div>
    </div>
  )
}
