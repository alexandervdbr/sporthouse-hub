// Categorieën in Wachtwoorden (migratie 0089). De pagina toont logins
// altijd gegroepeerd per categorie, nooit als één lange lijst.

export interface CredentialCategory {
  id: string
  name: string
  sort_order: number
}

export interface CategoryGroup<T> {
  // null = "Zonder categorie"
  id: string | null
  name: string
  items: T[]
}

export const UNCATEGORIZED_LABEL = 'Zonder categorie'

export function sortCategories<C extends CredentialCategory>(categories: C[]): C[] {
  return [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl'))
}

// Groepen in de ingestelde volgorde, "Zonder categorie" altijd onderaan.
// Lege groepen vallen weg. Een login met een categorie die (net) niet meer
// bestaat, valt onder "Zonder categorie" in plaats van te verdwijnen.
export function groupByCategory<T extends { category_id: string | null; platform: string }>(
  items: T[],
  categories: CredentialCategory[],
): CategoryGroup<T>[] {
  const byPlatform = (a: T, b: T) => a.platform.localeCompare(b.platform, 'nl')
  const known = new Set(categories.map(c => c.id))

  const groups: CategoryGroup<T>[] = sortCategories(categories).map(cat => ({
    id: cat.id,
    name: cat.name,
    items: items.filter(i => i.category_id === cat.id).sort(byPlatform),
  }))
  groups.push({
    id: null,
    name: UNCATEGORIZED_LABEL,
    items: items.filter(i => !i.category_id || !known.has(i.category_id)).sort(byPlatform),
  })
  return groups.filter(g => g.items.length > 0)
}

// Nieuwe volgorde na een categorie één plaats omhoog/omlaag te schuiven.
// Geeft alleen de rijen terug waarvan sort_order echt verandert.
export function moveCategory(categories: CredentialCategory[], id: string, direction: -1 | 1): { id: string; sort_order: number }[] {
  const ordered = sortCategories(categories)
  const from = ordered.findIndex(c => c.id === id)
  const to = from + direction
  if (from === -1 || to < 0 || to >= ordered.length) return []
  ;[ordered[from], ordered[to]] = [ordered[to], ordered[from]]
  return ordered
    .map((c, index) => ({ id: c.id, sort_order: index, changed: c.sort_order !== index }))
    .filter(c => c.changed)
    .map(({ id, sort_order }) => ({ id, sort_order }))
}
