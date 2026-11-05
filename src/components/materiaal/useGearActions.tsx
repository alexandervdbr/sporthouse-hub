'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import MoveDialog, { type MovePreview, type MovePreviewEntry } from '@/components/materiaal/MoveDialog'
import Toast, { type ToastData } from '@/components/materiaal/Toast'
import { send } from '@/components/materiaal/ui'
import { invertPlan, touchesBookings, undoLeftovers, type Plan, type Step } from '@/lib/gear/inventory'
import { kitByItem } from '@/lib/gear/kits'
import type { GearCatalog, GearCategoryRestore, GearCategorySnapshot, GearMoveEffect, GearMoveResult } from '@/lib/gear/types'

// Elke verhuis (slepen, "Verplaats naar…", bulk) loopt hierlangs:
// 1. raakt hij komende boekingen? dan eerst het venster met wat er gebeurt;
// 2. de stappen, elk via een bestaande API-route;
// 3. de catalogus opnieuw laden;
// 4. een melding "Verplaatst naar … · Ongedaan maken" (±8 s).
// Ongedaan maken draait de verhuis terug zonder de boekingen nog eens aan te
// passen, en noemt de boekingen die zo blijven.

let toastId = 0

export function useGearActions({ catalog, reload, onError }: {
  catalog: GearCatalog | null
  reload: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [dialog, setDialog] = useState<{ title: string; entries: MovePreviewEntry[]; resolve: (update: boolean | null) => void } | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState(false)
  // De catalogus van dit moment, voor callbacks die later lopen (ongedaan maken).
  const catalogRef = useRef(catalog)
  useEffect(() => { catalogRef.current = catalog }, [catalog])

  /**
   * De stappen na elkaar, elk één bestaande API-aanroep. Geeft terug welke
   * boekingen bijgewerkt werden en welke niet (met reden).
   */
  const execute = useCallback(async (steps: Step[], cat: GearCatalog) => {
    const updated: GearMoveEffect[] = []
    const failed: GearMoveEffect[] = []
    // De DELETE-route maakt het item los, ongeacht welke kit in het pad staat;
    // we geven de huidige kit mee voor de leesbaarheid.
    const kitOf = kitByItem(cat.kits)
    for (const s of steps) {
      switch (s.op) {
        case 'move': {
          const res = s.toKitId
            ? await send<GearMoveResult>(`/api/materiaal/kits/${s.toKitId}/members`, 'POST', { item_id: s.itemId, update_bookings: s.updateBookings })
            : await send<GearMoveResult>(`/api/materiaal/kits/${kitOf.get(s.itemId)?.id ?? 'los'}/members`, 'DELETE', { item_id: s.itemId, update_bookings: s.updateBookings })
          updated.push(...res.updated)
          failed.push(...res.failed)
          break
        }
        case 'itemCategory': await send('/api/materiaal/items', 'PATCH', { id: s.itemId, category_id: s.categoryId }); break
        case 'kitCategory': await send('/api/materiaal/kits', 'PATCH', { id: s.kitId, category_id: s.categoryId }); break
        case 'categoryOrder': await send('/api/materiaal/categories', 'PATCH', { order: s.ids }); break
        case 'kitOrder': await send('/api/materiaal/kits', 'PATCH', { order: s.ids }); break
        case 'itemOrder': await send('/api/materiaal/items', 'PATCH', { order: s.ids }); break
        case 'partOrder': await send(`/api/materiaal/kits/${s.kitId}/members`, 'PATCH', { order: s.ids }); break
      }
    }
    return { updated, failed }
  }, [])

  /** Een plan uitvoeren, met voorvertoning, melding en ongedaan maken. */
  const run = useCallback(async (plan: Plan | null) => {
    const cat = catalogRef.current
    if (!plan || !cat) return
    onError('')
    const kitOf = kitByItem(cat.kits)
    const name = (id: string) => plan.names?.[id] ?? cat.items.find(i => i.id === id)?.name ?? 'Onderdeel'
    const kitName = (id: string | null) => (id ? cat.kits.find(k => k.id === id)?.name ?? 'kit' : null)

    // 1. Voorvertoning voor elke verhuis die boekingen kan raken.
    let steps = plan.steps
    const moves = steps.filter(touchesBookings)
    if (moves.length) {
      setBusy(true)
      let entries: MovePreviewEntry[]
      try {
        entries = await Promise.all(moves.map(async m => {
          const preview = await send<MovePreview>(`/api/materiaal/kits/move-preview?item_id=${m.itemId}&to_kit_id=${m.toKitId ?? ''}`, 'GET')
          return { itemName: name(m.itemId), fromName: kitName(kitOf.get(m.itemId)?.id ?? null), toName: kitName(m.toKitId), preview }
        }))
      } catch (e) { setBusy(false); onError(e instanceof Error ? e.message : 'Voorvertoning mislukt.'); return }
      setBusy(false)
      const affected = entries.filter(e => e.preview.remove.length + e.preview.add.length > 0)
      if (affected.length) {
        const update = await new Promise<boolean | null>(resolve => setDialog({
          title: moves.length === 1 ? `${affected[0].itemName} naar ${plan.target}` : `${moves.length} items naar ${plan.target}`,
          entries: affected, resolve,
        }))
        setDialog(null)
        if (update === null) return
        steps = steps.map(s => (s.op === 'move' ? { ...s, updateBookings: update } : s))
      }
    }

    // 2–4. Uitvoeren, herladen, melden.
    setBusy(true)
    let updated: GearMoveEffect[] = [], failed: GearMoveEffect[] = []
    try { ({ updated, failed } = await execute(steps, cat)) }
    catch (e) { onError(e instanceof Error ? e.message : 'Verplaatsen mislukt.') }
    await reload()
    setBusy(false)
    const inverse = invertPlan(cat, steps)
    setToast({
      id: ++toastId,
      message: `${plan.verb ?? 'Verplaatst naar'} ${plan.target}${updated.length ? ` · ${updated.length} ${updated.length === 1 ? 'boeking' : 'boekingen'} bijgewerkt` : ''}`,
      details: failed.map(f => `Niet bijgewerkt: ${f.label ?? 'boeking'} (${f.start_date}${f.end_date !== f.start_date ? ` – ${f.end_date}` : ''}) — ${f.reason}`),
      tone: failed.length ? 'warn' : 'info',
      action: {
        label: 'Ongedaan maken',
        onClick: async () => {
          setToast(null)
          setBusy(true)
          // De kit-ligging van ná de verhuis, zodat "los maken" de juiste kit ziet.
          try { await execute(inverse, catalogRef.current ?? cat) }
          catch (e) { onError(e instanceof Error ? e.message : 'Ongedaan maken mislukt.') }
          await reload()
          setBusy(false)
          const leftovers = undoLeftovers(updated)
          setToast({
            id: ++toastId,
            message: leftovers.length ? 'Teruggezet. Deze boekingen zijn níet automatisch teruggedraaid — bekijk ze zelf:' : 'Teruggezet.',
            details: leftovers, tone: leftovers.length ? 'warn' : 'info', ms: 4000,
          })
        },
      },
    })
  }, [execute, reload, onError])

  /**
   * Een categorie verwijderen; de inhoud gaat naar `intoId`. Een fout gaat
   * terug naar het venster (dat blijft open). Daarna een melding met
   * "Ongedaan maken": dezelfde categorie terug, met wat er toen verhuisde.
   */
  const deleteCategory = useCallback(async (categoryId: string, intoId: string | null) => {
    const cat = catalogRef.current
    onError('')
    let snap: GearCategorySnapshot
    try { snap = await send<GearCategorySnapshot>('/api/materiaal/categories', 'DELETE', { id: categoryId, into: intoId }) }
    catch (e) { await reload(); throw e }
    await reload()
    const into = cat?.categories.find(c => c.id === intoId)?.name
    const moved = snap.kits.length + snap.items.length
    setToast({
      id: ++toastId,
      message: `${snap.category.name} verwijderd${moved && into ? ` · inhoud naar ${into}` : ''}`,
      action: {
        label: 'Ongedaan maken',
        onClick: async () => {
          setToast(null)
          setBusy(true)
          let res: GearCategoryRestore | null = null
          try { res = await send<GearCategoryRestore>('/api/materiaal/categories', 'POST', { restore: snap }) }
          catch (e) { onError(e instanceof Error ? e.message : 'Terugzetten mislukt.') }
          await reload()
          setBusy(false)
          if (res) setToast({
            id: ++toastId,
            message: res.skipped.length ? `${snap.category.name} teruggezet. Dit stond intussen elders en bleef daar:` : `${snap.category.name} teruggezet.`,
            details: res.skipped, tone: res.skipped.length ? 'warn' : 'info', ms: 4000,
          })
        },
      },
    })
  }, [reload, onError])

  const ui: ReactNode = (
    <>
      {dialog && <MoveDialog title={dialog.title} entries={dialog.entries} onCancel={() => dialog.resolve(null)} onConfirm={u => dialog.resolve(u)} />}
      {toast && <Toast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
    </>
  )

  return { run, deleteCategory, busy, ui, notify: (message: string, tone: 'info' | 'warn' = 'info') => setToast({ id: ++toastId, message, tone, ms: 4000 }) }
}
