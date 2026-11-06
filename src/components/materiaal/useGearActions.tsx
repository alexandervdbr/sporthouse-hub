'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import MoveDialog, { type MovePreview, type MovePreviewEntry } from '@/components/materiaal/MoveDialog'
import Toast, { type ToastData } from '@/components/materiaal/Toast'
import { send } from '@/components/materiaal/ui'
import { invertPlan, touchesBookings, undoLeftovers, type Plan, type Step } from '@/lib/gear/inventory'
import { kitByItem } from '@/lib/gear/kits'
import { STATUS_LABEL, type UnitStatus } from '@/lib/gear/status'
import type { GearCatalog, GearCategoryRestore, GearCategorySnapshot, GearItem, GearMoveEffect, GearMoveResult } from '@/lib/gear/types'
import { dropEntry, emptyStacks, isTextTarget, isUndoShortcut, markUndone, pushEntry, takeRedo, takeUndo, type UndoEntry, type UndoStacks } from '@/lib/gear/undo'

// Elke verhuis (slepen, "Verplaats naar…", bulk) loopt hierlangs:
// 1. raakt hij komende boekingen? dan eerst het venster met wat er gebeurt;
// 2. de stappen, elk via een bestaande API-route;
// 3. de catalogus opnieuw laden;
// 4. een melding "Verplaatst naar … · Ongedaan maken" (±8 s).
// Ongedaan maken draait de verhuis terug zonder de boekingen nog eens aan te
// passen, en noemt de boekingen die zo blijven.
//
// Elke ordeningsactie (verhuis, volgorde, categorie verwijderen, kit
// opheffen, status) komt ook op een stapel: Ctrl+Z / Cmd+Z maakt de laatste
// ongedaan, Ctrl+Shift+Z / Cmd+Shift+Z doet ze opnieuw. Niet in een tekstveld
// en niet als er een venster open staat. Boekingen komen er nooit op, en
// opnieuw doen past boekingen nooit aan.

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
  const stacks = useRef<UndoStacks>(emptyStacks())
  const busyRef = useRef(false)

  const record = useCallback((e: UndoEntry) => { stacks.current = pushEntry(stacks.current, e) }, [])

  /** Eén actie terugdraaien of opnieuw doen; bij een fout verdwijnt ze van de stapel. */
  const replay = useCallback(async (entry: UndoEntry, dir: 'undo' | 'redo') => {
    busyRef.current = true
    setBusy(true)
    try { await entry[dir]() }
    catch (e) {
      stacks.current = dropEntry(stacks.current, entry)
      onError(e instanceof Error ? e.message : dir === 'undo' ? 'Ongedaan maken mislukt.' : 'Opnieuw doen mislukt.')
      return false
    } finally {
      await reload()
      busyRef.current = false
      setBusy(false)
    }
    return true
  }, [reload, onError])

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const dir = isUndoShortcut(e)
      if (!dir || isTextTarget(e.target as HTMLElement | null) || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      if (busyRef.current) return
      const taken = dir === 'undo' ? takeUndo(stacks.current) : takeRedo(stacks.current)
      if (!taken) {
        setToast({ id: ++toastId, message: dir === 'undo' ? 'Niets meer om ongedaan te maken.' : 'Niets om opnieuw te doen.', ms: 2500 })
        return
      }
      stacks.current = taken.next
      setToast(null)
      if (await replay(taken.entry, dir)) {
        // Een waarschuwing van de actie zelf (boekingen die zo blijven) gaat voor.
        setToast(t => t ?? { id: ++toastId, message: `${dir === 'undo' ? 'Ongedaan' : 'Opnieuw'}: ${taken.entry.label}`, ms: 4000 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replay])

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

  /** "Ongedaan maken" in een melding: zelfde als Ctrl+Z, voor die ene actie. */
  const undoFromToast = useCallback(async (entry: UndoEntry, done: string) => {
    setToast(null)
    stacks.current = markUndone(stacks.current, entry)
    if (await replay(entry, 'undo')) setToast(t => t ?? { id: ++toastId, message: done, ms: 4000 })
  }, [replay])

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
    const label = `${plan.verb ?? 'Verplaatst naar'} ${plan.target}`
    const entry: UndoEntry = {
      label,
      // De kit-ligging van ná de verhuis, zodat "los maken" de juiste kit ziet.
      undo: async () => {
        await execute(inverse, catalogRef.current ?? cat)
        const leftovers = undoLeftovers(updated)
        // Boekingen die bij de verhuis meegingen, blijven zo: dat zeggen we, en dat moet je lezen.
        if (leftovers.length) setTimeout(() => setToast({
          id: ++toastId, message: 'Teruggezet. Deze boekingen zijn níet automatisch teruggedraaid — bekijk ze zelf:', details: leftovers, tone: 'warn',
        }), 0)
      },
      // Opnieuw doen raakt de boekingen niet meer aan.
      redo: async () => { await execute(steps.map(s => (s.op === 'move' ? { ...s, updateBookings: false } : s)), catalogRef.current ?? cat) },
    }
    record(entry)
    setToast({
      id: ++toastId,
      message: `${label}${updated.length ? ` · ${updated.length} ${updated.length === 1 ? 'boeking' : 'boekingen'} bijgewerkt` : ''}`,
      details: failed.map(f => `Niet bijgewerkt: ${f.label ?? 'boeking'} (${f.start_date}${f.end_date !== f.start_date ? ` – ${f.end_date}` : ''}) — ${f.reason}`),
      tone: failed.length ? 'warn' : 'info',
      action: { label: 'Ongedaan maken', onClick: () => undoFromToast(entry, 'Teruggezet.') },
    })
  }, [execute, reload, onError, record, undoFromToast])

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
    const name = snap.category.name
    const entry: UndoEntry = {
      label: `${name} verwijderd`,
      undo: async () => {
        const res = await send<GearCategoryRestore>('/api/materiaal/categories', 'POST', { restore: snap })
        if (res.skipped.length) setTimeout(() => setToast({
          id: ++toastId, message: `${name} teruggezet. Dit stond intussen elders en bleef daar:`, details: res.skipped, tone: 'warn',
        }), 0)
      },
      // Opnieuw verwijderen geeft een nieuwe momentopname, voor de volgende keer ongedaan maken.
      redo: async () => { snap = await send<GearCategorySnapshot>('/api/materiaal/categories', 'DELETE', { id: categoryId, into: intoId }) },
    }
    record(entry)
    setToast({
      id: ++toastId,
      message: `${name} verwijderd${moved && into ? ` · inhoud naar ${into}` : ''}`,
      action: { label: 'Ongedaan maken', onClick: () => undoFromToast(entry, `${name} teruggezet.`) },
    })
  }, [reload, onError, record, undoFromToast])

  /** Een kit opheffen; ongedaan maken zet hem terug met de onderdelen van toen. */
  const dissolveKit = useCallback(async (kitId: string, kitName: string) => {
    onError('')
    await send(`/api/materiaal/kits/${kitId}/dissolve`, 'POST')
    await reload()
    const entry: UndoEntry = {
      label: `${kitName} opgeheven`,
      undo: async () => {
        const res = await send<{ skipped: string[] }>(`/api/materiaal/kits/${kitId}/restore`, 'POST')
        if (res.skipped.length) setTimeout(() => setToast({
          id: ++toastId, message: `${kitName} teruggezet. Dit zit intussen in een andere kit en bleef daar:`, details: res.skipped, tone: 'warn',
        }), 0)
      },
      redo: async () => { await send(`/api/materiaal/kits/${kitId}/dissolve`, 'POST') },
    }
    record(entry)
    setToast({ id: ++toastId, message: `${kitName} opgeheven`, action: { label: 'Ongedaan maken', onClick: () => undoFromToast(entry, `${kitName} teruggezet.`) } })
  }, [reload, onError, record, undoFromToast])

  /** Status van een item zetten; ongedaan maken zet de vorige status en notitie terug. */
  const setItemStatus = useCallback(async (item: GearItem, status: UnitStatus, note: string) => {
    const before = { status: item.status, note: item.status_note ?? '' }
    const post = (s: UnitStatus, n: string) => send<{ id: string; status: UnitStatus; status_note: string | null }>(`/api/materiaal/items/${item.id}/status`, 'POST', { status: s, note: n })
    const updated = await post(status, note)
    record({
      label: `${item.name}: ${STATUS_LABEL[status].toLowerCase()}`,
      undo: async () => { await post(before.status, before.note) },
      redo: async () => { await post(status, note) },
    })
    return updated
  }, [record])

  const ui: ReactNode = (
    <>
      {dialog && <MoveDialog title={dialog.title} entries={dialog.entries} onCancel={() => dialog.resolve(null)} onConfirm={u => dialog.resolve(u)} />}
      {toast && <Toast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
    </>
  )

  return { run, deleteCategory, dissolveKit, setItemStatus, record, busy, ui, notify: (message: string, tone: 'info' | 'warn' = 'info') => setToast({ id: ++toastId, message, tone, ms: 4000 }) }
}
