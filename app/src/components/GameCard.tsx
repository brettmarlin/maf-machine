import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BADGES } from '../lib/gameTypes'
import type { BadgeDefinition, BadgeCategory } from '../lib/gameTypes'

const CATEGORY_ORDER: BadgeCategory[] = ['first_run', 'discipline', 'consistency', 'volume', 'maf_test']

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
  debugWeekPct?: number | null
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

// ─── Badge Dock (macOS-style hover magnification) ────────────────────────────

function BadgeDock({ badges, earnedSet, onSelect }: {
  badges: BadgeDefinition[]
  earnedSet: Set<string>
  onSelect: (b: BadgeDefinition) => void
}) {
  const [mouseX, setMouseX] = useState<number | null>(null)

  return (
    <div
      onMouseMove={(e) => setMouseX(e.clientX)}
      onMouseLeave={() => setMouseX(null)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(45px, 1fr))',
        gap: '10px',
        width: '100%',
        padding: '16px 8px 8px',
        overflow: 'visible',
      }}
    >
      {badges.map((badge) => (
        <BadgeDockItem
          key={badge.id}
          badge={badge}
          earned={earnedSet.has(badge.id)}
          mouseX={mouseX}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function BadgeDockItem({ badge, earned, mouseX, onSelect }: {
  badge: BadgeDefinition
  earned: boolean
  mouseX: number | null
  onSelect: (b: BadgeDefinition) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  let scale = 1
  if (ref.current && mouseX !== null && earned) {
    const rect = ref.current.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    const distance = Math.abs(mouseX - center)
    const maxDistance = 80
    const maxScale = 1.6
    if (distance < maxDistance) {
      scale = 1 + (maxScale - 1) * (1 - distance / maxDistance)
    }
  }
  const isScaled = scale > 1.05

  return (
    <button
      ref={ref}
      onClick={() => onSelect(badge)}
      className={`flex items-center justify-center rounded-xl ${
        earned
          ? 'glass-card border-maf-green/30 shadow-maf-glow-green hover:border-maf-green/60 text-xl'
          : 'bg-transparent border-none opacity-20 grayscale hover:opacity-35 text-base'
      }`}
      style={{
        aspectRatio: '1',
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center',
        transition: 'transform 0.15s ease',
        position: 'relative',
        zIndex: isScaled ? 10 : 1,
      }}
      title={badge.name}
    >
      {badge.icon}
    </button>
  )
}

// ─── Streak Timeline ─────────────────────────────────────────────────────────

function getFutureOpacity(distanceFromCurrent: number): number {
  const opacities = [1.0, 0.80, 0.60, 0.40, 0.20]
  return opacities[Math.min(distanceFromCurrent - 1, opacities.length - 1)]
}

function CompletedCircle() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="17.7131" cy="17.7131" r="17.7131" fill="#15F45E" fillOpacity="0.08"/>
      <circle cx="17.7131" cy="17.7131" r="17.0681" stroke="#15F45E" strokeOpacity="0.4" strokeWidth="1.29012"/>
      <path d="M16.3961 17.4458L20.7257 13.1162L22.8905 15.281L16.3961 21.7754L12.0664 17.4458L14.2312 15.281L16.3961 17.4458Z" fill="white" fillOpacity="0.7"/>
    </svg>
  )
}

function ActiveWeekRing({ pct }: { pct: number }) {
  const [animatedPct, setAnimatedPct] = useState(0)
  const [displayPct, setDisplayPct] = useState(0)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (hasAnimated.current) {
      setAnimatedPct(pct)
      setDisplayPct(Math.round(pct * 100))
      return
    }
    hasAnimated.current = true

    // Arc draw — delayed to fire after paint
    const arcTimeout = setTimeout(() => {
      setAnimatedPct(pct)
    }, 300)

    // Number count-up — synced with arc
    const target = Math.round(pct * 100)
    const duration = 1200
    const startTime = Date.now() + 300

    let rafId: number
    const tick = () => {
      const elapsed = Date.now() - startTime
      if (elapsed < 0) { rafId = requestAnimationFrame(tick); return }
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayPct(Math.round(eased * target))
      if (progress < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      clearTimeout(arcTimeout)
      cancelAnimationFrame(rafId)
    }
  }, [pct])

  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="23" stroke="rgba(255,255,255,0.08)" strokeWidth="3.97"/>
        <circle
          cx="26" cy="26" r="23"
          fill="none"
          stroke="url(#activeGradient)"
          strokeWidth="3.97642"
          strokeLinecap="round"
          strokeDasharray={`${animatedPct * 144.5} 144.5`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '26px 26px', transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <defs>
          <linearGradient id="activeGradient" x1="1.988" y1="20.2" x2="49.926" y2="20.2" gradientUnits="userSpaceOnUse">
            <stop stopColor="#18D000"/>
            <stop offset="1" stopColor="#0C6A00"/>
          </linearGradient>
        </defs>
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#D9D9D9',
        fontFamily: 'Inter, sans-serif',
      }}>
        {displayPct}%
      </div>
    </div>
  )
}

interface WeekTimelineProps {
  completedWeeks: number
  currentWeekPct: number
  totalCircles?: number
}

