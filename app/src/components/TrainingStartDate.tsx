import { useState } from 'react'
import { BASE_PATH } from '../config'

interface Props {
  onComplete: (isToday: boolean) => void
}

export function TrainingStartDate({ onComplete }: Props) {
  const [mode, setMode] = useState<'today' | 'date' | 'future'>('today')
  const [date, setDate] = useState('')
  const [futureDate, setFutureDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrowStr = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })()

  async function handleSubmit() {
    const skipBackfill = mode === 'today' || mode === 'future'
    const startDate = mode === 'today' ? todayStr : mode === 'future' ? futureDate : date

    if (mode === 'date' && !date) {
      setError('Please pick a date')
      return
    }
    if (mode === 'future' && !futureDate) {
      setError('Please pick a future date')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ training_start_date: startDate }),
      })
      if (!res.ok) throw new Error('Failed to save')
      onComplete(skipBackfill)
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            When did you start MAF training?
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            If you've been doing MAF runs, we'll analyze your history and you might already be a few levels in.
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Date picker option */}
          <button
            onClick={() => setMode('date')}
            className={`w-full text-left rounded-lg p-4 transition-colors border ${
              mode === 'date'
                ? 'bg-green-500/10 border-green-500/40'
                : 'bg-gray-900 border-gray-800 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                mode === 'date' ? 'border-green-500' : 'border-gray-600'
              }`}>
                {mode === 'date' && <div className="w-2 h-2 rounded-full bg-green-500" />}
              </div>
              <span className="text-sm text-white font-medium">I started on a specific date</span>
            </div>
            {mode === 'date' && (
              <div className="mt-3 ml-7">
                <input
                  type="date"
                  max={todayStr}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50 transition-colors"
                />
                {date && (
                  <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                    We'll look at your runs since {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. You might be surprised.
                  </p>
                )}
              </div>
            )}
          </button>

          {/* Just getting started option */}
          <button
            onClick={() => setMode('today')}
            className={`w-full text-left rounded-lg p-4 transition-colors border ${
              mode === 'today'
                ? 'bg-green-500/10 border-green-500/40'
                : 'bg-gray-900 border-gray-800 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                mode === 'today' ? 'border-green-500' : 'border-gray-600'
              }`}>
                {mode === 'today' && <div className="w-2 h-2 rounded-full bg-green-500" />}
              </div>
              <div>
                <span className="text-sm text-white font-medium">I'm just getting started</span>
                <p className="text-[11px] text-gray-500 mt-0.5">That's great — we'll track from today</p>
              </div>
            </div>
          </button>

          {/* Future date option */}
          <button
            onClick={() => setMode('future')}
            className={`w-full text-left rounded-lg p-4 transition-colors border ${
              mode === 'future'
                ? 'bg-green-500/10 border-green-500/40'
                : 'bg-gray-900 border-gray-800 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                mode === 'future' ? 'border-green-500' : 'border-gray-600'
              }`}>
                {mode === 'future' && <div className="w-2 h-2 rounded-full bg-green-500" />}
              </div>
              <span className="text-sm text-white font-medium">I'm starting on a future date</span>
            </div>
            {mode === 'future' && (
              <div className="mt-3 ml-7">
                <input
                  type="date"
                  min={tomorrowStr}
                  value={futureDate}
                  onChange={(e) => setFutureDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50 transition-colors"
                />
                {futureDate && (
                  <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                    We'll be ready when you are.
                  </p>
                )}
              </div>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={saving || (mode === 'date' && !date) || (mode === 'future' && !futureDate)}
          className="w-full py-3.5 rounded-lg font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-500 hover:bg-green-400 text-gray-950"
        >
          {saving ? 'Saving...' : "Let's Go"}
        </button>
      </div>
    </div>
  )
}
