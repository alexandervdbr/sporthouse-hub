'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, X } from 'lucide-react'
import { ErrorLine } from '@/components/materiaal/ui'
import Toast, { type ToastData } from '@/components/materiaal/Toast'
import { internalApi, shareMessage } from '../api'
import { ASSIGNMENT_STATUS, longDate, relativeDeadline } from '../format'
import type { AssignmentDetail } from '../types'
import LinkReveal from '../LinkReveal'
import StatusStepper from './StatusStepper'
import AssignmentActions, { type PanelAction } from './AssignmentActions'
import AssignmentFiles from './AssignmentFiles'
import AssignmentActivity from './AssignmentActivity'
import ReviewDialog from './ReviewDialog'
import MessageDialog from './MessageDialog'
import EditAssignmentModal from './EditAssignmentModal'

// Eén opdracht. Desktop: een zijpaneel over de lijst of het profiel heen;
// gsm (en als losse pagina): volledig scherm. De URL (?opdracht=…, of
// /freelancers/opdrachten/[id]) maakt het deelbaar en de terugknop werkt.

const DIALOGS = {
  geaccepteerd: { title: 'Terugsturen met feedback', explain: 'De opdracht gaat terug naar "geaccepteerd". De freelancer ziet je bericht op zijn link.', label: 'Bericht voor de freelancer *', required: true, confirm: 'Terugsturen' },
  geannuleerd: { title: 'Opdracht annuleren', explain: 'De opdracht verdwijnt van de link van de freelancer. Dit kan niet ongedaan gemaakt worden.', label: 'Reden (intern, optioneel)', required: false, confirm: 'Annuleren', destructive: true },
  opgeleverd: { title: 'Opdracht heropenen', explain: 'De opdracht gaat terug naar "opgeleverd", zodat je ze opnieuw kan bekijken.', label: 'Reden (intern, optioneel)', required: false, confirm: 'Heropenen' },
} as const

export default function AssignmentPanel({ id, canManage, asPage, onClose, onChanged }: {
  id: string; canManage: boolean; asPage?: boolean; onClose: () => void; onChanged?: () => void
}) {
  const [a, setA] = useState<AssignmentDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<null | 'review' | 'edit' | keyof typeof DIALOGS>(null)
  const [reveal, setReveal] = useState<{ url: string; pin: string } | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = useCallback(() => internalApi.assignment(id).then(setA).catch(err => setError((err as Error).message)), [id])
  useEffect(() => {
    let alive = true
    internalApi.assignment(id).then(d => { if (alive) setA(d) }).catch(err => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [id])
  const refresh = () => { void load(); onChanged?.() }

  async function transition(to: string, message?: string) {
    if (!a) return
    setBusy(true); setError('')
    try {
      const r = await internalApi.transition(a.id, to, message)
      if (to === 'gedeeld') {
        const name = a.freelancer?.name ?? 'de freelancer'
        if (r.link) setReveal(r.link)
        const url = r.link?.url ?? (await internalApi.linkUrl(a.freelancer_id).catch(() => null))?.url ?? null
        setToast({ id: Date.now(), message: `Staat nu op de link van ${name}`, action: url ? { label: 'Bericht kopiëren', onClick: () => navigator.clipboard.writeText(shareMessage(name, url)).catch(() => {}) } : undefined })
      }
      refresh()
      if (to === 'afgerond') setDialog('review')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function onAction(x: PanelAction) {
    if (x.kind === 'transition') void transition(x.to)
    else if (x.kind === 'review') setDialog('review')
    else if (x.kind === 'edit') setDialog('edit')
    else setDialog(x.to)
  }

  const lastStatus = a?.events.find(e => e.kind === 'status' && e.to_status === a.status)
  const deadline = a?.deadline ? relativeDeadline(a.deadline) : null
  const frame = asPage
    ? 'mx-auto max-w-3xl'
    : 'fixed inset-0 z-40 overflow-y-auto bg-zinc-950 md:inset-y-0 md:left-auto md:right-0 md:w-[600px] md:border-l md:border-zinc-800 md:shadow-2xl'

  return (
    <>
      {!asPage && <div className="fixed inset-0 z-30 hidden bg-black/50 md:block" onClick={onClose} aria-hidden />}
      <aside className={frame} role={asPage ? undefined : 'dialog'} aria-label={a?.title ?? 'Opdracht'}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
          <span className="truncate text-xs text-zinc-500">{a?.freelancer && <Link href={`/freelancers/${a.freelancer.id}`} className="hover:text-zinc-300">{a.freelancer.name}</Link>}</span>
          <div className="flex items-center gap-1">
            {!asPage && a && <Link href={`/freelancers/opdrachten/${a.id}`} className="hidden px-2 text-xs text-zinc-500 hover:text-zinc-300 md:inline">Open als pagina</Link>}
            <button type="button" onClick={onClose} aria-label="Sluiten" className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"><X size={18} /></button>
          </div>
        </div>

        <div className="space-y-6 px-4 py-4">
          {error && <ErrorLine>{error}</ErrorLine>}
          {!a ? (!error && <Loader2 className="mx-auto mt-10 animate-spin text-zinc-500" aria-label="Laden" />) : (<>
            <header className="space-y-3">
              <h2 className="break-words text-lg font-semibold text-white">{a.title}</h2>
              <StatusStepper status={a.status} from={lastStatus?.from_status} />
              {canManage && <AssignmentActions a={a} busy={busy} onAction={onAction} />}
            </header>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-zinc-500">Klant</dt><dd className="text-zinc-200">{a.client?.name ?? a.client_name ?? '—'}</dd></div>
              <div><dt className="text-xs text-zinc-500">Deadline</dt><dd className={deadline?.late && ['gedeeld', 'geaccepteerd'].includes(a.status) ? 'text-red-400' : 'text-zinc-200'}>
                {a.deadline ? `${longDate(a.deadline)}${['gedeeld', 'geaccepteerd'].includes(a.status) && deadline ? ` (${deadline.text})` : ''}` : '—'}</dd></div>
              <div><dt className="text-xs text-zinc-500">Discipline</dt><dd className="text-zinc-200">{a.discipline ?? '—'}</dd></div>
              <div><dt className="text-xs text-zinc-500">Status</dt><dd className="text-zinc-200">{ASSIGNMENT_STATUS[a.status]?.label}{a.first_viewed_at ? ' · gezien' : ''}</dd></div>
            </dl>

            <section aria-label="Briefing">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Briefing</h3>
              {a.briefing ? <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">{a.briefing}</p> : <p className="text-sm text-zinc-500">Geen briefing.</p>}
            </section>

            <AssignmentFiles a={a} canManage={canManage} onChanged={refresh} />

            <section aria-label="Activiteit">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Activiteit</h3>
              <AssignmentActivity events={a.events} />
            </section>
          </>)}
        </div>
      </aside>

      {a && dialog === 'review' && <ReviewDialog a={a} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh() }} />}
      {a && dialog === 'edit' && <EditAssignmentModal a={a} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh() }} />}
      {a && dialog && dialog in DIALOGS && (
        <MessageDialog {...DIALOGS[dialog as keyof typeof DIALOGS]} onClose={() => setDialog(null)}
          onConfirm={async m => { await internalApi.transition(a.id, dialog, m); setDialog(null); refresh() }} />
      )}
      {a && reveal && <LinkReveal name={a.freelancer?.name ?? ''} url={reveal.url} pin={reveal.pin} onClose={() => setReveal(null)} />}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </>
  )
}
