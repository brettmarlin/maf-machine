import { useState } from 'react'

interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  maf_zone_low?: number
  maf_zone_high?: number
}

const MODIFIERS = [
  { value: -10, label: '-10: Recovering from illness/surgery or on regular medication' },
  { value: -5, label: '-5: Injured, regressed, frequent colds, allergies, or just starting' },
  { value: 0, label: '0: Training consistently 4×/week for up to 2 years' },
  { value: 5, label: '+5: Training 2+ years with no issues and improving' },
]

export function Onboarding({ onComplete }: { onComplete: (s: Settings) => void }) {
  const [age, setAge] = useState<number>(30)
  const [modifier, setModifier] = useState<number>(0)
  const [units, setUnits] = useState<'km' | 'mi'>('mi')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mafHr = 180 - age + modifier

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, modifier, units }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save settings')
      }

      const data = await res.json()
      onComplete(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Set Up Your Profile</h1>
          <p className="text-gray-400">We need a few details to calculate your MAF heart rate zone.</p>
        </div>

        {/* Age */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Age</label>
          <input
            type="number"
            min={10}
            max={100}
            value={age}
            onChange={(e) => setAge(parseInt(e.target.value) || 0)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Modifier */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Training Status</label>
          <select
            value={modifier}
            onChange={(e) => setModifier(parseInt(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {MODIFIERS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Units */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Preferred Units</label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setUnits('mi')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                units === 'mi'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
            >
              Miles
            </button>
            <button
              type="button"
              onClick={() => setUnits('km')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                units === 'km'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
            >
              Kilometers
            </button>
          </div>
        </div>

        {/* MAF HR Preview */}
        <div className="bg-gray-800 rounded-lg p-4 text-center space-y-1">
          <p className="text-sm text-gray-400">Your MAF Heart Rate</p>
          <p className="text-3xl font-bold text-orange-500">{mafHr} bpm</p>
          <p className="text-sm text-gray-400">Zone: {mafHr - 5} – {mafHr + 5} bpm</p>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save & Start Syncing'}
        </button>
      </form>
    </div>
  )
}
