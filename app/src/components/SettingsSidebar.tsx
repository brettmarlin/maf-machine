import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { BASE_PATH } from '../config'
import { computeMAFTiers } from '../lib/mafAnalysis'

interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  start_date?: string | null
  training_start_date?: string | null
  athlete_name?: string
  display_name?: string
  avatar_url?: string
  firstname?: string
  lastname?: string
  profile?: string
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
  devMode?: boolean
  debugWeekPct?: number | null
  onDebugWeekPctChange?: (val: number | null) => void
  liveWeekPct?: number
}

export function SettingsSidebar({ open, onClose, currentSettings, athleteName, onSync, devMode, debugWeekPct, onDebugWeekPctChange, liveWeekPct = 0 }: Props) {
  const [name, setName] = useState<string>(
    currentSettings?.athlete_name || athleteName ||
    [currentSettings?.firstname, currentSettings?.lastname].filter(Boolean).join(' ') || ''
  )
  const [age, setAge] = useState<number>(currentSettings?.age ?? 35)
  const [modifier, setModifier] = useState<number>(currentSettings?.modifier ?? 0)
  const [units, setUnits] = useState<'km' | 'mi'>(currentSettings?.units ?? 'mi')
  const [startDate, setStartDate] = useState<string>(currentSettings?.training_start_date || currentSettings?.start_date || '')
  const [email, setEmail] = useState<string>((currentSettings as any)?.email || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [pendingStartDate, setPendingStartDate] = useState<string | null>(null)
  const [originalStartDate, setOriginalStartDate] = useState<string>(currentSettings?.training_start_date || currentSettings?.start_date || '')
  const [gameProgress, setGameProgress] = useState<{ badges: number; streak: number; runs: number } | null>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const mafHr = 180 - age + modifier
  const tiers = computeMAFTiers(mafHr)

  // Re-fetch settings + game state when sidebar opens
  useEffect(() => {
    if (!open) return
    fetch(`${BASE_PATH}/api/settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) {
          setName(data.athlete_name || athleteName || '')
          setAge(data.age ?? 35)
          setModifier(data.modifier ?? 0)
          setUnits(data.units ?? 'mi')
          const sd = data.training_start_date || data.start_date || ''
          setStartDate(sd)
          setOriginalStartDate(sd)
          setEmail(data.email || '')
        }
      })
      .catch(() => {})
    fetch(`${BASE_PATH}/api/game`)
      .then((r) => r.json())
      .then((data) => {
        setGameProgress({
          badges: (data.badges_earned || []).length,
          streak: data.streak?.current_weeks ?? 0,
          runs: data.lifetime_qualifying_runs ?? 0,
        })
      })
      .catch(() => {})
  }, [open])

  // Sync state from props when settings change externally
  useEffect(() => {
    if (currentSettings) {
      setName(currentSettings.athlete_name || athleteName || '')
      setAge(currentSettings.age ?? 35)
      setModifier(currentSettings.modifier ?? 0)
      setUnits(currentSettings.units ?? 'mi')
      setStartDate(currentSettings.training_start_date || currentSettings.start_date || '')
      setEmail((currentSettings as any)?.email || '')
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

  function handleStartDateChange(newDate: string) {
    const hasProgress = gameProgress && (
      gameProgress.badges > 1 ||
      gameProgress.streak > 0 ||
      gameProgress.runs > 0
    )
    if (hasProgress && originalStartDate && newDate !== originalStartDate) {
      setPendingStartDate(newDate)
      setShowResetConfirm(true)
    } else {
      setStartDate(newDate)
    }
  }

  function confirmDateReset() {
    if (pendingStartDate !== null) {
      setStartDate(pendingStartDate)
    }
    setShowResetConfirm(false)
    setPendingStartDate(null)
  }

  function cancelDateReset() {
    setShowResetConfirm(false)
    setPendingStartDate(null)
  }

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
          training_start_date: startDate || null,
          athlete_name: name || undefined,
          email: email || undefined,
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

  // ─── Debug handlers (dev builds only) ────────────────────────────────────────

  const [settingStage, setSettingStage] = useState<string | null>(null)

  async function handleSetStage(stage: string) {
    setSettingStage(stage)
    try {
      await fetch(`${BASE_PATH}/api/debug/set-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      localStorage.removeItem('maf_seen_badges')
      window.location.reload()
    } catch (err) {
      console.error('Set stage failed:', err)
      setSettingStage(null)
    }
  }

  async function handleRebadge() {
    setSettingStage('rebadge')
    try {
      await fetch(`${BASE_PATH}/api/debug/rebadge`, { method: 'POST' })
      localStorage.removeItem('maf_seen_badges')
      window.location.reload()
    } catch (err) {
      console.error('Rebadge failed:', err)
      setSettingStage(null)
    }
  }

  async function handleResetOnboarding() {
    setSettingStage('reset')
    try {
      await fetch(`${BASE_PATH}/api/debug/reset-onboarding`, { method: 'DELETE' })
      localStorage.removeItem('maf_seen_badges')
      localStorage.removeItem('maf_activities')
      localStorage.removeItem('maf_excluded')
      window.location.reload()
    } catch (err) {
      console.error('Reset failed:', err)
      setSettingStage(null)
    }
  }

  function handleTestConfetti() {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.5, y: 0.45 },
      colors: ['#22c55e', '#4ade80', '#ffffff', '#86efac'],
      gravity: 0.8,
      ticks: 150,
    })
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
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm glass-card !rounded-none !border-l !border-t-0 !border-b-0 !border-r-0 border-maf-subtle shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto outline-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 space-y-6">
          {/* Header with avatar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(currentSettings?.profile || currentSettings?.avatar_url) ? (
                <img
                  src={currentSettings.profile || currentSettings.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-sm shrink-0">
                  {(currentSettings?.firstname || name || '?')[0]?.toUpperCase()}
                </span>
              )}
              <h2 className="text-lg font-semibold text-white">Settings</h2>
            </div>
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
            <label className="block text-xs text-gray-500/70 font-semibold uppercase tracking-widest">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className="w-full bg-maf-input border border-maf-subtle rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-maf-orange/50 focus:border-maf-orange/50"
            />
          </div>

          {/* 2. Age */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500/70 font-semibold uppercase tracking-widest">Age</label>
            <input
              type="number"
              min={10}
              max={100}
              value={age}
              onChange={(e) => setAge(parseInt(e.target.value) || 0)}
              className="w-full bg-maf-input border border-maf-subtle rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-maf-orange/50 focus:border-maf-orange/50"
            />
          </div>

          {/* 3. Training Status */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500/70 font-semibold uppercase tracking-widest">Training Status</label>
            <select
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value))}
              className="w-full bg-maf-input border border-maf-subtle rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-maf-orange/50 focus:border-maf-orange/50"
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
            <label className="block text-xs text-gray-500/70 font-semibold uppercase tracking-widest">MAF Training Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="w-full bg-maf-input border border-maf-subtle rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-maf-orange/50 focus:border-maf-orange/50 [color-scheme:dark]"
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
          <div className="bg-maf-glass border border-maf-subtle rounded-xl p-4 space-y-3">
            <div className="text-center space-y-1">
              <p className="text-xs text-gray-500/70 font-semibold uppercase tracking-widest">Your MAF Ceiling</p>
              <p className="text-3xl font-bold text-maf-orange">{mafHr} <span className="text-lg font-normal">bpm</span></p>
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
            <label className="block text-xs text-gray-500/70 font-semibold uppercase tracking-widest">Units</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUnits('mi')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  units === 'mi'
                    ? 'bg-maf-strava text-white'
                    : 'bg-maf-input text-gray-400 border border-maf-subtle hover:border-maf-medium'
                }`}
              >
                Miles
              </button>
              <button
                type="button"
                onClick={() => setUnits('km')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  units === 'km'
                    ? 'bg-maf-strava text-white'
                    : 'bg-maf-input text-gray-400 border border-maf-subtle hover:border-maf-medium'
                }`}
              >
                Kilometers
              </button>
            </div>
          </div>

          {/* 7. Email */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500/70 font-semibold uppercase tracking-widest">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-maf-input border border-maf-subtle rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-maf-orange/50 focus:border-maf-orange/50"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-maf-subtle" />

          {/* Sync button */}
          <button
            onClick={() => { if (onSync) onSync(); handleSave() }}
            className="w-full bg-maf-glass hover:bg-maf-glass-hover text-gray-300 font-medium py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2 border border-maf-subtle"
          >
            <span>↻</span> Sync with Strava
          </button>

          {/* Save & Close */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-maf-strava hover:bg-maf-strava-hover disabled:opacity-50 text-white font-semibold py-3 rounded-full transition-colors text-sm"
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

          {/* Debug Tools — only in local dev builds */}
          {import.meta.env.DEV && devMode && (
            <>
              <div className="border-t border-maf-subtle" />
              <div className="space-y-3">
                <p className="text-xs text-yellow-500/70 uppercase tracking-wide font-semibold">Debug Tools</p>

                {/* Stage buttons */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-600">Jump to stage:</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['new', 'week1', 'week2', 'month1', 'month3', 'veteran'] as const).map((stage) => (
                      <button
                        key={stage}
                        onClick={() => handleSetStage(stage)}
                        disabled={settingStage !== null}
                        className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs py-2 px-2 rounded-lg transition-colors capitalize"
                      >
                        {settingStage === stage ? '...' : stage}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="space-y-1.5">
                  <button
                    onClick={handleRebadge}
                    disabled={settingStage !== null}
                    className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs py-2 rounded-lg transition-colors"
                  >
                    {settingStage === 'rebadge' ? 'Re-badging...' : 'Re-badge'}
                  </button>
                  <button
                    onClick={handleResetOnboarding}
                    disabled={settingStage !== null}
                    className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs py-2 rounded-lg transition-colors"
                  >
                    {settingStage === 'reset' ? 'Resetting...' : 'Reset Onboarding'}
                  </button>
                  <button
                    onClick={handleTestConfetti}
                    className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-2 rounded-lg transition-colors"
                  >
                    Test Confetti
                  </button>
                </div>

                {/* Streak week progress override */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-600">Week progress override:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={0} max={100} step={1}
                      value={debugWeekPct ?? Math.round(liveWeekPct * 100)}
                      onChange={e => onDebugWeekPctChange?.(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-10 text-right">
                      {debugWeekPct ?? 'live'}%
                    </span>
                  </div>
                  {debugWeekPct != null && (
                    <button
                      onClick={() => onDebugWeekPctChange?.(null)}
                      className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded-lg transition-colors"
                    >
                      Reset to live
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-maf-dark border border-maf-subtle rounded-xl p-6 max-w-sm mx-4 space-y-4 shadow-2xl">
            <p className="text-white text-sm leading-relaxed">
              Changing your start date will reset your streaks, badges, and level progress. Your Strava data won't be affected. Are you sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelDateReset}
                className="flex-1 bg-maf-glass hover:bg-maf-glass-hover text-gray-300 text-sm py-2.5 rounded-xl transition-colors border border-maf-subtle"
              >
                Cancel
              </button>
              <button
                onClick={confirmDateReset}
                className="flex-1 bg-maf-strava hover:bg-maf-strava-hover text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Reset & Recalculate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
