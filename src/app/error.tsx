'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-950/40 border border-red-900/50">
        <AlertTriangle size={24} className="text-red-400" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-white">Er ging iets mis</h1>
        <p className="text-sm text-zinc-500 max-w-sm">
          Er is een onverwachte fout opgetreden. Probeer het opnieuw, of ga terug naar het dashboard.
        </p>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: '#3A913F' }}
        >
          Probeer opnieuw
        </button>
        <a
          href="/dashboard"
          className="px-4 py-2 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          Naar dashboard
        </a>
      </div>
    </div>
  )
}
