import { useState, useEffect, useRef } from 'react'
import { BADGES, getBadgeDef } from '../lib/gameTypes'
import type { BadgeDefinition, BadgeCategory } from '../lib/gameTypes'

const CATEGORY_ORDER: BadgeCategory[] = ['first_run', 'discipline', 'consistency', 'volume', 'maf_test']

// Streak milestone weeks where consistency badges are awarded
const STREAK_MILESTONES: { week: number; badgeId: string; icon: string }[] = [
  { week: 1, badgeId: 'full_week', icon: '📅' },
  { week: 2, badgeId: 'two_week_fire', icon: '🔥' },
  { week: 4, badgeId: 'month_strong', icon: '🔥' },
  { week: 8, badgeId: 'eight_week_wall', icon: '🔥' },
  { week: 12, badgeId: 'the_commitment', icon: '💎' },
  { week: 26, badgeId: 'half_year_club', icon: '👑' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

interface GameData {
  level: number
  level_name: string
  level_progress_pct: number
  next_level_name: string | null
  streak: {
    current: number
    longest: number
    frozen: boolean
  }
  weekly: {
    zone_minutes: number
    target: number
    runs: number
    qualifying_runs: number
    days_left: number
  }
  badges_earned: string[]
  badges_recent: string[]
  next_step: {
    priority: string
    message: string
    detail?: string
  }
  lifetime_total_runs: number
  total_zone_minutes: number
  // v1 compat
  xp_total?: number
}

interface Props {
  game: GameData | null
  loading: boolean
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_GAME: GameData = {
  level: 3,
  level_name: 'Commitment Maker',
  level_progress_pct: 58,
  next_level_name: 'Steady Flame',
  streak: { current: 4, longest: 6, frozen: false },
  weekly: { zone_minutes: 62, target: 90, runs: 2, qualifying_runs: 2, days_left: 4 },
  badges_earned: ['committed', 'first_spark', 'took_initiative', 'seedling', 'dialed_in'],
  badges_recent: ['dialed_in', 'seedling'],
  next_step: { priority: 'streak', message: '28 minutes to go this week', detail: 'One more run keeps your 4-week streak alive' },
  lifetime_total_runs: 12,
  total_zone_minutes: 342,
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GameCard({ game: externalGame, loading }: Props) {
  const game = externalGame || MOCK_GAME
  const isMock = !externalGame

  const [levelAnimated, setLevelAnimated] = useState(0)
  const [showBadgeDetail, setShowBadgeDetail] = useState<BadgeDefinition | null>(null)
  const animRef = useRef<number | null>(null)

  const weeklyPct = Math.min(100, (game.weekly.zone_minutes / game.weekly.target) * 100)
  const minutesRemaining = Math.max(0, game.weekly.target - game.weekly.zone_minutes)

  // Animate level progress bar on mount
  useEffect(() => {
    const targetPct = game.level_progress_pct
    const duration = 1000
    const start = performance.now()

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setLevelAnimated(eased * targetPct)
      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick)
      }
    }
    animRef.current = requestAnimationFrame(tick)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [game.level_progress_pct])

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-2 bg-gray-800 rounded w-48 mb-4" />
        <div className="h-4 bg-gray-800 rounded w-full mb-3" />
        <div className="h-2 bg-gray-800 rounded w-32" />
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {isMock && (
        <div className="bg-gray-800/50 px-4 py-1.5 text-xs text-gray-600 text-center">
          Preview — complete setup to start tracking
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* ─── Streak — weekly segments ─── */}
        <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-3 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🔥</span>
              <span className="text-sm font-semibold text-white">
                {game.streak.current > 0
                  ? `${game.streak.current}-week streak`
                  : game.streak.frozen
                    ? 'Streak paused'
                    : 'Build your streak'}
              </span>
            </div>
            {game.streak.frozen && (
              <span className="text-[10px] text-yellow-500/70 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                Paused
              </span>
            )}
          </div>

          {/* Week blocks */}
          {(() => {
            const completed = game.streak.current
            const currentWeekNum = completed + 1
            // Show blocks up to the next milestone beyond current, or +2
            const nextMilestone = STREAK_MILESTONES.find((m) => m.week > completed)
            const totalBlocks = Math.max(
              currentWeekNum + 1,
              nextMilestone ? nextMilestone.week : currentWeekNum + 2,
            )
            // Cap at reasonable display (max 12 blocks visible, scroll for more)
            const visibleBlocks = Math.min(totalBlocks, Math.max(8, currentWeekNum + 2))

            return (
              <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
                {Array.from({ length: visibleBlocks }, (_, i) => {
                  const weekNum = i + 1
                  const isCompleted = weekNum <= completed
                  const isCurrent = weekNum === currentWeekNum
                  const isFuture = weekNum > currentWeekNum
                  const milestone = STREAK_MILESTONES.find((m) => m.week === weekNum)
                  const milestoneEarned = milestone ? game.badges_earned.includes(milestone.badgeId) : false

                  return (
                    <div key={weekNum} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      {/* Milestone icon above block */}
                      {milestone ? (
                        <span className={`text-[10px] leading-none ${milestoneEarned ? '' : 'opacity-25 grayscale'}`}>
                          {milestone.icon}
                        </span>
                      ) : (
                        <span className="text-[10px] leading-none invisible">·</span>
                      )}
                      {/* Block */}
                      <div
                        className={`w-7 h-5 rounded-sm overflow-hidden relative ${
                          isCompleted
                            ? 'bg-green-500/70'
                            : isCurrent
                              ? 'bg-gray-700'
                              : 'bg-gray-800/60 border border-gray-700/50'
                        }`}
                      >
                        {/* Current week partial fill */}
                        {isCurrent && (
                          <div
                            className="absolute inset-y-0 left-0 bg-green-500/50 transition-all duration-700"
                            style={{ width: `${weeklyPct}%` }}
                          />
                        )}
                        {/* Completed checkmark */}
                        {isCompleted && (
                          <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white/60">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Current week status */}
          <p className="text-[11px] text-gray-500">
            {minutesRemaining > 0 ? (
              <>
                {Math.round(game.weekly.zone_minutes)}/{game.weekly.target} min this week
                {minutesRemaining <= 30 && <span className="text-green-500/80"> · {Math.ceil(minutesRemaining)} min to go</span>}
                {game.weekly.days_left <= 2 && (
                  <span className="text-yellow-500/80"> · {game.weekly.days_left === 0 ? 'Last day!' : `${game.weekly.days_left}d left`}</span>
                )}
              </>
            ) : game.weekly.zone_minutes > 0 ? (
              <span className="text-green-500/80">Target hit this week ✓</span>
            ) : (
              <span>Run below your ceiling to start building</span>
            )}
          </p>
        </div>

        {/* ─── Next Step ─── */}
        {game.next_step && (
          <div className="px-1 space-y-0.5">
            <p className="text-sm text-white font-medium leading-snug">
              {game.next_step.message}
            </p>
            {game.next_step.detail && (
              <p className="text-[11px] text-gray-500">{game.next_step.detail}</p>
            )}
          </div>
        )}

        {/* ─── Level Progress ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-green-400">
              Level {game.level} · {game.level_name}
            </span>
            <span className="text-xs text-gray-600">
              {Math.round(game.level_progress_pct)}%
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(to right, #166534, #22c55e, #4ade80)', width: `${levelAnimated}%`, transition: 'none' }}
            />
          </div>
          {game.next_level_name && (
            <p className="text-[10px] text-gray-600">
              → {game.next_level_name}
            </p>
          )}
        </div>

        {/* ─── Trophy Case — earned first, then unearned ─── */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">
            Badges · {game.badges_earned.length}/{BADGES.length}
          </p>
          <div className="flex flex-wrap gap-2 sm:gap-2.5">
            {(() => {
              const allBadges = CATEGORY_ORDER.flatMap((cat) =>
                BADGES.filter((b) => b.category === cat)
              )
              const earnedSet = new Set(game.badges_earned)
              const earned = allBadges.filter((b) => earnedSet.has(b.id))
              const unearned = allBadges.filter((b) => !earnedSet.has(b.id))
              return [...earned, ...unearned].map((badge) => {
                const isEarned = earnedSet.has(badge.id)
                return (
                  <button
                    key={badge.id}
                    onClick={() => setShowBadgeDetail(badge)}
                    className={`flex-shrink-0 flex items-center justify-center rounded-xl transition-all ${
                      isEarned
                        ? 'w-10 h-10 bg-gray-800/60 border border-green-500/30 shadow-[0_0_8px_rgba(34,197,94,0.15)] hover:border-green-500/60 hover:shadow-[0_0_12px_rgba(34,197,94,0.25)] text-xl'
                        : 'w-8 h-8 bg-transparent border-none opacity-20 grayscale hover:opacity-35 text-base'
                    }`}
                    title={badge.name}
                  >
                    {badge.icon}
                  </button>
                )
              })
            })()}
          </div>
        </div>
      </div>

      {/* ─── Badge Detail Modal ─── */}
      {showBadgeDetail && (() => {
        const earned = game.badges_earned.includes(showBadgeDetail.id)
        return (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowBadgeDetail(null)}
          >
            <div
              className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-xs w-full space-y-3 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <span className={`text-4xl block ${earned ? '' : 'grayscale opacity-40'}`}>{showBadgeDetail.icon}</span>
              <h3 className="text-white font-semibold">{showBadgeDetail.name}</h3>
              {earned ? (
                <p className="text-sm text-gray-400 leading-relaxed">{showBadgeDetail.message}</p>
              ) : (
                <p className="text-sm text-gray-500 leading-relaxed italic">
                  {showBadgeDetail.trigger.replace(/_/g, ' ')}
                </p>
              )}
              <button
                onClick={() => setShowBadgeDetail(null)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
