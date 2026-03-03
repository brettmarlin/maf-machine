import { useState, useEffect } from 'react'
import { BASE_PATH } from '../config'

interface CoachingData {
  activity_id: number
  headline: string
  assessment: string
  highlight: string
  focus_next_run: string
  xp_note: string
  generated_at: string
  run_name?: string
  run_date?: string
  // v2 fields (populated from game result)
  badges_earned?: Array<{ id: string; name: string; icon: string; message: string }>
  surprise_bonuses?: Array<{ id: string; name: string; message: string }>
}

interface GameData {
  level: number
  level_name: string
  badges_earned?: string[]
}

interface Props {
  coaching: CoachingData | null
  game: GameData | null
  loading: boolean
  coachingEnabled?: boolean
}

export function CoachCard({ coaching, game, loading, coachingEnabled = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load existing note when coaching changes
  useEffect(() => {
    if (!coaching?.activity_id) return
    fetch(`${BASE_PATH}/api/notes/${coaching.activity_id}`)
      .then((r) => r.ok ? r.json() : { note: '' })
      .then((data) => { setNote(data.note || ''); setNoteSaved(true) })
      .catch(() => {})
  }, [coaching?.activity_id])

  async function saveNote() {
    if (!coaching?.activity_id || saving) return
    setSaving(true)
    try {
      await fetch(`${BASE_PATH}/api/notes/${coaching.activity_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      setNoteSaved(true)
    } catch {}
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-3 bg-gray-800 rounded w-48 mb-3" />
        <div className="h-3 bg-gray-800 rounded w-full mb-2" />
        <div className="h-3 bg-gray-800 rounded w-3/4" />
      </div>
    )
  }

  if (!coaching && !game) return null

  // Pro gate — show teaser when coaching is disabled
  if (!coachingEnabled) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        {coaching && (
          <p className="text-xs text-gray-400 font-medium">
            {coaching.run_name || 'Latest run'}
            {coaching.run_date && (
              <span className="text-gray-600 ml-1.5">
                — {new Date(coaching.run_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </p>
        )}
        <div className="text-center py-2 space-y-2">
          <p className="text-sm text-white font-semibold">Unlock AI Coaching</p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
            Get personalized insights for every run, powered by an AI coach that learns your patterns and gets smarter over time.
          </p>
          <button className="mt-2 text-xs font-medium text-gray-950 bg-green-500 hover:bg-green-400 px-4 py-1.5 rounded-lg transition-colors">
            Upgrade to Pro
          </button>
        </div>
      </div>
    )
  }

  if (!coaching) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
        <p className="text-gray-500 text-sm">
          Complete a qualifying run to get your first coaching assessment.
        </p>
      </div>
    )
  }

  const paragraphs = coaching.assessment.split('\n\n')
  const summary = paragraphs[0] || ''
  const rest = paragraphs.slice(1)

  const runLabel = coaching.run_name || 'Latest run'
  const dateLabel = coaching.run_date
    ? new Date(coaching.run_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : ''

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      {/* Header: run name + date | Strava link */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">
          {runLabel}
          {dateLabel && (
            <span className="text-gray-600 ml-1.5">— {dateLabel}</span>
          )}
        </p>
        {coaching.activity_id && (
          <a
            href={`https://www.strava.com/activities/${coaching.activity_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            Strava ↗
          </a>
        )}
      </div>

      {/* Badge celebrations */}
      {coaching.badges_earned && coaching.badges_earned.length > 0 && (
        <div className="space-y-1.5">
          {coaching.badges_earned.map((badge) => (
            <div
              key={badge.id}
              className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2"
            >
              <span className="text-lg shrink-0">{badge.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-orange-400">{badge.name}</p>
                <p className="text-[11px] text-gray-400 leading-snug">{badge.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Surprise bonuses */}
      {coaching.surprise_bonuses && coaching.surprise_bonuses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {coaching.surprise_bonuses.map((bonus) => (
            <span
              key={bonus.id}
              className="text-[11px] text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/15 rounded-full px-2.5 py-0.5"
              title={bonus.message}
            >
              {bonus.name}
            </span>
          ))}
        </div>
      )}

      {/* Headline */}
      <h2 className="text-base font-semibold text-white leading-tight">
        {coaching.headline}
      </h2>

      {/* Summary (first paragraph — always visible) */}
      <p className="text-sm text-gray-300 leading-relaxed">{summary}</p>

      {/* Expanded assessment */}
      {rest.length > 0 && (
        <>
          {expanded && (
            <div className="text-sm text-gray-300 leading-relaxed space-y-2">
              {rest.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-orange-400/70 hover:text-orange-400 transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </>
      )}

      {/* Runner notes */}
      <div className="pt-1 border-t border-gray-800/50 space-y-1.5">
        <textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setNoteSaved(false) }}
          onBlur={() => { if (!noteSaved) saveNote() }}
          placeholder="How did this run feel? (conditions, fatigue, notes...)"
          rows={2}
          maxLength={500}
          className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-700"
        />
        {!noteSaved && (
          <div className="flex justify-end">
            <button
              onClick={saveNote}
              disabled={saving}
              className="text-[10px] text-orange-400/70 hover:text-orange-400 transition-colors"
            >
              {saving ? 'Saving...' : 'Save note'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
