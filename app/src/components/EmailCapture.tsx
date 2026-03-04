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

  const valid = isValidEmail(email)

  async function handleSubmit() {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed to save')
      onComplete()
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
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
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valid && handleSubmit()}
            placeholder="you@example.com"
            autoFocus
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500/50 transition-colors"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!valid || saving}
          className="w-full py-3.5 rounded-lg font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-500 hover:bg-green-400 text-gray-950"
        >
          {saving ? 'Saving...' : 'See your dashboard'}
        </button>
      </div>
    </div>
  )
}