function WeekTimeline({ completedWeeks, currentWeekPct, totalCircles = 12 }: WeekTimelineProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        paddingBottom: 2,
      }}
      className="hide-scrollbar"
    >
      {Array.from({ length: totalCircles }).map((_, i) => {
        const isCompleted = i < completedWeeks
        const isCurrent = i === completedWeeks
        const distanceFromCurrent = i - completedWeeks

        if (isCompleted) {
          return <CompletedCircle key={i} />
        }

        if (isCurrent) {
          return currentWeekPct >= 1.0
            ? <CompletedCircle key={i} />
            : <ActiveWeekRing key={i} pct={currentWeekPct} />
        }

        return (
          <div key={i} style={{
            width: 35, height: 35, borderRadius: '50%', flexShrink: 0,
            border: '1.5px solid rgba(255,255,255,0.2)',
            opacity: getFutureOpacity(distanceFromCurrent),
          }} />
        )
      })}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GameCard({ game: externalGame, loading, debugWeekPct }: Props) {
  const game = externalGame || MOCK_GAME
  const isMock = !externalGame

  const [levelAnimated, setLevelAnimated] = useState(0)
  const [showBadgeDetail, setShowBadgeDetail] = useState<BadgeDefinition | null>(null)
  const animRef = useRef<number | null>(null)

  const liveWeekPct = Math.min(1, game.weekly.zone_minutes / game.weekly.target)
  const currentWeekPct = debugWeekPct != null ? debugWeekPct / 100 : liveWeekPct
  const minutesRemaining = Math.max(0, game.weekly.target - game.weekly.zone_minutes)
  const displayedStreak = game.streak.current + (currentWeekPct >= 1.0 ? 1 : 0)

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
      <div className="glass-card rounded-xl p-4 animate-pulse">
        <div className="h-2 bg-maf-glass rounded w-48 mb-4" />
        <div className="h-4 bg-maf-glass rounded w-full mb-3" />
        <div className="h-2 bg-maf-glass rounded w-32" />
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl overflow-visible" style={{ padding: '20px' }}>
      {isMock && (
        <div className="bg-maf-glass px-4 py-1.5 text-xs text-gray-600 text-center">
          Preview — complete setup to start tracking
        </div>
      )}

      <div className="space-y-4">
        {/* ─── Streak Timeline ─── */}
        <div style={{ background: '#18181b', borderRadius: 12, padding: '16px 16px 14px' }}>
          {/* Headline + callout */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            {game.streak.frozen ? (
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                Streak on Pause
              </h2>
            ) : displayedStreak > 0 ? (
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 800, color: '#ffffff', margin: 0 }}>
                🔥 {displayedStreak}-Week Streak!
              </h2>
            ) : (
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Start Your Streak!
              </h2>
            )}

            {currentWeekPct >= 1 ? (
              <span style={{ fontSize: 11, color: '#24ba11' }}>✓ Weekly target hit!</span>
            ) : minutesRemaining > 0 && (
              <span style={{ fontSize: 11, textAlign: 'right' }}>
                <span style={{ color: '#24ba11', fontWeight: 700 }}>{Math.round(currentWeekPct * 100)}%:</span>
                <span style={{ color: '#cfcfcf' }}> {Math.ceil(minutesRemaining)} min to go</span>
              </span>
            )}
          </div>

          {/* Week circles */}
          <WeekTimeline
            completedWeeks={game.streak.current}
            currentWeekPct={currentWeekPct}
            totalCircles={12}
          />

        </div>

        {/* ─── Level Progress ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-white">
              Level {game.level} · {game.level_name}
            </span>
            <span className="text-xs text-gray-600">
              {Math.round(game.level_progress_pct)}%
            </span>
          </div>
          <div className="h-2 bg-maf-glass rounded-full overflow-hidden">
            <div
              className="h-full rounded-full relative overflow-hidden"
              style={{ background: 'linear-gradient(90deg, #F84590, #EF6D11)', width: `${levelAnimated}%`, transition: 'none' }}
            >
              <div
                className="absolute inset-0 animate-level-stripes"
                style={{
                  backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.12) 3px, rgba(255,255,255,0.12) 6px)',
                  backgroundSize: '12px 12px',
                }}
              />
            </div>
          </div>
          {game.next_level_name && (
            <p className="text-[10px] text-gray-600">
              → {game.next_level_name}
            </p>
          )}
        </div>

        {/* ─── Trophy Case — wrapping grid with dock hover ─── */}
        <div className="space-y-1.5" style={{ overflow: 'visible' }}>
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">
            Badges · {game.badges_earned.length}/{BADGES.length}
          </p>
          {(() => {
            const allBadges = CATEGORY_ORDER.flatMap((cat) =>
              BADGES.filter((b) => b.category === cat)
            )
            const earnedSet = new Set(game.badges_earned)
            const earned = allBadges.filter((b) => earnedSet.has(b.id))
            const unearned = allBadges.filter((b) => !earnedSet.has(b.id))
            return (
              <BadgeDock
                badges={[...earned, ...unearned]}
                earnedSet={earnedSet}
                onSelect={setShowBadgeDetail}
              />
            )
          })()}
        </div>
      </div>

      {/* ─── Badge Detail Modal ─── */}
      <AnimatePresence>
        {showBadgeDetail && (() => {
          const earned = game.badges_earned.includes(showBadgeDetail.id)
          return (
            <div
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setShowBadgeDetail(null)}
            >
              <motion.div
                key={showBadgeDetail.id}
                initial={{ opacity: 0, scale: 0.85, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 4 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 25,
                  mass: 0.8,
                }}
                className="p-5 max-w-xs w-full space-y-3 text-center"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'linear-gradient(#0F0F13, #0F0F13) padding-box, linear-gradient(135deg, #F84590, #EF6D11) border-box',
                  border: '1px solid transparent',
                  borderRadius: '12px',
                  boxShadow: '0 0 40px rgba(248, 69, 144, 0.5), 0 0 80px rgba(239, 109, 17, 0.4)',
                }}
              >
                <span className={`text-8xl block ${earned ? '' : 'grayscale opacity-40'}`}>{showBadgeDetail.icon}</span>
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
              </motion.div>
            </div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
