import { useEffect, useCallback } from 'react'
import confetti from 'canvas-confetti'
import type { BadgeDefinition } from '../lib/gameTypes'

interface Props {
  badge: BadgeDefinition
  onDismiss: () => void
  level?: { level: number; name: string; progress: number; nextName?: string }
  autoDismiss?: boolean  // default true
}

export function BadgeCelebration({ badge, onDismiss, level, autoDismiss = true }: Props) {
  const fireConfetti = useCallback(() => {
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { x: 0.5, y: 0.45 },
      colors: ['#22c55e', '#4ade80', '#ffffff', '#86efac'],
      gravity: 0.8,
      ticks: 150,
    })
  }, [])

  useEffect(() => {
    fireConfetti()
    if (autoDismiss) {
      const timer = setTimeout(onDismiss, 3000)
      return () => clearTimeout(timer)
    }
  }, [fireConfetti, onDismiss, autoDismiss])

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-xs w-full space-y-3 text-center animate-[badgePop_0.4s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-6xl block">{badge.icon}</span>
        <h3 className="text-white font-bold text-lg">{badge.name}</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{badge.message}</p>
        {level && (
          <div className="pt-2 space-y-1.5">
            <p className="text-xs text-green-400 font-semibold">
              Level {level.level} · {level.name}
            </p>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  background: 'linear-gradient(to right, #166534, #22c55e, #4ade80)',
                  width: `${level.progress}%`,
                }}
              />
            </div>
            {level.nextName && (
              <p className="text-[10px] text-gray-600">→ {level.nextName}</p>
            )}
          </div>
        )}
        <button
          onClick={onDismiss}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors pt-1"
        >
          Continue
        </button>
      </div>

      <style>{`
        @keyframes badgePop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

interface BulkProps {
  badges: BadgeDefinition[]
  onDismiss: () => void
}

export function BulkBadgeCelebration({ badges, onDismiss }: BulkProps) {
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

  useEffect(() => {
    fireConfetti()
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [fireConfetti, onDismiss])

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-xs w-full space-y-4 text-center animate-[badgePop_0.4s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-white font-bold text-lg">You earned {badges.length} badges!</p>
        <div className="flex flex-wrap justify-center gap-2">
          {badges.map((b) => (
            <span key={b.id} className="text-3xl" title={b.name}>{b.icon}</span>
          ))}
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors pt-1"
        >
          Continue
        </button>
      </div>

      <style>{`
        @keyframes badgePop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
