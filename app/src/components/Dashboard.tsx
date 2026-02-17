interface Settings {
  configured: boolean
  age?: number
  modifier?: number
  units?: 'km' | 'mi'
  maf_hr?: number
  maf_zone_low?: number
  maf_zone_high?: number
}

export function Dashboard({ settings }: { settings: Settings }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">MAF Machine</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              MAF HR: {settings.maf_hr} bpm ({settings.maf_zone_low}–{settings.maf_zone_high})
            </span>
            <a
              href="/api/auth/logout"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Logout
            </a>
          </div>
        </div>

        {/* Placeholder */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">Dashboard coming soon — charts, trends, and advisor.</p>
          <p className="text-gray-500 text-sm mt-2">
            Settings: Age {settings.age}, Modifier {settings.modifier}, Units: {settings.units}
          </p>
        </div>
      </div>
    </div>
  )
}
