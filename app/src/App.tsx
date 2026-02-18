import { useState, useEffect } from 'react'
import { Login } from './components/Login'
import { Dashboard } from './components/Dashboard'
import { BASE_PATH } from './config'

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

const DEFAULT_SETTINGS: Settings = {
  configured: false,
  age: 35,
  modifier: 0,
  units: 'mi',
  maf_hr: 145,
  maf_zone_low: 140,
  maf_zone_high: 150,
  qualifying_tolerance: 10,
  start_date: null,
}

export default function App() {
  const [auth, setAuth] = useState<{ authenticated: boolean; athleteId?: string } | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${BASE_PATH}/api/auth/me`)
        const data = await res.json()
        setAuth(data)

        if (data.authenticated) {
          const settingsRes = await fetch(`${BASE_PATH}/api/settings`)
          const settingsData = await settingsRes.json()
          if (settingsData.configured) {
            setSettings(settingsData)
          }
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

  return (
    <Dashboard
      settings={settings}
      onSettingsChange={setSettings}
    />
  )
}
