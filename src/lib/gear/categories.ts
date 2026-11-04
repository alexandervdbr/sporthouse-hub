import type { GearCategory } from './types'

// Een categorie naar een andere plek slepen. Het raster toont niet alle
// categorieën (lege vallen weg, zoeken filtert), dus de verplaatsing gebeurt
// op de volledige lijst: wat niet in beeld is, behoudt zijn plek. Geeft de
// nieuwe volgorde terug met sort_order 1…n, of null als er niets verandert.
export function moveCategory(categories: GearCategory[], activeId: string, overId: string): GearCategory[] | null {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl'))
  const from = sorted.findIndex(c => c.id === activeId)
  const to = sorted.findIndex(c => c.id === overId)
  if (from < 0 || to < 0 || from === to) return null
  const [moved] = sorted.splice(from, 1)
  sorted.splice(to, 0, moved)
  return sorted.map((c, i) => ({ ...c, sort_order: i + 1 }))
}
