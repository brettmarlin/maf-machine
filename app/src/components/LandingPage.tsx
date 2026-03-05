import { BASE_PATH } from '../config'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md text-center space-y-8">
        {/* Fire emoji with pulse glow */}
        <div className="text-6xl animate-pulse-glow select-none">🔥</div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          The easiest way to do MAF training right.
        </h1>

        {/* Subtext */}
        <p className="text-gray-400 text-base leading-relaxed">
          Connect your Strava. Follow the prompts.
          <br />
          Watch your aerobic engine build itself.
        </p>

        {/* Strava connect button */}
        <a
          href={`${BASE_PATH}/api/auth/strava`}
          className="inline-flex items-center justify-center gap-2 bg-[#FC4C02] hover:bg-[#e04400] text-white font-semibold text-base px-8 py-3 rounded-lg transition-colors"
        >
          Connect with Strava
        </a>

        {/* Already connected link */}
        <p className="text-sm text-gray-600">
          <a
            href={`${BASE_PATH}/api/auth/strava`}
            className="hover:text-gray-400 transition-colors"
          >
            Already connected? Log in →
          </a>
        </p>

        {/* Powered by Strava */}
        <div className="pt-4 opacity-50">
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
