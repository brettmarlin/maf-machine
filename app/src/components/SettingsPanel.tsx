import { useState } from 'react'
import type { Settings } from '../App'

const MODIFIERS = [
  { value: -10, label: '-10: Recovering from illness/surgery or on regular medication' },
  { value: -5, label: '-5: Injured, regressed, frequent colds, allergies, or just starting' },
  { value: 0, label: '0: Training consistently 4×/week for up to 2 years' },
  { value: 5, label: '+5: Training 2+ years with no issues and improving' },
]

interface Props {
  settings: Settings
  onSave: (s: Settings) => void
  onClose: () => void
}

export function SettingsPanel({ settings, onSave, onClose }: Props) {
  const [age, setAge] = useState(settings.age || 50)
  const [modifier, setModifier] = useState(settings.modifier ?? -5)
  const [units, setUnits] = useState<'km' | 'mi'>(settings.units || 'mi')
  const [startDate, setStartDate] = useState(settings.start_date || '')
  const [tolerance, setTolerance] = useState(settings.qualifying_tolerance ?? 10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mafHr = 180 - age + modifier

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age,
          modifier,
          units,
          start_date: startDate || null,
          qualifying_tolerance: tolerance,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      const data = await res.json()
      onSave(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
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
              <option key={m.value} value={m.value}>{m.label}</option>
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
                units === 'mi' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
            >
              Miles
            </button>
            <button
              type="button"
              onClick={() => setUnits('km')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                units === 'km' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
            >
              Kilometers
            </button>
          </div>
        </div>

        {/* Start Date */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">MAF Training Start Date</label>
          <p className="text-xs text-gray-500">Only runs after this date appear on your dashboard.</p>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Qualifying Tolerance */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Qualifying Tolerance: +{tolerance} bpm
          </label>
          <p className="text-xs text-gray-500">
            Widens the qualifying zone above MAF. Tighten as you improve.
          </p>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={tolerance}
            onChange={(e) => setTolerance(parseInt(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0 (strict)</span>
            <span>+20 bpm (wide)</span>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-800 rounded-lg p-4 text-center space-y-1">
          <p className="text-sm text-gray-400">MAF Heart Rate</p>
          <p className="text-2xl font-bold text-orange-500">{mafHr} bpm</p>
          <p className="text-sm text-gray-400">MAF Zone: {mafHr - 5} – {mafHr + 5} bpm</p>
          <p className="text-sm text-gray-500">Qualifying: {mafHr - 5} – {mafHr + 5 + tolerance} bpm</p>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Re-sync'}
          </button>
        </div>
      </div>
    </div>
  )
}
