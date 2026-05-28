'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

function LoginForm() {
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const searchParams = useSearchParams()
  const router       = useRouter()

  // Supabase redirects back here with ?code= after Google login
  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) return

    setProcessing(true)
    const supabase = createClient()

    supabase.auth.exchangeCodeForSession(code).then(async ({ error: exchError }) => {
      if (exchError) {
        setError('Er liep iets mis bij het inloggen. Probeer opnieuw.')
        setProcessing(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Geen gebruiker gevonden.')
        setProcessing(false)
        return
      }

      const isAllowed =
        ADMIN_EMAILS.includes(user.email ?? '') ||
        user.user_metadata?.allowed === true

      if (isAllowed) {
        router.push('/dashboard')
        router.refresh()
        return
      }

      // Check if this is a freelancer
      const freelancerRes = await fetch('/api/auth/check-freelancer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      })
      if (freelancerRes.ok) {
        router.push('/portal')
        router.refresh()
        return
      }

      // Not allowed at all
      await fetch('/api/auth/cleanup', { method: 'POST' })
      setError('Dit e-mailadres heeft geen toegang tot het platform. Neem contact op met de beheerder.')
      setProcessing(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-3.5 py-2.5 bg-red-950/50 border border-red-900/50 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleGoogleLogin}
        disabled={loading || processing}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white text-zinc-950 text-sm font-semibold rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading || processing ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        {loading || processing ? 'Bezig met inloggen…' : 'Inloggen met Google'}
      </button>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white mb-4">
            <span className="text-zinc-950 font-black text-xl tracking-tight">SH</span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Sporthouse Hub</h1>
          <p className="mt-1 text-sm text-zinc-400">Intern platform voor SporthouseGroup</p>
        </div>

        <Suspense fallback={
          <button disabled className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white text-zinc-950 text-sm font-semibold rounded-lg opacity-50 cursor-not-allowed">
            Inloggen met Google
          </button>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
