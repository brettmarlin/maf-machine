export function Login() {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <h1 className="text-4xl font-bold tracking-tight">MAF Machine</h1>
          <p className="text-gray-400 text-lg">
            Track your aerobic fitness over time with MAF testing.
            Connect your Strava account to get started.
          </p>
          <a
            href="/api/auth/strava"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Connect with Strava
          </a>
        </div>
      </div>
    )
  }