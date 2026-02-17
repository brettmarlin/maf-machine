import { useState, useEffect } from 'react'
import { Login } from './components/Login'
import { Onboarding } from './components/Onboarding'
import { Dashboard } from './components/Dashboard'

interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  maf_zone_low?: number
  maf_zone_high?: number
  qualifying_tolerance?: number
  start_date?: string | null
}

export default function App() {
  const [auth, setAuth] = useState<{ authenticated: boolean; athleteId?: string } | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        setAuth(data)

        if (data.authenticated) {
          const settingsRes = await fetch('/api/settings')
          const settingsData = await settingsRes.json()
          setSettings(settingsData)
        }
      } catch {
        setAuth({ authenticated: false })
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!auth?.authenticated) {
    return <Login />
  }

  if (!settings?.configured || showSettings) {
    return (
      <Onboarding
        onComplete={(s) => {
          setSettings(s)
          setShowSettings(false)
        }}
        initialValues={settings?.configured ? settings : undefined}
      />
    )
  }

  return <Dashboard settings={settings} onOpenSettings={() => setShowSettings(true)} />
}