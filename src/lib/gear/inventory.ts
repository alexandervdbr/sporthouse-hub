import { kitByItem } from './kits'
import { effectiveResponsible } from './responsible'
import type { GearCatalog, GearCategory, GearItem, GearKit, GearMoveEffect } from './types'

// Het voorraadscherm (/materiaal/beheer): dezelfde opbouw als de planner
// (categorie → kits → onderdelen, plus losse items), met zoeken en filters.
// Daarnaast: wat een sleep betekent (dropregels) en hoe je hem ongedaan maakt.
// Alles hier is puur; het scherm voert de stappen uit via de bestaande API.

// ─── Boom ────────────────────────────────────────────────────────────────────

export interface InventoryKit {
  kit: GearKit
  parts: GearItem[]
}

export interface InventoryCategory {
  category: GearCategory
  kits: InventoryKit[]
  loose: GearItem[]
}

export interface InventoryFilters {
  search?: string
  /** Alleen items die defect, beperkt of uit dienst zijn. */
  problems?: boolean
  /** Alleen losse items. */
  notInKit?: boolean
  /** Alleen materiaal met een verantwoordelijke (eigen of via de kit). */
  withResponsible?: boolean
}

const byOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl')

export function isFiltering(f: InventoryFilters): boolean {
  return !!(f.search?.trim() || f.problems || f.notInKit || f.withResponsible)
}

/**
 * De boom, gefilterd. Zonder zoeken of filter: alle categorieën, ook lege. Met:
 * alleen wat overblijft. Een kit blijft staan met al zijn onderdelen als de kit
 * zelf matcht, en anders met alleen de onderdelen die matchen.
 */
export function buildInventory(catalog: GearCatalog, f: InventoryFilters = {}): InventoryCategory[] {
  const q = f.search?.trim().toLowerCase() ?? ''
  const items = new Map(catalog.items.map(i => [i.id, i]))
  const kitOf = kitByItem(catalog.kits)
  const clients = new Map(catalog.clients.map(c => [c.id, c]))
  const filtering = isFiltering(f)

  const textMatch = (i: GearItem) => !q
    || [i.name, i.model, i.serial_number, kitOf.get(i.id)?.name].some(v => (v ?? '').toLowerCase().includes(q))
  const itemPasses = (i: GearItem) => textMatch(i)
    && (!f.problems || i.status !== 'ok')
    && (!f.withResponsible || !!effectiveResponsible(i, kitOf.get(i.id) ?? null, clients))

  return [...catalog.categories].sort(byOrder).map(category => {
    const kits = f.notInKit ? [] : catalog.kits
      .filter(k => k.category_id === category.id)
      .sort(byOrder)
      .map(kit => {
        const parts = kit.item_ids.map(id => items.get(id)).filter((i): i is GearItem => !!i)
        if (!filtering) return { kit, parts }
        const kitItself = (!q || kit.name.toLowerCase().includes(q)) && !f.problems
          && (!f.withResponsible || !!effectiveResponsible({ responsible_client_id: null, responsible_user_id: null, responsible_name: null }, kit, clients))
        return { kit, parts: kitItself ? parts : parts.filter(itemPasses) }
      })
      .filter(k => !filtering || k.parts.length > 0 || (q && k.kit.name.toLowerCase().includes(q) && !f.problems && !f.withResponsible))
    const loose = catalog.items
      .filter(i => i.category_id === category.id && !kitOf.has(i.id))
      .sort(byOrder)
      .filter(i => !filtering || itemPasses(i))
    return { category, kits, loose }
  }).filter(c => !filtering || c.kits.length > 0 || c.loose.length > 0)
}

// ─── Stappen ─────────────────────────────────────────────────────────────────
// Eén sleep of "Verplaats naar…" = een paar stappen, elk precies één bestaande
// API-aanroep.

export type Step =
  | { op: 'move'; itemId: string; toKitId: string | null; updateBookings: boolean }
  | { op: 'itemCategory'; itemId: string; categoryId: string }
  | { op: 'kitCategory'; kitId: string; categoryId: string }
  | { op: 'categoryOrder'; ids: string[] }
  | { op: 'kitOrder'; ids: string[] }
  | { op: 'itemOrder'; ids: string[] }
  | { op: 'partOrder'; kitId: string; ids: string[] }

export interface Plan {
  steps: Step[]
  /** Voor de melding: "Verplaatst naar FX3 B". */
  target: string
}

/** Wat je versleept, of waarop je loslaat. */
export type DragRef =
  | { type: 'category'; id: string }
  | { type: 'kit'; id: string }
  | { type: 'item'; id: string }

