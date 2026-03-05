import { useState, useEffect, useCallback } from 'react'
import confetti from 'canvas-confetti'
import { BADGES } from '../lib/gameTypes'
import { BASE_PATH } from '../config'

interface BackfillResult {
  processed: number
  qualifying: number
}

interface GameResult {
  level: number
  level_name: string
  level_progress_pct: number
  next_level_name: string | null
  badges_earned: string[]
  total_zone_minutes: number
  lifetime_total_runs: number
}

interface Props {
  onComplete: () => void
  mafHr?: number
}

type Phase = 'processing' | 'results' | 'error' | 'empty'

export function BackfillProgress({ onComplete, mafHr }: Props) {
  const [phase, setPhase] = useState<Phase>('processing')
  const [processingStatus, setProcessingStatus] = useState('Connecting to Strava...')
  const [backfill, setBackfill] = useState<BackfillResult | null>(null)
  const [game, setGame] = useState<GameResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const fireConfetti = useCallback(() => {
    confetti({
      particleCount: 100,
      spread: 90,
      origin: { x: 0.5, y: 0.4 },
      colors: ['#22c55e', '#4ade80', '#ffffff', '#86efac'],
      gravity: 0.8,
      ticks: 200,
    })
  }, [])

  const [progressTotal, setProgressTotal] = useState(0)
  const [progressCurrent, setProgressCurrent] = useState(0)

  useEffect(() => {
    let polling = true
    let pollTimer: ReturnType<typeof setTimeout>

    async function pollProgress() {
      if (!polling) return
      try {
        const res = await fetch(`${BASE_PATH}/api/backfill/progress`)
        if (res.ok) {
          const data = await res.json()
          if (data.total > 0) {
            setProgressTotal(data.total)
            setProgressCurrent(data.current)
            setProcessingStatus(`Analyzing run ${data.current} of ${data.total}...`)
          }
        }
      } catch {}
      if (polling) pollTimer = setTimeout(pollProgress, 1500)
    }

    async function runBackfill() {
      try {
        setProcessingStatus('Fetching your activities...')

        // Start polling progress in parallel with backfill
        pollTimer = setTimeout(pollProgress, 2000)

        const res = await fetch(`${BASE_PATH}/api/backfill`, { method: 'POST' })
        polling = false
        if (!res.ok) throw new Error('Backfill failed')
        const data = await res.json()

        setBackfill(data.backfill)
        setGame(data.game)

        if (data.backfill.processed === 0) {
          setPhase('empty')
        } else {
          setPhase('results')
          setTimeout(fireConfetti, 300)
        }
      } catch {
        polling = false
        setErrorMsg("Something went wrong analyzing your history. No worries — we'll track from here.")
        setPhase('error')
      }
    }
    runBackfill()

    return () => {
      polling = false
      clearTimeout(pollTimer)
    }
  }, [fireConfetti])

  // Processing phase
  if (phase === 'processing') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6 relative">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-5xl animate-pulse">🔥</div>
          <h1 className="text-xl font-bold">Analyzing your history...</h1>
          <div className="space-y-2">
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
              {progressTotal > 0 ? (
                <div
                  className="h-full rounded-full bg-green-500/70 transition-all duration-500"
                  style={{ width: `${Math.max(2, (progressCurrent / progressTotal) * 100)}%` }}
                />
              ) : (
                <div
                  className="h-full rounded-full bg-green-500/70 animate-[indeterminate_1.5s_ease-in-out_infinite]"
                  style={{ width: '60%' }}
                />
              )}
            </div>
            <p className="text-sm text-gray-500">
              {processingStatus}
            </p>
          </div>
        </div>
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <a href="https://www.strava.com" target="_blank" rel="noopener noreferrer">
            <img src={`${BASE_PATH}/api_logo_pwrdBy_strava_horiz_white.svg`} alt="Powered by Strava" width={130} height={13} className="h-4 w-auto" />
          </a>
        </div>
        <style>{`
          @keyframes indeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
        `}</style>
      </div>
    )
  }

  // Error phase
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <p className="text-gray-400 text-sm leading-relaxed">{errorMsg}</p>
          <button
            onClick={onComplete}
            className="px-8 py-3 rounded-lg font-semibold text-base bg-green-500 hover:bg-green-400 text-gray-950 transition-colors"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Empty phase — no runs found
  if (phase === 'empty') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-5xl">🔥</div>
          <h1 className="text-xl font-bold">Ready to start</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Your first MAF run will light the fire.
            {mafHr && <> Just keep it under <span className="text-green-400 font-medium">{mafHr} bpm</span>.</>}
          </p>
          <button
            onClick={onComplete}
            className="px-8 py-3 rounded-lg font-semibold text-base bg-green-500 hover:bg-green-400 text-gray-950 transition-colors"
          >
            See Your Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Results phase
  const earnedBadgeIds = new Set(game?.badges_earned || [])
  const earnedBadges = BADGES.filter((b) => earnedBadgeIds.has(b.id))

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-3xl">🎉</p>
          <h1 className="text-2xl font-bold">Look at that.</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            You've already logged{' '}
            <span className="text-white font-semibold">{Math.round(game?.total_zone_minutes || 0)}</span>{' '}
            zone minutes across{' '}
            <span className="text-white font-semibold">{backfill?.processed || 0}</span> runs.
          </p>
        </div>

        {/* Level progress */}
        {game && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-green-400">
                Level {game.level} · {game.level_name}
              </span>
              <span className="text-xs text-gray-600">
                {Math.round(game.level_progress_pct)}%
              </span>
            </div>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  background: 'linear-gradient(to right, #166534, #22c55e, #4ade80)',
                  width: `${game.level_progress_pct}%`,
                }}
              />
            </div>
            {game.next_level_name && (
              <p className="text-[10px] text-gray-600">→ {game.next_level_name}</p>
            )}
          </div>
        )}

        {/* Earned badges */}
        {earnedBadges.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2.5">
            {earnedBadges.map((badge) => (
              <div
                key={badge.id}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800/60 border border-green-500/30 shadow-[0_0_8px_rgba(34,197,94,0.15)] text-xl"
                title={badge.name}
              >
                {badge.icon}
              </div>
            ))}
          </div>
        )}

        {/* Encouragement */}
        <p className="text-center text-gray-400 text-sm">
          You've already built a foundation. Let's keep the fire going.
        </p>

        {/* CTA */}
        <button
          onClick={onComplete}
          className="w-full py-3.5 rounded-lg font-semibold text-base bg-green-500 hover:bg-green-400 text-gray-950 transition-colors"
        >
          See Your Dashboard
        </button>

        {/* Strava attribution */}
        <div className="flex justify-center pt-4">
          <a href="https://www.strava.com" target="_blank" rel="noopener noreferrer">
            <img src={`${BASE_PATH}/api_logo_pwrdBy_strava_horiz_white.svg`} alt="Powered by Strava" width={130} height={13} className="h-4 w-auto opacity-50" />
          </a>
        </div>
      </div>
    </div>
  )
}
