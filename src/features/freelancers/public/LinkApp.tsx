'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { api, SessionLost, type Detail, type Me, type SessionState } from './api'
import Shell, { Notice } from './Shell'
import PinScreen from './PinScreen'
import Home from './Home'
import AssignmentDetail from './AssignmentDetail'
import ActionBar from './ActionBar'

// De persoonlijke link, /f#<token>. Het token staat achter # en gaat dus
// nooit naar een server-log; deze component leest het en stuurt het enkel in
// de body van /session en /pin. Daarna draagt de cookie de sessie.
//
// Schermen: laden → ongeldig | pincode | (startpagina | opdracht ?o=<id>).
// De opdracht staat in de URL (?o=), zodat de terugknop van de gsm werkt.

const tokenFromHash = () => (typeof window === 'undefined' ? null : window.location.hash.slice(1) || null)

export default function LinkApp() {
  const router = useRouter()
  const openId = useSearchParams().get('o')
  const [gate, setGate] = useState<SessionState | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const checkSession = useCallback(async () => {
    try {
      setGate(await api.session(tokenFromHash()))
    } catch {
      setError('Er ging iets mis. Vernieuw de pagina.')
    }
  }, [])

  const handle = useCallback((err: unknown) => {
    if (err instanceof SessionLost) { setMe(null); setDetail(null); setGate(null); void checkSession(); return }
    setError((err as Error).message)
  }, [checkSession])

  const loadMe = useCallback(async () => {
    try { setMe(await api.me()) } catch (err) { handle(err) }
  }, [handle])

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await api.detail(id)) } catch (err) { handle(err) }
  }, [handle])

  // Elk effect zet state pas in de callback van de promise, en niet meer na
  // het weggaan (alive), zodat een trage oude aanvraag niets overschrijft.
  useEffect(() => {
    let alive = true
    api.session(tokenFromHash())
      .then(s => { if (alive) setGate(s) })
      .catch(() => { if (alive) setError('Er ging iets mis. Vernieuw de pagina.') })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (gate?.state !== 'ok') return
    let alive = true
    api.me().then(m => { if (alive) setMe(m) }).catch(err => { if (alive) handle(err) })
    return () => { alive = false }
  }, [gate, handle])
  useEffect(() => {
    if (gate?.state !== 'ok' || !openId) return
    let alive = true
    api.detail(openId).then(d => { if (alive) setDetail(d) }).catch(err => { if (alive) handle(err) })
    return () => { alive = false }
  }, [gate, openId, handle])

  const go = (id: string | null) => {
    setError('')
    if (!id) setDetail(null)
    router.push(`/f${id ? `?o=${encodeURIComponent(id)}` : ''}${window.location.hash}`)
    window.scrollTo(0, 0)
  }

  async function act(action: 'accepteren' | 'weigeren' | 'opleveren', reason?: string) {
    if (!detail) return
    setBusy(true); setError('')
    try {
      setDetail(await api.action(detail.id, action, reason))
      void loadMe()
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  if (!gate) {
    return <Shell>{error ? <Notice title="Er ging iets mis">{error}</Notice> : <Loader2 className="mx-auto mt-16 animate-spin text-zinc-500" aria-label="Laden" />}</Shell>
  }
  if (gate.state === 'ongeldig') {
    return <Shell><Notice title="Deze link is niet (meer) geldig">Vraag ons team om een nieuwe link.</Notice></Shell>
  }
  if (gate.state === 'pin' || gate.state === 'geblokkeerd') {
    const token = tokenFromHash()
    if (!token) return <Shell><Notice title="Deze link is niet (meer) geldig">Vraag ons team om een nieuwe link.</Notice></Shell>
    return <Shell><PinScreen token={token} initial={gate} onOk={() => setGate({ state: 'ok' })} /></Shell>
  }

  if (openId) {
    if (!detail || detail.id !== openId) {
      return <Shell>{error ? <Notice title="Opdracht niet gevonden">{error}</Notice> : <Loader2 className="mx-auto mt-16 animate-spin text-zinc-500" aria-label="Laden" />}</Shell>
    }
    const bar = <ActionBar a={detail} busy={busy} onAction={act} />
    const hasBar = ['gedeeld', 'geaccepteerd', 'opgeleverd'].includes(detail.status)
    return (
      <Shell bottomBar={hasBar ? (<>{error && <p className="mb-2 text-sm text-red-400" role="alert">{error}</p>}{bar}</>) : undefined}>
        <AssignmentDetail a={detail} onBack={() => go(null)} onUploaded={() => { void loadDetail(detail.id); void loadMe() }} />
      </Shell>
    )
  }

  return (
    <Shell>
      {error && <p className="mb-4 text-base text-red-400" role="alert">{error}</p>}
      {me ? <Home me={me} onOpen={id => go(id)} /> : <Loader2 className="mx-auto mt-16 animate-spin text-zinc-500" aria-label="Laden" />}
    </Shell>
  )
}
