import { useState } from 'react'
import { BASE_PATH } from '../config'

interface Props {
  athleteName?: string
  onComplete: () => void
}

const MODIFIERS = [
  { value: -10, label: 'Recovering from major illness or surgery' },
  { value: -5, label: 'Recovering from illness, or on medication' },
  { value: 0, label: 'Standard (healthy, training consistently)' },
  { value: 5, label: '2+ years consistent training, injury-free' },
]

export function OnboardingSetup({ athleteName, onComplete }: Props) {
  const [age, setAge] = useState<number | ''>('')
  const [modifier, setModifier] = useState(0)
  const [units, setUnits] = useState<'mi' | 'km'>('mi')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const mafHr = typeof age === 'number' ? 180 - age + modifier : null
  const firstName = athleteName?.split(' ')[0] || ''

  async function handleSubmit() {
    if (typeof age !== 'number' || age < 16 || age > 99) {
      setError('Please enter your age (16–99)')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, modifier, units }),
      })
      if (!res.ok) throw new Error('Failed to save')
      onComplete()
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        {/* Welcome */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{firstName ? `Welcome, ${firstName} 👋` : 'Welcome 👋'}</h1>
          <p className="text-gray-400 text-sm">
            Let's set up your MAF ceiling. This takes 10 seconds.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Age */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Age
            </label>
            <input
              type="number"
              min={16}
              max={99}
              autoFocus
              value={age}
              onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : '')}
              placeholder="Enter your age"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-green-500/50 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          {/* Modifier */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Modifier
            </label>
            <select
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value))}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500/50 transition-colors"
            >
              {MODIFIERS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.value > 0 ? `+${m.value}` : m.value} — {m.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-600 leading-snug">
              Most people should pick Standard. Only adjust if one of the other options clearly applies.
            </p>
          </div>

          {/* Units */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Units
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setUnits('mi')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  units === 'mi'
                    ? 'bg-green-500/15 border border-green-500/40 text-green-400'
                    : 'bg-gray-900 border border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                Miles
              </button>
              <button
                onClick={() => setUnits('km')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  units === 'km'
                    ? 'bg-green-500/15 border border-green-500/40 text-green-400'
                    : 'bg-gray-900 border border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                Kilometers
              </button>
            </div>
          </div>

        </div>

        {/* Divider + MAF ceiling display */}
        {mafHr !== null && (
          <div className="border-t border-gray-800 pt-6 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Your MAF ceiling
              </p>
              <p className="text-4xl font-bold text-green-400">
                {mafHr} <span className="text-lg font-normal text-gray-500">bpm</span>
              </p>
            </div>
            <p className="text-sm text-gray-400 text-center leading-relaxed">
              Everything at or below this heart rate builds your aerobic engine.
              <br />
              <span className="text-white font-medium">
                Just run. Keep it under {mafHr}. That's the whole method.
              </span>
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={saving || typeof age !== 'number'}
          className="w-full py-3.5 rounded-lg font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-500 hover:bg-green-400 text-gray-950"
        >
          {saving ? 'Setting up...' : 'Start Building 🔥'}
        </button>
      </div>
    </div>
  )
}
