import { LEVEL_TABLE } from '../lib/gameTypes'

interface Props {
  open: boolean
  onClose: () => void
}

export function RulesOfTheGame({ open, onClose }: Props) {
  if (!open) return null

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
          <Section title="Levels">
            <p className="text-gray-400">
              Every run below your MAF ceiling earns progress toward your next level.
              The more time you spend below your ceiling, the faster you advance.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {LEVEL_TABLE.map((l, i) => (
                <span
                  key={l.level}
                  className={`text-xs px-2 py-1 rounded-md border ${
                    i === 0
                      ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                      : 'bg-gray-800/60 border-gray-800 text-gray-500'
                  }`}
                >
                  {l.level}. {l.name}
                </span>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Early levels come quickly — because showing up IS the achievement.
              Later levels take longer, matching the real timeline of aerobic adaptation.
            </p>
          </Section>

          {/* Badges */}
          <Section title="Badges">
            <p className="text-gray-400">
              Badges mark specific achievements — your first run, your first 20-minute zone lock,
              your first improving MAF Test. They live in your trophy case permanently.
            </p>
            <p className="text-gray-500 text-xs mt-1.5">
              You don't see all the badges upfront. They reveal themselves as you get close to earning them.
              Some are easy (just show up). Some take months of consistent work.
            </p>
          </Section>

          {/* Streaks */}
          <Section title="Streaks">
            <p className="text-gray-400">
              A streak counts consecutive weeks where you hit your below-ceiling minutes target.
              Your default target is 90 minutes per week — about 3 easy runs.
            </p>
            <p className="text-gray-400 mt-1.5">
              Streaks reward the thing that actually builds aerobic fitness: consistency over time.
              A long streak means your fire is burning strong.
            </p>
            <p className="text-gray-500 text-xs mt-1.5">
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

          {/* MAF Test */}
          <Section title="The MAF Test">
            <p className="text-gray-400">
              Run 3–5 miles at your MAF ceiling heart rate on a flat course and record your per-mile pace.
              Repeat every 4 weeks. Over months, your pace at the same heart rate gets faster —
              and that's the proof that the method is working.
            </p>
          </Section>

          {/* Why it feels slow */}
          <Section title="Why it feels slow">
            <p className="text-gray-400">
              MAF training feels like losing for the first few months. You're running slower than you want.
              But underneath, your aerobic system is rebuilding itself — capillary density, fat oxidation,
              cardiac efficiency. These changes are invisible day to day.
            </p>
            <p className="text-gray-400 mt-1.5">
              MAF Machine makes the invisible visible. We show you the cardiac drift improving,
              the efficiency climbing, the pace trend bending downward.
              Every run is adding a log to the fire. Trust the process.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">{title}</h3>
      {children}
    </div>
  )
}
