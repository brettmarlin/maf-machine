import { useState, useEffect, useCallback } from 'react'
import { LandingPage } from './components/LandingPage'
import { OnboardingSetup } from './components/OnboardingSetup'
import { BadgeCelebration } from './components/BadgeCelebration'
import { TrainingStartDate } from './components/TrainingStartDate'
import { BackfillProgress } from './components/BackfillProgress'
import { Dashboard } from './components/Dashboard'
import { BADGES } from './lib/gameTypes'
import { BASE_PATH } from './config'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  maf_zone_low?: number
  maf_zone_high?: number
  qualifying_tolerance?: number
  start_date?: string | null
  athlete_name?: string
  training_start_date?: string | null
  display_name?: string
  avatar_url?: string
}

interface GameSummary {
  backfill_complete: boolean
  level: number
  level_name: string
  level_progress_pct: number
  next_level_name: string | null
  badges_earned: string[]
}

export type AppState = 'landing' | 'setup' | 'setup_celebration' | 'start_date' | 'backfill' | 'dashboard'

const DEFAULT_SETTINGS: Settings = {
  configured: false,
}

// ─── State Detection ─────────────────────────────────────────────────────────

function getAppState(
  authenticated: boolean,
  settings: Settings | null,
  gameSummary: GameSummary | null,
): AppState {
  if (!authenticated) return 'landing'
  if (!settings?.age) return 'setup'

  // Step 8 bypass: existing users who have settings.age → treat as onboarded
  // If they lack training_start_date, they'll see a subtle prompt in the dashboard,
  // NOT a full-screen gate. The start_date screen is only shown during fresh onboarding
  // (via forceState after setup celebration).
  const backfillDone = gameSummary?.backfill_complete ?? true
  if (!backfillDone && settings?.training_start_date) return 'backfill'

  return 'dashboard'
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [auth, setAuth] = useState<{ authenticated: boolean; athleteId?: string } | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [forceState, setForceState] = useState<AppState | null>(null)

  async function refreshGameState() {
    try {
      const res = await fetch(`${BASE_PATH}/api/game`)
      if (res.ok) {
        const data = await res.json()
        setGameSummary({
          backfill_complete: data.backfill_complete ?? true,
          level: data.level,
          level_name: data.level_name,
          level_progress_pct: data.level_progress_pct ?? 0,
          next_level_name: data.next_level_name ?? null,
          badges_earned: data.badges_earned || [],
        })
        return data
      }
    } catch {}
    return null
  }

  async function refreshSettings() {
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`)
      const data = await res.json()
      setSettings(data)
      return data
    } catch {}
    return null
  }

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`${BASE_PATH}/api/auth/me`)
        const data = await res.json()
        setAuth(data)

        if (data.authenticated) {
          // Fetch settings + game state in parallel
          const [settingsRes, gameRes] = await Promise.all([
            fetch(`${BASE_PATH}/api/settings`),
            fetch(`${BASE_PATH}/api/game`),
          ])
          const settingsData = await settingsRes.json()
          setSettings(settingsData)
          if (gameRes.ok) {
            const gameData = await gameRes.json()
            setGameSummary({
              backfill_complete: gameData.backfill_complete ?? true,
              level: gameData.level,
              level_name: gameData.level_name,
              level_progress_pct: gameData.level_progress_pct ?? 0,
              next_level_name: gameData.next_level_name ?? null,
              badges_earned: gameData.badges_earned || [],
            })
          }
        }
      } catch {
        setAuth({ authenticated: false })
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Callback: setup complete → show badge celebration
  const handleSetupComplete = useCallback(async () => {
    await Promise.all([refreshSettings(), refreshGameState()])
    setForceState('setup_celebration')
  }, [])

  // Callback: celebration dismissed → advance to start_date
  const handleCelebrationDone = useCallback(() => {
    setForceState('start_date')
  }, [])

  // Callback: start date complete → advance to backfill or dashboard
  const handleStartDateComplete = useCallback(async (isToday: boolean) => {
    await refreshSettings()
    if (isToday) {
      // Mark backfill as done and go to dashboard
      await refreshGameState()
      setForceState('dashboard')
    } else {
      setForceState('backfill')
    }
  }, [])

  // Callback: backfill complete → advance to dashboard
  const handleBackfillComplete = useCallback(async () => {
    await refreshGameState()
    setForceState('dashboard')
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  const appState = forceState || getAppState(
    auth?.authenticated ?? false,
    settings,
    gameSummary,
  )

  // Landing — not authenticated
  if (appState === 'landing') {
    return <LandingPage />
  }

  // Setup — authenticated but no settings (age)
  if (appState === 'setup') {
    return (
      <OnboardingSetup
        athleteName={settings.athlete_name}
        onComplete={handleSetupComplete}
      />
    )
  }

  // Badge celebration after setup
  if (appState === 'setup_celebration') {
    const committedBadge = BADGES.find((b) => b.id === 'committed')
    if (committedBadge && gameSummary) {
      return (
        <BadgeCelebration
          badge={committedBadge}
          onDismiss={handleCelebrationDone}
          autoDismiss={false}
          level={{
            level: gameSummary.level,
            name: gameSummary.level_name,
            progress: gameSummary.level_progress_pct,
            nextName: gameSummary.next_level_name ?? undefined,
          }}
        />
      )
    }
    // Fallback: no badge found, skip celebration
    handleCelebrationDone()
    return null
  }

  // Start date — settings saved, no training_start_date
  if (appState === 'start_date') {
    return <TrainingStartDate onComplete={handleStartDateComplete} />
  }

  // Backfill — start date set in past, backfill not run
  if (appState === 'backfill') {
    return <BackfillProgress onComplete={handleBackfillComplete} mafHr={settings.maf_hr} />
  }

  // Dashboard — fully onboarded
  return (
    <Dashboard
      settings={settings}
      onSettingsChange={setSettings}
    />
  )
}
