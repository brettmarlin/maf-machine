import { useState } from 'react'
import { BASE_PATH } from '../config'

interface Props {
  onComplete: () => void
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function EmailCapture({ onComplete }: Props) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  const valid = isValidEmail(email)

  async function handleSubmit() {
    setTouched(true)
    if (!valid) {
      setError(email.trim() === '' ? 'Please enter your email to continue' : 'Please enter a valid email to continue')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Save to settings
      await fetch(`${BASE_PATH}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // Send to Brevo (best-effort — navigate regardless)
      fetch(`${BASE_PATH}/api/collect-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'app' }),
      }).catch(() => {})
      onComplete()
    } catch {
      // Navigate anyway — never block the user
      onComplete()
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-3">
          <p className="text-gray-300 text-base leading-relaxed">
            What is your email so we can keep you updated on important enhancements?
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (touched) setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="you@example.com"
            autoFocus
            className={`w-full bg-gray-900 border rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-colors ${
              error ? 'border-red-500/70 focus:border-red-400' : 'border-gray-800 focus:border-green-500/50'
            }`}
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-3.5 rounded-lg font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-500 hover:bg-green-400 text-gray-950"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Saving...
              </span>
            ) : 'See your dashboard'}
          </button>
          <p className="text-[11px] text-gray-600">
            By continuing you agree to our{' '}
            <a href="/privacy-policy" className="underline hover:text-gray-400 transition-colors">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  )
}