function moveInList(ids: string[], from: string, to: string): string[] | null {
  const a = ids.indexOf(from), b = ids.indexOf(to)
  if (a < 0 || b < 0 || a === b) return null
  const next = [...ids]
  next.splice(a, 1)
  next.splice(b, 0, from)
  return next
}

/**
 * Wat een sleep betekent. null = niets te doen.
 * - categorie op categorie: volgorde van de categorieën
 * - kit op een categorie (of iets daarin): de kit naar die categorie; binnen
 *   dezelfde categorie op een andere kit: volgorde van de kits
 * - onderdeel op een andere kit (of een onderdeel daarvan): verplaatsen
 * - onderdeel op een categorie of los item: uit de kit, los in die categorie
 * - los item op een kit (of een onderdeel daarvan): in die kit
 * - los item op een andere categorie (of iets daarin): naar die categorie;
 *   binnen dezelfde categorie op een ander los item: volgorde
 */
export function planDrop(catalog: GearCatalog, active: DragRef, over: DragRef): Plan | null {
  if (active.type === over.type && active.id === over.id) return null
  const kitOf = kitByItem(catalog.kits)
  const kit = (id: string) => catalog.kits.find(k => k.id === id)
  const item = (id: string) => catalog.items.find(i => i.id === id)
  const cat = (id: string) => catalog.categories.find(c => c.id === id)
  // De categorie waarin iets in de boom staat.
  const categoryOf = (r: DragRef): string | undefined =>
    r.type === 'category' ? r.id
    : r.type === 'kit' ? kit(r.id)?.category_id
    : kitOf.get(r.id)?.category_id ?? item(r.id)?.category_id

  if (active.type === 'category') {
    const to = categoryOf(over)
    if (!to) return null
    const ids = moveInList([...catalog.categories].sort(byOrder).map(c => c.id), active.id, to)
    return ids ? { steps: [{ op: 'categoryOrder', ids }], target: `plek van ${cat(to)?.name}` } : null
  }

  if (active.type === 'kit') {
    const k = kit(active.id), to = categoryOf(over)
    if (!k || !to) return null
    if (to !== k.category_id) return { steps: [{ op: 'kitCategory', kitId: k.id, categoryId: to }], target: cat(to)?.name ?? 'categorie' }
    if (over.type !== 'kit') return null
    const ids = moveInList(catalog.kits.filter(x => x.category_id === to).sort(byOrder).map(x => x.id), k.id, over.id)
    return ids ? { steps: [{ op: 'kitOrder', ids }], target: `plek van ${kit(over.id)?.name}` } : null
  }

  // Een item.
  const it = item(active.id)
  if (!it) return null
  const fromKit = kitOf.get(it.id) ?? null
  const toKit = over.type === 'kit' ? kit(over.id) ?? null : over.type === 'item' ? kitOf.get(over.id) ?? null : null

  if (toKit) {
    if (fromKit?.id === toKit.id) {
      if (over.type !== 'item') return null
      const ids = moveInList(toKit.item_ids, it.id, over.id)
      return ids ? { steps: [{ op: 'partOrder', kitId: toKit.id, ids }], target: `plek van ${item(over.id)?.name}` } : null
    }
    return { steps: [{ op: 'move', itemId: it.id, toKitId: toKit.id, updateBookings: true }], target: toKit.name }
  }

  // Op een categorie of een los item: het item wordt (of blijft) los.
  const to = categoryOf(over)
  if (!to) return null
  if (fromKit) {
    const steps: Step[] = [{ op: 'move', itemId: it.id, toKitId: null, updateBookings: true }]
    if (it.category_id !== to) steps.push({ op: 'itemCategory', itemId: it.id, categoryId: to })
    return { steps, target: `${cat(to)?.name} (los)` }
  }
  if (it.category_id !== to) return { steps: [{ op: 'itemCategory', itemId: it.id, categoryId: to }], target: cat(to)?.name ?? 'categorie' }
  if (over.type !== 'item') return null
  const loose = catalog.items.filter(x => x.category_id === to && !kitOf.has(x.id)).sort(byOrder).map(x => x.id)
  const ids = moveInList(loose, it.id, over.id)
  return ids ? { steps: [{ op: 'itemOrder', ids }], target: `plek van ${item(over.id)?.name}` } : null
}

/**
 * "Verplaats naar…" (zonder slepen, ook op de telefoon): naar een kit, of los
 * in een categorie.
 */
export function planMoveTo(catalog: GearCatalog, itemId: string, to: { kitId: string } | { categoryId: string }): Plan | null {
  return 'kitId' in to
    ? planDrop(catalog, { type: 'item', id: itemId }, { type: 'kit', id: to.kitId })
    : planDrop(catalog, { type: 'item', id: itemId }, { type: 'category', id: to.categoryId })
}

