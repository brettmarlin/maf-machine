import { LEVEL_TABLE, BADGES } from '../lib/gameTypes'

const LEVEL_EMOJIS = ['🔥', '👟', '🤝', '🕯️', '🏗️', '💚', '📈', '🦁', '🐺', '👑']

const SAMPLE_BADGES = ['committed', 'first_spark', 'took_initiative', 'dialed_in', 'full_week', 'two_week_fire', 'seedling', 'zone_locked']

interface Props {
  open: boolean
  onClose: () => void
  currentLevel?: number
}

export function RulesOfTheGame({ open, onClose, currentLevel }: Props) {
  if (!open) return null

  const sampleBadgeDefs = SAMPLE_BADGES
    .map((id) => BADGES.find((b) => b.id === id))
    .filter(Boolean)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-xl max-w-lg w-full mx-4 my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-white">How MAF Machine Works</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-6 text-sm leading-relaxed">
          {/* Intro */}
          <div className="space-y-2">
            <p className="text-lg font-medium text-orange-400">You're building a fire.</p>
            <p className="text-gray-300">
              MAF training is about building your aerobic engine — slowly, patiently, one run at a time.
              MAF Machine tracks your progress, celebrates your consistency, and shows you the improvements
              your body can't feel yet.
            </p>
          </div>

          {/* Levels */}
          <Section title="Levels" placeholder="🔥">
            <p className="text-gray-400">
              Every run below your MAF ceiling earns progress toward your next level.
              The more time you spend below your ceiling, the faster you advance.
            </p>
            <div className="mt-3 space-y-1">
              {LEVEL_TABLE.map((l, i) => {
                const isCurrent = currentLevel === l.level
                return (
                  <div
                    key={l.level}
                    className={`flex items-center gap-2.5 py-1 px-2 rounded-md text-xs ${
                      isCurrent
                        ? 'bg-green-500/10 border border-green-500/30'
                        : ''
                    }`}
                  >
                    <span className="w-5 text-center text-gray-600 font-mono">{l.level}.</span>
                    <span className="text-base leading-none">{LEVEL_EMOJIS[i] || '⭐'}</span>
                    <span className={isCurrent ? 'text-green-400 font-medium' : 'text-gray-400'}>{l.name}</span>
                    {isCurrent && <span className="text-[10px] text-green-500/70 ml-auto">You are here</span>}
                  </div>
                )
              })}
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Early levels come quickly — because showing up IS the achievement.
              Later levels take longer, matching the real timeline of aerobic adaptation.
            </p>
          </Section>

          {/* Badges */}
          <Section title="Badges" placeholder="🏆">
            <p className="text-gray-400">
              Badges mark specific achievements — your first run, your first 20-minute zone lock,
              your first improving MAF Test. They live in your trophy case permanently.
            </p>
            <div className="flex gap-2 mt-3">
              {sampleBadgeDefs.map((badge, i) => (
                <span
                  key={badge!.id}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-base ${
                    i < 4
                      ? 'bg-gray-800/60 border border-green-500/20'
                      : 'opacity-25 grayscale'
                  }`}
                  title={badge!.name}
                >
                  {badge!.icon}
                </span>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-1.5">
              You don't see all the badges upfront. They reveal themselves as you get close to earning them.
            </p>
          </Section>

          {/* Streaks */}
          <Section title="Streaks" placeholder="📅">
            <p className="text-gray-400">
              A streak counts consecutive weeks where you hit your below-ceiling minutes target.
              Your default target is 90 minutes per week — about 3 easy runs.
            </p>
            {/* Example streak visualization */}
            <div className="flex items-end gap-1 mt-3">
              {[
                { filled: true, check: true, label: 'W1' },
                { filled: true, check: true, badge: '🔥', label: 'W2' },
                { filled: true, check: true, label: 'W3' },
                { filled: false, partial: 60, label: 'W4' },
                { filled: false, partial: 0, label: 'W5' },
              ].map((w, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  {w.badge ? (
                    <span className="text-[10px]">{w.badge}</span>
                  ) : (
                    <span className="text-[10px] invisible">·</span>
                  )}
                  <div className={`w-8 h-6 rounded-sm overflow-hidden relative ${
                    w.filled ? 'bg-green-500/70' : 'bg-gray-800/60 border border-gray-700/50'
                  }`}>
                    {w.partial !== undefined && w.partial > 0 && !w.filled && (
                      <div className="absolute inset-y-0 left-0 bg-green-500/50" style={{ width: `${w.partial}%` }} />
                    )}
                    {w.check && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white/60">✓</span>
                    )}
                  </div>
                  <span className="text-[9px] text-gray-600">{w.label}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Miss your target but still ran? Your streak pauses — it doesn't break.
              Miss a week entirely? It resets. But every streak you build makes you stronger.
            </p>
          </Section>

          {/* Next Step */}
          <Section title="Your Next Step">
            <p className="text-gray-400">
              MAF Machine always shows you one thing: the most important next step.
              It might be "run tomorrow to protect your streak" or "one more run to earn a badge."
              You never have to wonder what to do — just follow the prompt.
            </p>
          </Section>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, placeholder }: { title: string; children: React.ReactNode; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      {placeholder && (
        <div className="w-full h-14 rounded-lg border border-gray-800/60 bg-gray-800/20 flex items-center justify-center">
          <span className="text-2xl">{placeholder}</span>
        </div>
      )}
      <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">{title}</h3>
      {children}
    </div>
  )
}
