import { useState, useEffect } from 'react'
import { BASE_PATH } from '../config'

const CATEGORIES = ['Bug', 'Feature Request', 'Confusion', 'Praise', 'Other'] as const

interface Props {
  email?: string
  stravaId?: string
}

export function FeedbackWidget({ email, stravaId }: Props) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<string>('Other')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Auto-close after success
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        setMessage('')
        setCategory('Other')
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [success])

  async function handleSubmit() {
    const trimmed = message.trim()
    if (trimmed.length < 5) {
      setError('Please write at least 5 characters')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch(`${BASE_PATH}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message: trimmed, email, stravaId }),
      })
      if (!res.ok) throw new Error()
      setSuccess(true)
    } catch {
      setError('Failed to send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-gray-900/80 text-green-400 border border-green-500/20 backdrop-blur-sm hover:bg-gray-800/90 hover:border-green-500/40 transition-all shadow-lg"
      >
        <span>Feedback</span>
      </button>

      {/* Modal backdrop + dialog */}
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4" onClick={() => !sending && setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-300 transition-colors text-lg"
            >
              &times;
            </button>

            {success ? (
              <div className="py-8 text-center">
                <p className="text-green-400 font-medium">Thanks! We'll look into it.</p>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-white">Beta Feedback</h3>
                  <p className="text-xs text-gray-500 mt-1">Help us make MAF Machine better. What's working? What's broken?</p>
                </div>

                {/* Category */}
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        category === c
                          ? 'bg-green-500/15 text-green-400 border-green-500/40'
                          : 'text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <textarea
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); setError('') }}
                  placeholder="Tell us what you noticed..."
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 transition-colors resize-none"
                />

                {error && <p className="text-xs text-red-400">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={sending}
                  className="w-full py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 bg-green-500 hover:bg-green-400 text-gray-950"
                >
                  {sending ? 'Sending...' : 'Send Feedback'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