/** Een kit naar een andere categorie, of een plek omhoog/omlaag (telefoon/toetsenbord). */
export function planShift(catalog: GearCatalog, ref: DragRef, dir: -1 | 1): Plan | null {
  const kitOf = kitByItem(catalog.kits)
  const neighbour = (ids: string[], id: string) => ids[ids.indexOf(id) + dir]
  if (ref.type === 'category') {
    const ids = [...catalog.categories].sort(byOrder).map(c => c.id)
    const n = neighbour(ids, ref.id)
    return n ? planDrop(catalog, ref, { type: 'category', id: n }) : null
  }
  if (ref.type === 'kit') {
    const k = catalog.kits.find(x => x.id === ref.id)
    const ids = catalog.kits.filter(x => x.category_id === k?.category_id).sort(byOrder).map(x => x.id)
    const n = neighbour(ids, ref.id)
    return n ? planDrop(catalog, ref, { type: 'kit', id: n }) : null
  }
  const kit = kitOf.get(ref.id)
  const it = catalog.items.find(x => x.id === ref.id)
  const ids = kit ? kit.item_ids
    : catalog.items.filter(x => x.category_id === it?.category_id && !kitOf.has(x.id)).sort(byOrder).map(x => x.id)
  const n = neighbour(ids, ref.id)
  return n ? planDrop(catalog, ref, { type: 'item', id: n }) : null
}

// ─── Ongedaan maken ──────────────────────────────────────────────────────────

/**
 * De stappen die een plan terugdraaien, berekend uit de catalogus van vóór de
 * verhuis. Een verhuis gaat terug zónder de boekingen opnieuw aan te passen:
 * wat de verhuis aan komende boekingen veranderde, blijft staan en moet de
 * gebruiker zelf bekijken (zie undoLeftovers).
 */
export function invertPlan(before: GearCatalog, steps: Step[]): Step[] {
  const kitOf = kitByItem(before.kits)
  const out: Step[] = []
  for (const s of [...steps].reverse()) {
    switch (s.op) {
      case 'move': {
        const was = kitOf.get(s.itemId)
        out.push({ op: 'move', itemId: s.itemId, toKitId: was?.id ?? null, updateBookings: false })
        // Was het los en stond het in een kit-volgorde? Dan is er niets meer te doen;
        // de categorie van het item zelf verandert bij een verhuis niet.
        break
      }
      case 'itemCategory': {
        const was = before.items.find(i => i.id === s.itemId)
        if (was) out.push({ op: 'itemCategory', itemId: s.itemId, categoryId: was.category_id })
        break
      }
      case 'kitCategory': {
        const was = before.kits.find(k => k.id === s.kitId)
        if (was) out.push({ op: 'kitCategory', kitId: s.kitId, categoryId: was.category_id })
        break
      }
      case 'categoryOrder':
        out.push({ op: 'categoryOrder', ids: [...before.categories].sort(byOrder).map(c => c.id) })
        break
      case 'kitOrder': {
        const cat = before.kits.find(k => k.id === s.ids[0])?.category_id
        out.push({ op: 'kitOrder', ids: before.kits.filter(k => k.category_id === cat).sort(byOrder).map(k => k.id) })
        break
      }
      case 'itemOrder': {
        const cat = before.items.find(i => i.id === s.ids[0])?.category_id
        out.push({ op: 'itemOrder', ids: before.items.filter(i => i.category_id === cat && !kitOf.has(i.id)).sort(byOrder).map(i => i.id) })
        break
      }
      case 'partOrder':
        out.push({ op: 'partOrder', kitId: s.kitId, ids: before.kits.find(k => k.id === s.kitId)?.item_ids ?? s.ids })
        break
    }
  }
  return out
}

/**
 * Wat ongedaan maken níet terugdraait: de boekingen die de verhuis aanpaste.
 * Die blijven zoals ze nu zijn; de melding noemt ze, zodat niemand denkt dat
 * ze stilletjes terug zijn.
 */
export function undoLeftovers(updated: GearMoveEffect[]): string[] {
  return updated.map(e => {
    const days = e.end_date !== e.start_date ? `${e.start_date} – ${e.end_date}` : e.start_date
    const what = e.action === 'weggehaald' ? 'blijft zonder dit onderdeel' : 'houdt dit onderdeel'
    return `${e.label ?? 'Boeking'} (${days}) ${what}`
  })
}

/** Is dit een stap die boekingen kan raken (en dus eerst een voorvertoning nodig heeft)? */
export function touchesBookings(s: Step): s is Extract<Step, { op: 'move' }> {
  return s.op === 'move' && s.updateBookings
}
