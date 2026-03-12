import { useState, useEffect, useCallback } from 'react'
import { LandingPage } from './components/LandingPage'
import { OnboardingSetup } from './components/OnboardingSetup'
import { BadgeCelebration } from './components/BadgeCelebration'
import { TrainingStartDate } from './components/TrainingStartDate'
import { BackfillProgress } from './components/BackfillProgress'
import { EmailCapture } from './components/EmailCapture'
import { Dashboard } from './components/Dashboard'
import PrivacyPolicy from './components/PrivacyPolicy'
import Support from './components/Support'
import { FeedbackWidget } from './components/FeedbackWidget'
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
  firstname?: string
  lastname?: string
  profile?: string
}

interface GameSummary {
  backfill_complete: boolean
  level: number
  level_name: string
  level_progress_pct: number
  next_level_name: string | null
  badges_earned: string[]
  lifetime_total_runs: number
}

export type AppState = 'landing' | 'connect_strava' | 'setup' | 'setup_celebration' | 'start_date' | 'backfill' | 'email_capture' | 'dashboard' | 'privacy' | 'support'

const DEFAULT_SETTINGS: Settings = {
  configured: false,
}

// ─── State Detection ─────────────────────────────────────────────────────────

function getAppState(
  authenticated: boolean,
  settings: Settings | null,
  gameSummary: GameSummary | null,
): AppState {
  // 1. Returning user flag — check first, before any other logic
  const isReturning = new URLSearchParams(window.location.search).get('returning') === 'true'
  if (isReturning) {
    window.history.replaceState({}, '', window.location.pathname)
    return 'connect_strava'
  }

  // 2. Not authenticated
  if (!authenticated) {
    // Has existing settings → returning user, show reconnect (not onboarding)
    if (settings?.age) return 'connect_strava'
    return 'landing'
  }

  // 3. Authenticated with settings → dashboard
  if (settings?.age) {
    const backfillDone = gameSummary?.backfill_complete ?? true
    if (!backfillDone && settings?.training_start_date) return 'backfill'
    return 'dashboard'
  }

  // 4. Authenticated but no settings — truly new user → onboarding
  return 'setup'
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [auth, setAuth] = useState<{ authenticated: boolean; athleteId?: string } | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const staticPages: Record<string, AppState> = { '/privacy-policy': 'privacy', '/privacy': 'privacy', '/support': 'support' }

  const [forceState, setForceState] = useState<AppState | null>(
    staticPages[window.location.pathname] ?? null,
  )

  // Intercept internal static page links for client-side navigation
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a')
      const href = anchor?.getAttribute('href')
      if (href && staticPages[href]) {
        e.preventDefault()
        window.history.pushState(null, '', href)
        setForceState(staticPages[href])
      }
    }
    function handlePopState() {
      setForceState(staticPages[window.location.pathname] ?? null)
    }
    document.addEventListener('click', handleClick)
    window.addEventListener('popstate', handlePopState)
    return () => {
      document.removeEventListener('click', handleClick)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

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
          lifetime_total_runs: data.lifetime_total_runs ?? 0,
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
              lifetime_total_runs: gameData.lifetime_total_runs ?? 0,
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

  // Callback: setup complete → advance to start_date
  const handleSetupComplete = useCallback(async () => {
    await Promise.all([refreshSettings(), refreshGameState()])
    setForceState('start_date')
  }, [])

  // Callback: start date complete → advance to backfill or celebration
  const handleStartDateComplete = useCallback(async (skipBackfill: boolean) => {
    await refreshSettings()
    if (skipBackfill) {
      // No backfill needed — go to celebration
      await refreshGameState()
      setForceState('setup_celebration')
    } else {
      setForceState('backfill')
    }
  }, [])

  // Callback: backfill complete → advance to celebration
  const handleBackfillComplete = useCallback(async () => {
    await refreshGameState()
    setForceState('setup_celebration')
  }, [])

  // Callback: celebration dismissed → advance to email capture
  const handleCelebrationDone = useCallback(() => {
    setForceState('email_capture')
  }, [])

  // Callback: email captured → advance to dashboard
  const handleEmailComplete = useCallback(() => {
    setForceState('dashboard')
  }, [])

  // Static pages (no feedback widget)
  if (forceState === 'privacy') return <PrivacyPolicy />
  if (forceState === 'support') return <Support />

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

  // Resolve page content
  let content: React.ReactNode = null

  if (appState === 'landing') {
    content = <LandingPage />
  } else if (appState === 'connect_strava') {
    content = (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-8">
          <img
            src={`${BASE_PATH}/maf-machine-logo.svg`}
            alt="MAF Machine"
            style={{ height: 32, width: 'auto' }}
            className="mx-auto"
          />
          <p className="text-gray-400 text-base">
            Welcome back — reconnect Strava to continue.
          </p>
          <a
            href={`${BASE_PATH}/api/auth/strava`}
            className="inline-block hover:opacity-90 transition-opacity"
            aria-label="Connect with Strava"
          >
            <img
              src={`${BASE_PATH}/btn_strava_connectwith_orange.svg`}
              alt="Connect with Strava"
              width={193}
              height={48}
              className="h-12 w-auto"
            />
          </a>
        </div>
      </div>
    )
  } else if (appState === 'setup') {
    content = (
      <OnboardingSetup
        athleteName={settings.athlete_name}
        onComplete={handleSetupComplete}
      />
    )
  } else if (appState === 'setup_celebration') {
    const committedBadge = BADGES.find((b) => b.id === 'committed')
    if (committedBadge && gameSummary) {
      content = (
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
    } else {
      // Fallback: no badge found, skip celebration
      handleCelebrationDone()
    }
  } else if (appState === 'start_date') {
    content = <TrainingStartDate onComplete={handleStartDateComplete} />
  } else if (appState === 'backfill') {
    content = <BackfillProgress onComplete={handleBackfillComplete} mafHr={settings.maf_hr} />
  } else if (appState === 'email_capture') {
    content = <EmailCapture onComplete={handleEmailComplete} />
  } else {
    // Dashboard — fully onboarded
    content = (
      <Dashboard
        settings={settings}
        onSettingsChange={setSettings}
      />
    )
  }

  return (
    <>
      {content}
      <FeedbackWidget />
    </>
  )
}
