'use client'

import { useEffect, useMemo, useState } from 'react'
import { Flag, Loader2, MailCheck, MailWarning, ShieldCheck, Unlock } from 'lucide-react'
import DamageDialog from './DamageDialog'
import {
  EmptyState, ErrorLine, Notice, PoolHeader, actionCls, buttonCls, filterBarCls, filterInputCls, inputCls, labelCls, newNotice, pageBody, secondaryCls, send,
} from './ui'
import type { PoolwagenAccess } from '@/lib/poolwagens/access'
import { isBlockingDamage } from '@/lib/poolwagens/blocking'
import { DAMAGE_STATUSES, SEVERITY_LABEL, STATUS_LABEL } from '@/lib/poolwagens/damage-input'
import { formatShort } from '@/lib/poolwagens/time'
import type { DamageReport, DamageStatus, MailStatus, PoolCar } from '@/lib/poolwagens/types'

// De schademeldingen. Iedereen ziet ze en kan melden; beheer wijzigt de
// status, heft blokkades op en ziet of de mail vertrokken is.

const STATUS_STYLE: Record<DamageStatus, string> = {
  gemeld:         'text-amber-300 border-amber-500/30 bg-amber-500/10',
  in_behandeling: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  hersteld:       'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
}

const MAIL_LABEL: Record<MailStatus, string> = {
  verstuurd: 'Mail verstuurd',
  mislukt: 'Mail niet verstuurd',
  niet_geconfigureerd: 'Mail niet verstuurd: mail niet geconfigureerd',
  geen_ontvangers: 'Mail niet verstuurd: geen ontvangers ingesteld',
}

