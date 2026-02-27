import { useState, useEffect } from 'react'
import { BASE_PATH } from '../config'
import { computeMAFTiers } from '../lib/mafAnalysis'

interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  start_date?: string | null
  // Legacy fields (may still arrive from KV)
  maf_zone_low?: number
  maf_zone_high?: number
  qualifying_tolerance?: number
}

const MODIFIERS = [
  { value: -10, label: '-10: Recovering from illness/surgery or on medication' },
  { value: -5, label: '-5: Injured, regressed, frequent colds, or just starting' },
  { value: 0, label: '0: Training consistently 4×/week for up to 2 years' },
  { value: 5, label: '+5: Training 2+ years with no issues and improving' },
]

export function SettingsModal({
  onClose,
  currentSettings,
}: {
  onClose: (updated: Settings | null) => void
  currentSettings?: Settings
}) {
  const [age, setAge] = useState<number>(currentSettings?.age ?? 35)
  const [modifier, setModifier] = useState<number>(currentSettings?.modifier ?? 0)
  const [units, setUnits] = useState<'km' | 'mi'>(currentSettings?.units ?? 'mi')
  const [startDate, setStartDate] = useState<string>(currentSettings?.start_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mafHr = 180 - age + modifier
  const tiers = computeMAFTiers(mafHr)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSave()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [age, modifier, units, startDate])

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age,
          modifier,
          units,
          start_date: startDate || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save settings')
      }

      const data = await res.json()
      onClose(data)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleSave}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">My MAF Settings</h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Age */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">Age</label>
            <input
              type="number"
              min={10}
              max={100}
              value={age}
              onChange={(e) => setAge(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Modifier */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">Training Status</label>
            <select
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {MODIFIERS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Units */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">Units</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUnits('mi')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  units === 'km'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}
              >
                Kilometers
              </button>
            </div>
          </div>

          {/* Training Start Date */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">MAF Training Start Date</label>
            <p className="text-xs text-gray-500">
              When did you begin MAF training? Runs before this date are ignored.
            </p>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
            />
            {startDate && (
              <button
                type="button"
                onClick={() => setStartDate('')}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear start date
              </button>
            )}
          </div>

          {/* MAF HR Preview — Ceiling Model */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-sm text-gray-400">Your MAF Ceiling</p>
              <p className="text-2xl font-bold text-orange-500">{mafHr} bpm</p>
              <p className="text-xs text-gray-500">Do not exceed — everything below is good</p>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Controlled
                </span>
                <span className="text-gray-400">{tiers.controlled_low}–{tiers.controlled_high} bpm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Easy
                </span>
                <span className="text-gray-400">{tiers.easy_low}–{tiers.easy_high} bpm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                  Recovery
                </span>
                <span className="text-gray-400">below {tiers.recovery_below} bpm</span>
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {saving ? 'Saving...' : 'Save & Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
