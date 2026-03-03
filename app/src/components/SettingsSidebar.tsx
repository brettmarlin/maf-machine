import { useState, useEffect, useRef } from 'react'
import { BASE_PATH } from '../config'
import { computeMAFTiers } from '../lib/mafAnalysis'

interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  start_date?: string | null
  athlete_name?: string
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

interface Props {
  open: boolean
  onClose: (updated: Settings | null) => void
  currentSettings?: Settings
  athleteName?: string
  onSync?: () => void
}

export function SettingsSidebar({ open, onClose, currentSettings, athleteName, onSync }: Props) {
  const [name, setName] = useState<string>(currentSettings?.athlete_name || athleteName || '')
  const [age, setAge] = useState<number>(currentSettings?.age ?? 35)
  const [modifier, setModifier] = useState<number>(currentSettings?.modifier ?? 0)
  const [units, setUnits] = useState<'km' | 'mi'>(currentSettings?.units ?? 'mi')
  const [startDate, setStartDate] = useState<string>(currentSettings?.start_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const mafHr = 180 - age + modifier
  const tiers = computeMAFTiers(mafHr)

  // Sync state from props when settings change externally
  useEffect(() => {
    if (currentSettings) {
      setName(currentSettings.athlete_name || athleteName || '')
      setAge(currentSettings.age ?? 35)
      setModifier(currentSettings.modifier ?? 0)
      setUnits(currentSettings.units ?? 'mi')
      setStartDate(currentSettings.start_date ?? '')
    }
  }, [currentSettings])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Trap focus inside sidebar when open
  useEffect(() => {
    if (open && sidebarRef.current) {
      sidebarRef.current.focus()
    }
  }, [open])

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
          athlete_name: name || undefined,
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
    } finally {
      setSaving(false)
    }
  }

  function handleDisconnect() {
    setDisconnecting(true)
    window.location.href = `${BASE_PATH}/api/auth/logout`
  }

  return (
    <>
      {/* Overlay — dims main content */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => onClose(null)}
      />

      {/* Sidebar — slides from right */}
      <div
        ref={sidebarRef}
        tabIndex={-1}
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-gray-900 border-l border-gray-800 shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto outline-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <button
              onClick={() => onClose(null)}
              className="text-gray-400 hover:text-white transition-colors p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close settings"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* 1. Name (from Strava profile, editable) */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500 uppercase tracking-wide">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50"
            />
          </div>

          {/* 2. Age */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500 uppercase tracking-wide">Age</label>
            <input
              type="number"
              min={10}
              max={100}
              value={age}
              onChange={(e) => setAge(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50"
            />
          </div>

          {/* 3. Training Status */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500 uppercase tracking-wide">Training Status</label>
            <select
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50"
            >
              {MODIFIERS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* 4. MAF Training Start Date */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500 uppercase tracking-wide">MAF Training Start Date</label>
            <p className="text-xs text-gray-600 -mt-0.5">
              Runs before this date are ignored.
            </p>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 [color-scheme:dark]"
            />
            {startDate && (
              <button
                type="button"
                onClick={() => setStartDate('')}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Clear start date
              </button>
            )}
          </div>

          {/* 5. MAF Ceiling Display */}
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Your MAF Ceiling</p>
              <p className="text-3xl font-bold text-orange-500">{mafHr} <span className="text-lg font-normal">bpm</span></p>
              <p className="text-xs text-gray-600">Do not exceed — everything below is good</p>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500/70" />
                  <span className="text-gray-400">Controlled</span>
                </span>
                <span className="text-gray-500 font-mono">{tiers.controlled_low}–{tiers.controlled_high} bpm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500/70" />
                  <span className="text-gray-400">Easy</span>
                </span>
                <span className="text-gray-500 font-mono">{tiers.easy_low}–{tiers.easy_high} bpm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-500/70" />
                  <span className="text-gray-400">Recovery</span>
                </span>
                <span className="text-gray-500 font-mono">below {tiers.recovery_below} bpm</span>
              </div>
            </div>
          </div>

          {/* 6. Units */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500 uppercase tracking-wide">Units</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUnits('mi')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  units === 'mi'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                Miles
              </button>
              <button
                type="button"
                onClick={() => setUnits('km')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  units === 'km'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                Kilometers
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-800" />

          {/* Sync button */}
          <button
            onClick={() => { if (onSync) onSync(); handleSave() }}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            <span>↻</span> Sync with Strava
          </button>

          {/* Save & Close */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors text-sm"
          >
            {saving ? 'Saving...' : 'Save & Close'}
          </button>

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          {/* Disconnect — bottom, subtle */}
          <div className="pt-2">
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full text-xs text-gray-600 hover:text-red-400 transition-colors py-2"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect Strava'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
