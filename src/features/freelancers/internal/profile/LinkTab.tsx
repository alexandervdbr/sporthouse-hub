'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Link2, Loader2, Share2, ShieldOff } from 'lucide-react'
import { Modal } from '@/components/poolwagens/ui'
import { Button, ErrorLine } from '@/components/materiaal/ui'
import { internalApi, shareMessage } from '../api'
import { ago, longDate } from '../format'
import LinkReveal, { useCopy } from '../LinkReveal'
import type { Freelancer, LinkStatus } from '../types'

// Tabblad Link & pincode (alleen bij beheren). De link kan altijd opnieuw
// gekopieerd worden; de pincode nooit — die kan alleen vervangen worden.
type Confirm = 'pin' | 'link' | 'revoke' | null
const CONFIRM = {
  pin: { title: 'Nieuwe pincode', text: 'De huidige pincode werkt meteen niet meer, en wie al ingelogd was moet de nieuwe pincode ingeven. De link zelf blijft dezelfde.', ok: 'Nieuwe pincode maken' },
  link: { title: 'Nieuwe link', text: 'De oude link werkt dan meteen niet meer. Je krijgt een nieuwe link én een nieuwe pincode, die je allebei opnieuw moet doorsturen.', ok: 'Nieuwe link maken' },
  revoke: { title: 'Link intrekken', text: 'De link werkt meteen niet meer. De freelancer ziet zijn opdrachten pas weer als je een nieuwe link maakt.', ok: 'Intrekken' },
} as const

export default function LinkTab({ f }: { f: Freelancer }) {
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState<{ url?: string; pin: string } | null>(null)
  const { copied, copy } = useCopy()

  const load = useCallback(() => internalApi.link(f.id).then(setStatus).catch(err => setError((err as Error).message)), [f.id])
  useEffect(() => {
    let alive = true
    internalApi.link(f.id).then(s => { if (alive) setStatus(s) }).catch(err => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [f.id])

  async function withUrl(fn: (url: string) => void) {
    try { fn((await internalApi.linkUrl(f.id)).url) } catch (err) { setError((err as Error).message) }
  }
  async function run(kind: Exclude<Confirm, null>) {
    setBusy(true); setError('')
    try {
      if (kind === 'pin') setReveal({ pin: (await internalApi.newPin(f.id)).pin })
      if (kind === 'link') setReveal(await internalApi.newLink(f.id))
      if (kind === 'revoke') await internalApi.revokeLink(f.id)
      setConfirm(null); void load()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  if (!status) return error ? <ErrorLine>{error}</ErrorLine> : <Loader2 className="mx-auto mt-8 animate-spin text-zinc-500" aria-label="Laden" />
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
        {status.state === 'geen' && <p className="text-zinc-300">Nog geen link. {f.archived_at ? 'Zet de freelancer eerst terug uit het archief.' : 'Maak er een om opdrachten te delen.'}</p>}
        {status.state !== 'geen' && (
          <div className="space-y-1">
            <p className={status.state === 'geblokkeerd' ? 'font-medium text-amber-300' : 'font-medium text-emerald-300'}>
              {status.state === 'actief' ? 'Actief' : status.needs_new_pin ? 'Geblokkeerd tot er een nieuwe pincode is' : `Geblokkeerd tot ${new Date(status.locked_until!).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
            <p className="text-zinc-400">{status.last_opened_at ? `Laatst geopend ${ago(status.last_opened_at)}` : 'Nog nooit geopend'} · gemaakt op {longDate(status.created_at)}</p>
          </div>
        )}
      </div>

      <ErrorLine>{error}</ErrorLine>
      <div className="flex flex-wrap gap-2">
        {status.state !== 'geen' && <>
          <Button onClick={() => withUrl(u => copy('url', u))}>{copied === 'url' ? <Check size={14} /> : <Link2 size={14} />} Link kopiëren</Button>
          <Button onClick={() => withUrl(u => copy('msg', shareMessage(f.name, u)))}>{copied === 'msg' ? <Check size={14} /> : <Copy size={14} />} Bericht kopiëren</Button>
          {canShare && <Button onClick={() => withUrl(u => navigator.share({ text: shareMessage(f.name, u) }).catch(() => {}))}><Share2 size={14} /> Delen</Button>}
          <Button onClick={() => setConfirm('pin')}><KeyRound size={14} /> Nieuwe pincode</Button>
        </>}
        {!f.archived_at && <Button variant={status.state === 'geen' ? 'primary' : 'secondary'} onClick={() => status.state === 'geen' ? void run('link') : setConfirm('link')} busy={busy && status.state === 'geen'}>
          <Link2 size={14} /> {status.state === 'geen' ? 'Link maken' : 'Nieuwe link'}</Button>}
        {status.state !== 'geen' && <Button variant="danger" onClick={() => setConfirm('revoke')}><ShieldOff size={14} /> Link intrekken</Button>}
      </div>

      {confirm && (
        <Modal title={CONFIRM[confirm].title} onClose={() => setConfirm(null)} footer={<>
          <Button onClick={() => setConfirm(null)}>Annuleren</Button>
          <Button variant={confirm === 'revoke' ? 'destructive' : 'primary'} data-primary busy={busy} onClick={() => run(confirm)}>{CONFIRM[confirm].ok}</Button>
        </>}>
          <p className="text-sm text-zinc-300">{CONFIRM[confirm].text}</p>
        </Modal>
      )}
      {reveal && <LinkReveal name={f.name} url={reveal.url} pin={reveal.pin} onClose={() => setReveal(null)} />}
    </div>
  )
}
