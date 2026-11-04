'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'
import type { AddPrefill, PanelTarget } from '@/components/materiaal/GearPanel'
import { Button, ColorDots, ComboInput, ErrorLine, Field, IconButton, PALETTE, Segmented, Select, formGap, inputCls, labelCls, send } from '@/components/materiaal/ui'
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
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'item', label: 'Item' }, { value: 'many', label: 'Meerdere' }, { value: 'kit', label: 'Kit' }, { value: 'category', label: 'Categorie' },
]

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
  // Bij "meerdere identieke": één serienummer per rij, in volgorde (#1, #2, …).
  const [serials, setSerials] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const models = [...new Set(catalog.items.map(i => i.model).filter((m): m is string => !!m))].sort()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Eén rij per item, zodra het aantal klopt. Met een model: dezelfde
  // nummering als de server straks geeft (verder op wat er al is). Zonder
  // model nog voorlopige nummers; de echte volgen zodra je het model typt.
  const rows = useMemo(() => {
    const n = Number(count)
    if (mode !== 'many' || !Number.isInteger(n) || n < 1 || n > 50) return []
    if (!model.trim()) return Array.from({ length: n }, (_, i) => `#${i + 1}`)
    return planNumbering(model, catalog.items.map(i => i.name), n).names.map(x => x.name)
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
        // De server nummert in dezelfde volgorde als de rijen hier.
        await saveSerials(created, n => serials[rows.indexOf(n)] ?? '')
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
    <Field label="Categorie">
      <Select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
        {catalog.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
    </Field>
  )
  const kitSelect = (
    <Field label="In kit (optioneel)">
      <Select value={kitId} onChange={e => { setKitId(e.target.value); const k = catalog.kits.find(x => x.id === e.target.value); if (k) setCategoryId(k.category_id) }}>
        <option value="">— Los —</option>
        {catalog.kits.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
      </Select>
    </Field>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="add-title" className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
          <h2 id="add-title" className="text-sm font-semibold text-zinc-100">Toevoegen</h2>
          <IconButton label="Sluiten" onClick={onClose}><X size={15} /></IconButton>
        </div>
        <div className={`px-5 py-4 ${formGap}`}>
          <Segmented label="Wat toevoegen" value={mode} options={MODE_OPTIONS} onChange={setMode} />
          {mode === 'many' ? (
            <>
              <div className="grid grid-cols-[1fr_5.5rem] gap-3 items-end">
                <Field label="Model">
                  <ComboInput autoFocus value={model} onChange={e => setModel(e.target.value)} list="add-models" placeholder="bv. Sony batterij" />
                </Field>
                <Field label="Aantal">
                  <input type="number" min={1} max={50} value={count} onChange={e => setCount(e.target.value)} className={`${inputCls} tabular-nums`} />
                </Field>
              </div>
              <datalist id="add-models">{models.map(m => <option key={m} value={m} />)}</datalist>
              {rows.length > 0 && (
                <div>
                  <span className={labelCls}>Serienummers (optioneel)</span>
                  {!model.trim() && <p className="mb-1.5 text-[11px] text-zinc-500">De nummers (#n) volgen zodra je het model invult.</p>}
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {rows.map((label, i) => (
                      <div key={i}>
                        <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 items-center">
                          <span className="text-sm text-zinc-300 truncate" title={label}>{label}</span>
                          <input value={serials[i] ?? ''} onChange={e => setSerials(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                            aria-label={`Serienummer ${label}`} placeholder="S/N" className={inputCls} />
                        </div>
                        <SerialWarning catalog={catalog} serial={serials[i]}
                          alsoIn={rows.filter((_, j) => j !== i && normalizeSerial(serials[j]) && normalizeSerial(serials[j]) === normalizeSerial(serials[i]))} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 items-end">{categorySelect}{kitSelect}</div>
            </>
          ) : (
            <>
              <Field label="Naam">
                <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && valid) submit() }}
                  placeholder={mode === 'kit' ? 'bv. FX3 D' : mode === 'category' ? 'bv. AUDIO' : 'bv. Monitor Atomos Ninja'} className={inputCls} />
              </Field>
              {mode === 'item' && (
                <Field label="Serienummer (optioneel)">
                  <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="van de fabrikant" className={inputCls} />
                  <SerialWarning catalog={catalog} serial={serial} />
                </Field>
              )}
              {mode === 'item' && <div className="grid grid-cols-2 gap-3 items-end">{categorySelect}{kitSelect}</div>}
              {mode === 'kit' && categorySelect}
              {mode === 'category' && <div><span className={labelCls}>Kleur</span><ColorDots value={color} onChange={setColor} /></div>}
            </>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
          <Button variant="text" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={submit} busy={busy} disabled={!valid}>Toevoegen</Button>
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
