import { BASE_PATH } from '../config'

export function Login() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">MAF Machine</h1>
        <p className="text-gray-400 text-lg">
          Track your MAF heart rate training progress with data from Strava. See your aerobic efficiency improve over time.
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
        <div className="pt-8 opacity-60">
          <a
            href="https://www.strava.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src={`${BASE_PATH}/api_logo_pwrdBy_strava_horiz_white.svg`}
              alt="Powered by Strava"
              width={130}
              height={13}
              className="h-4 w-auto"
            />
          </a>
        </div>
      </div>
    </div>
  )
}