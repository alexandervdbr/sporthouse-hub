'use client'

import { useEffect } from 'react'
import './globals.css'

// Catches a crash in the root layout itself (a provider throwing during
// render, a font/CSS load failure) — error.tsx only covers errors below the
// root layout, so without this, this one specific failure mode falls
// through to Next's raw, unstyled default screen. Renders its own
// <html>/<body> since the root layout is presumed broken; critical colors
// are inlined rather than relying purely on the globals.css import, since a
// stylesheet load failure is itself one of the failure modes this exists for.
export default function GlobalError({
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
    <html lang="nl">
      <body style={{ backgroundColor: '#0d0d0d', margin: 0 }}>
        <div
          style={{
            display: 'flex',
            height: '100vh',
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '0 1.5rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              height: '3.5rem',
              width: '3.5rem',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '9999px',
              backgroundColor: 'rgba(127,29,29,0.4)',
              border: '1px solid rgba(127,29,29,0.5)',
              fontSize: '1.5rem',
            }}
          >
            ⚠
          </div>
          <div style={{ maxWidth: '24rem' }}>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white', margin: 0 }}>
              Er ging iets ernstig mis
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#71717a', marginTop: '0.375rem' }}>
              Het platform kon niet correct laden. Probeer het opnieuw, of ververs de pagina.
            </p>
          </div>
          <button
            onClick={reset}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: '#3A913F',
              cursor: 'pointer',
            }}
          >
            Probeer opnieuw
          </button>
        </div>
      </body>
    </html>
  )
}
