'use client'

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { api, type SessionState } from './api'
import { time } from './format'

// Vier vakjes voor de pincode. inputmode="numeric" voor het cijferklavier,
// autocomplete="one-time-code" op het eerste vakje, 16px tekst zodat iOS niet
// inzoomt. De focus springt door, plakken van 4 cijfers werkt, en bij het
// vierde cijfer verstuurt het formulier zichzelf.
export default function PinScreen({ token, initial, onOk }: {
  token: string
  initial: Extract<SessionState, { state: 'pin' | 'geblokkeerd' }>
  onOk: () => void
}) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [status, setStatus] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const blocked = status.state === 'geblokkeerd'

  // Na elke poging (en bij het openen) terug naar het eerste vakje, zodra de
  // vakjes weer ingeschakeld zijn — een uitgeschakeld vakje kan geen focus krijgen.
  useEffect(() => {
    if (!busy && !blocked) refs.current[0]?.focus()
  }, [busy, blocked])

  // Een tijdelijke blokkering heft zichzelf op: daarna mag het opnieuw.
  const until = status.state === 'geblokkeerd' && !status.needsNewPin ? status.until : null
  useEffect(() => {
    if (!until) return
    const ms = Date.parse(until) - Date.now()
    const t = setTimeout(() => setStatus({ state: 'pin' }), Math.max(0, ms) + 500)
    return () => clearTimeout(t)
  }, [until])

  async function submit(pin: string) {
    setBusy(true); setError('')
    try {
      const r = await api.pin(token, pin)
      if (r.state === 'ok') return onOk()
      if (r.state === 'pin' || r.state === 'geblokkeerd') setStatus(r)
      if (r.state === 'ongeldig') setError('Deze link is niet (meer) geldig.')
      setDigits(['', '', '', ''])
    } catch {
      setError('Er ging iets mis. Probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  function fill(next: string[], focusAt: number) {
    setDigits(next)
    if (next.every(d => d)) void submit(next.join(''))
    else refs.current[Math.min(focusAt, 3)]?.focus()
  }

  function onChange(i: number, value: string) {
    const clean = value.replace(/\D/g, '')
    if (clean.length > 1) return onPasteDigits(clean)
    const next = [...digits]; next[i] = clean
    fill(next, clean ? i + 1 : i)
  }

  function onPasteDigits(text: string) {
    const d = text.replace(/\D/g, '').slice(0, 4).split('')
    if (d.length) fill([0, 1, 2, 3].map(i => d[i] ?? ''), d.length)
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  return (
    <div className="mt-8 text-center">
      <h1 className="text-xl font-semibold text-white">Vul je pincode in</h1>
      <p className="mt-2 text-base text-zinc-400">Je kreeg een pincode van 4 cijfers van ons team.</p>

      <form onSubmit={e => { e.preventDefault(); if (digits.every(d => d)) void submit(digits.join('')) }}
        className="mt-6 flex justify-center gap-3">
        {digits.map((d, i) => (
          <input key={i} ref={el => { refs.current[i] = el }} value={d} disabled={busy || blocked}
            onChange={e => onChange(i, e.target.value)} onKeyDown={e => onKey(i, e)}
            onPaste={(e: ClipboardEvent<HTMLInputElement>) => { e.preventDefault(); onPasteDigits(e.clipboardData.getData('text')) }}
            inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={i === 0} aria-label={`Cijfer ${i + 1} van 4`}
            className="w-14 h-16 rounded-xl bg-zinc-900 border border-zinc-700 text-center text-2xl font-semibold text-white
              focus:outline-none focus:border-[#3A913F] focus-visible:ring-2 focus-visible:ring-[#3A913F]/40 disabled:opacity-50" />
        ))}
      </form>

      <div className="mt-5 min-h-[3rem] text-base" aria-live="polite">
        {busy && <Loader2 className="mx-auto animate-spin text-zinc-500" size={22} aria-label="Bezig" />}
        {!busy && status.state === 'pin' && status.attemptsLeft != null && status.attemptsLeft < 5 && (
          <p className="text-red-400">Foute pincode, nog {status.attemptsLeft} {status.attemptsLeft === 1 ? 'poging' : 'pogingen'}.</p>
        )}
        {!busy && status.state === 'geblokkeerd' && (
          <p className="text-amber-400">
            {status.needsNewPin || !status.until
              ? 'Te veel foute pogingen. Vraag een nieuwe pincode aan ons team.'
              : `Te veel foute pogingen. Probeer opnieuw om ${time(status.until)}.`}
          </p>
        )}
        {!busy && error && <p className="text-red-400">{error}</p>}
      </div>

      <p className="mt-8 text-sm text-zinc-500">Pincode kwijt? Vraag een nieuwe aan ons team.</p>
    </div>
  )
}