export default function SchadeLijst({ access, highlight }: { access: PoolwagenAccess; highlight: string | null }) {
  const [cars, setCars] = useState<PoolCar[]>([])
  const [reports, setReports] = useState<DamageReport[] | null>(null)
  const [scope, setScope] = useState<'open' | 'all'>('open')
  const [car, setCar] = useState('')
  const [reload, setReload] = useState(0)
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    send<PoolCar[]>(`/api/poolwagens/cars${access.manage ? '?archived=1' : ''}`, 'GET').then(setCars).catch(() => {})
  }, [access.manage])

  useEffect(() => {
    let alive = true
    // Een link uit de mail toont ook een melding die intussen hersteld is.
    const s = highlight ? 'all' : scope
    send<DamageReport[]>(`/api/poolwagens/damage?scope=${s}${car ? `&car=${car}` : ''}`, 'GET')
      .then(r => { if (alive) setReports(r) })
      .catch(e => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [scope, car, reload, highlight])

  const carById = useMemo(() => new Map(cars.map(c => [c.id, c])), [cars])

  async function act(id: string, fn: () => Promise<unknown>, message = '') {
    setBusy(id)
    setError('')
    try {
      await fn()
      setNotice(message ? newNotice(message) : null)
      setReload(r => r + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const canReport = cars.some(c => !c.archived_at)
  const reportButton = (
    <button onClick={() => setReporting(true)} disabled={!canReport}
      className={`${buttonCls} ${actionCls} text-white bg-red-600 hover:bg-red-500`}><Flag size={13} /> Schade melden</button>
  )

  return (
    <div className="min-h-full pb-8">
      <PoolHeader current="schade" manage={access.manage} loading={!reports} actions={reportButton} />

      <div className={pageBody}>
        {/* Filters: op een gsm onder elkaar; op desktop een compacte rij. */}
        <section aria-label="Filters" className={filterBarCls}>
          <div>
            <label className={labelCls}>Wagen</label>
            <select className={filterInputCls} value={car} onChange={e => setCar(e.target.value)}>
              <option value="">Alle wagens</option>
              {cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 md:w-fit p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
            {(['open', 'all'] as const).map(s => (
              <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s}
                className={`px-3 py-2 md:py-1.5 rounded-md text-xs font-medium ${scope === s ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>
                {s === 'open' ? 'Niet hersteld' : 'Alle'}
              </button>
            ))}
          </div>
        </section>

        {(error || notice) && (
          <div className="space-y-2">
            <ErrorLine>{error}</ErrorLine>
            <Notice notice={notice} onClose={() => setNotice(null)} />
          </div>
        )}

        {!reports ? null : reports.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={18} />}
            title={scope === 'open' ? 'Geen open schademeldingen' : 'Geen schademeldingen'}
            text="Iets opgemerkt aan een poolwagen? Meld het hier, met foto’s."
            action={canReport ? reportButton : undefined} />
        ) : (
          <div className="space-y-3">
            {reports.map(d => {
              const c = carById.get(d.car_id)
              const blocking = isBlockingDamage(d)
              const thumb = d.photos[0]
              return (
                <article key={d.id} id={d.id}
                  className={`rounded-xl border p-3 md:p-4 ${d.id === highlight ? 'border-zinc-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">{c?.name ?? 'Wagen'}</span>
                        {c && <span className="px-1.5 py-0.5 rounded border border-zinc-700 text-[10px] font-mono text-zinc-300">{c.license_plate}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${d.severity === 'ernstig' ? 'text-red-400 border-red-500/40 bg-red-500/10' : 'text-zinc-300 border-zinc-600 bg-zinc-800/60'}`}>
                          {SEVERITY_LABEL[d.severity]}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                        {blocking && <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Blokkeert de wagen</span>}
                      </div>
                      <p className="text-xs text-zinc-500">{formatShort(d.created_at)} · {d.reported_by_name}{d.reservation_id ? ' · bij een rit' : ''}</p>
                    </div>
                    {/* De eerste foto als miniatuur, ook op een gsm. */}
                    {thumb && (
                      <a href={`/api/poolwagens/damage/photo/${thumb.id}`} target="_blank" rel="noreferrer" title={thumb.filename} className="flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/poolwagens/damage/photo/${thumb.id}?size=small`} alt={thumb.filename} loading="lazy"
                          className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg border border-zinc-800 bg-zinc-950" />
                      </a>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-zinc-300 whitespace-pre-wrap break-words">{d.description}</p>
                  {(d.status_changed_at || (d.block_lifted_at && d.status !== 'hersteld')) && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {d.status_changed_at && `${STATUS_LABEL[d.status]} gezet door ${d.status_changed_by_name} op ${formatShort(d.status_changed_at)}`}
                      {d.block_lifted_at && d.status !== 'hersteld' && ` · blokkade opgeheven door ${d.block_lifted_by_name}`}
                    </p>
                  )}

                  {d.photos.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {d.photos.slice(1).map(p => (
                        <a key={p.id} href={`/api/poolwagens/damage/photo/${p.id}`} target="_blank" rel="noreferrer" title={p.filename}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/poolwagens/damage/photo/${p.id}?size=small`} alt={p.filename} loading="lazy"
                            className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg border border-zinc-800 bg-zinc-950" />
                        </a>
                      ))}
                    </div>
                  )}

                  {access.manage && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-1 gap-2 md:flex md:flex-wrap md:items-center">
                      <select className={`${inputCls} md:w-auto`} value={d.status} disabled={busy === d.id}
                        onChange={e => act(d.id, () => send(`/api/poolwagens/damage/${d.id}`, 'PATCH', { status: e.target.value }),
                          e.target.value === 'hersteld' && blocking ? 'Hersteld: de wagen is weer te reserveren.' : '')}>
                        {DAMAGE_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                      {blocking && (
                        <button disabled={busy === d.id} className={`${secondaryCls} ${actionCls}`}
                          onClick={() => { if (confirm('De blokkade opheffen? De wagen kan dan weer gereserveerd worden, ook al is de schade niet hersteld.')) act(d.id, () => send(`/api/poolwagens/damage/${d.id}/lift-block`, 'POST'), 'Blokkade opgeheven.') }}>
                          <Unlock size={13} /> Blokkade opheffen
                        </button>
                      )}
                      <span className={`md:ml-auto inline-flex items-center gap-1 text-xs ${d.mail_status === 'verstuurd' ? 'text-emerald-400' : 'text-amber-300'}`}
                        title={d.mail_error ?? undefined}>
                        {d.mail_status === 'verstuurd' ? <MailCheck size={13} /> : <MailWarning size={13} />}
                        {d.mail_status ? MAIL_LABEL[d.mail_status] : 'Mail nog niet verstuurd'}
                      </span>
                      {d.mail_status !== 'verstuurd' && (
                        <button disabled={busy === d.id} className={`${secondaryCls} ${actionCls}`}
                          onClick={() => act(d.id, () => send(`/api/poolwagens/damage/${d.id}/notify`, 'POST'))}>
                          {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : null} Opnieuw versturen
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>

      {reporting && (
        <DamageDialog cars={cars.filter(c => !c.archived_at)} carId={car || cars.find(c => !c.archived_at)?.id || ''} reservationId={null}
          onClose={() => setReporting(false)} onSaved={msg => { setReporting(false); setNotice(newNotice(msg)); setReload(r => r + 1) }} />
      )}
    </div>
  )
}
