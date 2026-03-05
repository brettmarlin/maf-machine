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
        <div className="pt-4 flex flex-col items-center gap-2 opacity-50">
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
          <div className="flex gap-3 text-[11px] text-gray-600">
            <a href="/privacy-policy" className="hover:text-gray-400 transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/support" className="hover:text-gray-400 transition-colors">Support</a>
          </div>
        </div>
      </div>
    </div>
  )
}
