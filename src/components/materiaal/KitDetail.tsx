'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Loader2, Package, UserRound } from 'lucide-react'
import { ErrorLine, StatusBadge, send } from '@/components/materiaal/ui'
import { effectiveResponsible, responsibleLabel, responsibleName, RESPONSIBLE_NOTICE } from '@/lib/gear/responsible'
import type { GearCatalog } from '@/lib/gear/types'
import type { GearAccess } from '@/lib/gear/access'

// Een kit: wat erin zit (in volgorde), de toestand van elk onderdeel, en de
// verantwoordelijke. Samenstellen gebeurt in Beheer.
export default function KitDetail({ kitId, access }: { kitId: string; access: GearAccess }) {
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET').then(setCatalog).catch(e => setError(e.message))
  }, [])

  const kit = catalog?.kits.find(k => k.id === kitId)
  if (!catalog) return <div className="p-8">{error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={20} className="animate-spin text-zinc-600" />}</div>
  if (!kit) return <div className="p-8"><ErrorLine>Deze kit bestaat niet (meer).</ErrorLine></div>

  const category = catalog.categories.find(c => c.id === kit.category_id)
  const clients = new Map(catalog.clients.map(c => [c.id, c]))
  const items = new Map(catalog.items.map(i => [i.id, i]))
  const resp = responsibleName(kit, clients)
  const parts = kit.item_ids.map(id => items.get(id)).filter(Boolean) as GearCatalog['items']

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/materiaal" className="hover:text-zinc-300">Materiaal</Link>
          <ChevronRight size={14} /><span>{category?.name}</span>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: category?.color }}>{category?.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Package size={16} className="text-zinc-500" />
            <h1 className="text-lg font-semibold text-zinc-100">{kit.name}</h1>
            <span className="text-sm text-zinc-500">{parts.length} onderdelen</span>
            {kit.label_color && <span className="text-xs text-zinc-500">· label {kit.label_color}</span>}
          </div>
          {kit.notes && <p className="mt-1 text-sm text-zinc-400">{kit.notes}</p>}
        </div>

        {kit.warning && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />{kit.warning}
          </div>
        )}
        {resp && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
            <UserRound size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
            <span>{RESPONSIBLE_NOTICE}<br /><strong className="font-medium">{responsibleLabel({ name: resp, viaKit: null })}</strong></span>
          </div>
        )}

        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="section-label">Onderdelen</p>
            {access.manageCatalog && <Link href={`/materiaal/beheer?kit=${kit.id}`} className="text-xs text-zinc-500 underline hover:text-zinc-300">Samenstellen in Beheer</Link>}
          </div>
          {parts.length === 0 ? <p className="text-sm text-zinc-600">Deze kit is leeg.</p> : (
            <ul className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/80">
              {parts.map(p => {
                const own = effectiveResponsible(p, null, clients)
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <Link href={`/materiaal/item/${p.id}`} className="text-zinc-200 hover:underline">{p.name}</Link>
                    {p.serial_number && <span className="text-xs text-zinc-500">S/N {p.serial_number}</span>}
                    {p.status !== 'ok' && <StatusBadge status={p.status} />}
                    {p.status_note && p.status !== 'ok' && <span className="text-xs text-zinc-500">{p.status_note}</span>}
                    {own && <span className="text-xs text-amber-300">{responsibleLabel(own)}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
