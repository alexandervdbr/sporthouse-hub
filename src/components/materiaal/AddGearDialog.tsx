'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'
import type { AddPrefill, PanelTarget } from '@/components/materiaal/GearPanel'
import { ColorDots, ErrorLine, PALETTE, PrimaryButton, inputCls, labelCls, send } from '@/components/materiaal/ui'
import { normalizeSerial, serialDuplicates } from '@/lib/gear/inventory'
import { planNumbering } from '@/lib/gear/naming'
import type { GearCatalog, GearCategory, GearItem, GearKit } from '@/lib/gear/types'

// "+ Toevoegen": één item, meerdere identieke items (model + aantal, genummerd),
// een kit of een categorie. Gestart vanuit een categorie of kit staat die al
// ingevuld. Een nieuw item in een kit is hetzelfde als erin verplaatsen: met
// het venster voor komende boekingen van die kit en "Ongedaan maken"
// (onAddToKit). Serienummers zijn optioneel; een dubbel geeft een
// waarschuwing, maar houdt niets tegen.

type Mode = 'item' | 'many' | 'kit' | 'category'
const MODE_LABEL: Record<Mode, string> = { item: 'Item', many: 'Meerdere identieke', kit: 'Kit', category: 'Categorie' }

export default function AddGearDialog({ catalog, prefill, onClose, onCreated, onAddToKit }: {
  catalog: GearCatalog
  prefill: AddPrefill
  onClose: () => void
  onCreated: (t: PanelTarget | null) => Promise<void>
  /** Nieuwe items in een kit zetten, als verhuis (venster + ongedaan maken). */
  onAddToKit: (items: { id: string; name: string }[], kit: { id: string; name: string }) => Promise<void>
}) {
  const kitCategory = prefill.kitId ? catalog.kits.find(k => k.id === prefill.kitId)?.category_id : undefined
  const [mode, setMode] = useState<Mode>(prefill.mode ?? 'item')
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [count, setCount] = useState('2')
  const [categoryId, setCategoryId] = useState(prefill.categoryId ?? kitCategory ?? catalog.categories[0]?.id ?? '')
  const [kitId, setKitId] = useState(prefill.kitId ?? '')
  const [color, setColor] = useState(PALETTE[0])
  const [serial, setSerial] = useState('')
  // Bij "meerdere identieke": één serienummer per nummer (#n), op naam.
  const [serials, setSerials] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const models = [...new Set(catalog.items.map(i => i.model).filter((m): m is string => !!m))].sort()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Dezelfde nummering als de server straks geeft, om per item een
  // serienummer te kunnen ingeven.
  const planned = useMemo(() => {
    const n = Number(count)
    if (mode !== 'many' || !model.trim() || !Number.isInteger(n) || n < 1 || n > 50) return []
    return planNumbering(model, catalog.items.map(i => i.name), n).names
  }, [mode, model, count, catalog.items])

  const valid = mode === 'many' ? !!model.trim() && Number(count) >= 1 && !!categoryId : !!name.trim() && (mode === 'category' || !!categoryId)

  // Serienummers op de pas aangemaakte items zetten (bestaande route).
  async function saveSerials(items: GearItem[], byName: (name: string) => string) {
    for (const i of items) {
      const sn = byName(i.name).trim()
      if (sn) await send('/api/materiaal/items', 'PATCH', { id: i.id, serial_number: sn })
    }
  }

  async function submit() {
    setBusy(true); setError('')
    try {
      let target: PanelTarget | null = null
      const kit = kitId ? catalog.kits.find(k => k.id === kitId) : undefined
      let created: GearItem[] = []
      if (mode === 'item') {
        created = await send<GearItem[]>('/api/materiaal/items', 'POST', { category_id: categoryId, name, serial_number: serial })
        target = { type: 'item', id: created[0].id }
      } else if (mode === 'many') {
        created = await send<GearItem[]>('/api/materiaal/items', 'POST', { category_id: categoryId, model, count })
        await saveSerials(created, n => serials[n] ?? '')
        target = kit ? { type: 'kit', id: kit.id } : { type: 'category', id: categoryId }
      } else if (mode === 'kit') {
        const created = await send<GearKit>('/api/materiaal/kits', 'POST', { name, category_id: categoryId })
        target = { type: 'kit', id: created.id }
      } else {
        const created = await send<GearCategory>('/api/materiaal/categories', 'POST', { name, color })
        target = { type: 'category', id: created.id }
      }
      await onCreated(target)
      // In een kit: als verhuis, zodat komende boekingen van de kit meekunnen.
      if (kit && created.length) await onAddToKit(created.map(c => ({ id: c.id, name: c.name })), { id: kit.id, name: kit.name })
    } catch (e) { setError(e instanceof Error ? e.message : 'Toevoegen mislukt.') }
    setBusy(false)
  }

  const categorySelect = (
    <label className="block">
      <span className={labelCls}>Categorie</span>
      <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
        {catalog.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  )
  const kitSelect = (
    <label className="block">
      <span className={labelCls}>In kit (optioneel)</span>
      <select value={kitId} onChange={e => { setKitId(e.target.value); const k = catalog.kits.find(x => x.id === e.target.value); if (k) setCategoryId(k.category_id) }} className={inputCls}>
        <option value="">— Los —</option>
        {catalog.kits.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
      </select>
    </label>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="add-title" className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 id="add-title" className="text-sm font-semibold text-zinc-100">Toevoegen</h2>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-500 hover:text-zinc-200"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800" role="tablist">
            {(Object.keys(MODE_LABEL) as Mode[]).map(m => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium ${mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          {mode === 'many' ? (
            <>
              <div className="flex gap-2">
                <label className="block flex-1"><span className={labelCls}>Model</span>
                  <input autoFocus value={model} onChange={e => setModel(e.target.value)} list="add-models" placeholder="bv. Sony batterij" className={inputCls} />
                </label>
                <label className="block w-20"><span className={labelCls}>Aantal</span>
                  <input type="number" min={1} max={50} value={count} onChange={e => setCount(e.target.value)} className={inputCls} />
                </label>
              </div>
              <datalist id="add-models">{models.map(m => <option key={m} value={m} />)}</datalist>
              {planned.length > 0 && (
                <div>
                  <span className={labelCls}>Serienummers (optioneel)</span>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {planned.map(p => (
                      <div key={p.name}>
                        <div className="flex items-center gap-2">
                          <span className="w-40 flex-shrink-0 text-xs text-zinc-300 truncate">{p.name}</span>
                          <input value={serials[p.name] ?? ''} onChange={e => setSerials(prev => ({ ...prev, [p.name]: e.target.value }))}
                            aria-label={`Serienummer ${p.name}`} placeholder="S/N" className={`${inputCls} py-1.5`} />
                        </div>
                        <SerialWarning catalog={catalog} serial={serials[p.name]}
                          alsoIn={planned.filter(o => o.name !== p.name && normalizeSerial(serials[o.name]) === normalizeSerial(serials[p.name])).map(o => o.name)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {categorySelect}{kitSelect}
            </>
          ) : (
            <>
              <label className="block"><span className={labelCls}>Naam</span>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && valid) submit() }}
                  placeholder={mode === 'kit' ? 'bv. FX3 D' : mode === 'category' ? 'bv. AUDIO' : 'bv. Monitor Atomos Ninja'} className={inputCls} />
              </label>
              {mode === 'item' && (
                <label className="block"><span className={labelCls}>Serienummer (optioneel)</span>
                  <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="van de fabrikant" className={inputCls} />
                  <SerialWarning catalog={catalog} serial={serial} />
                </label>
              )}
              {mode !== 'category' && categorySelect}
              {mode === 'item' && kitSelect}
              {mode === 'category' && <div><span className={labelCls}>Kleur</span><ColorDots value={color} onChange={setColor} /></div>}
            </>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300">Annuleren</button>
          <PrimaryButton onClick={submit} busy={busy} disabled={!valid}>Toevoegen</PrimaryButton>
        </div>
      </div>
    </div>
  )
}

/** Waarschuwing bij een serienummer dat al bestaat (blokkeert niet). */
export function SerialWarning({ catalog, serial, exceptItemId, alsoIn = [], onOpen }: {
  catalog: GearCatalog
  serial: string | null | undefined
  exceptItemId?: string
  /** Andere rijen in hetzelfde formulier met hetzelfde nummer. */
  alsoIn?: string[]
  /** In het zijpaneel: het andere item daar openen in plaats van naar de pagina te gaan. */
  onOpen?: (itemId: string) => void
}) {
  const dups = serialDuplicates(catalog, serial, exceptItemId)
  if (!dups.length && !alsoIn.length) return null
  return (
    <p className="mt-1 text-[11px] text-amber-300 flex flex-wrap items-center gap-x-1">
      <AlertTriangle size={10} className="flex-shrink-0" /> Dit serienummer staat al bij
      {dups.map((d, i) => (
        <span key={d.id}>
          {onOpen
            ? <button type="button" onClick={() => onOpen(d.id)} className="underline hover:text-amber-100">{d.name}</button>
            : <Link href={`/materiaal/item/${d.id}`} target="_blank" rel="noopener" className="underline hover:text-amber-100">{d.name}</Link>}
          {i < dups.length - 1 || alsoIn.length ? ',' : ''}
        </span>
      ))}
      {alsoIn.length > 0 && <span>{alsoIn.join(', ')} (hier)</span>}
      <span className="text-amber-300/70">— opslaan kan wel.</span>
    </p>
  )
}
