import { describe, it, expect } from 'vitest'
import { groupByCategory, moveCategory, UNCATEGORIZED_LABEL } from '../credential-categories'

const cats = [
  { id: 'design', name: 'Design & stock', sort_order: 1 },
  { id: 'social', name: 'Social media', sort_order: 0 },
  { id: 'leeg', name: 'Leeg', sort_order: 2 },
]

const items = [
  { platform: 'Instagram', category_id: 'social' },
  { platform: 'Envato', category_id: 'design' },
  { platform: 'Facebook', category_id: 'social' },
  { platform: 'Zoom', category_id: null },
  { platform: 'Oud', category_id: 'bestaat-niet' },
]

describe('groupByCategory', () => {
  const groups = groupByCategory(items, cats)

  it('volgt de ingestelde volgorde, zonder categorie onderaan, zonder lege groepen', () => {
    expect(groups.map(g => g.name)).toEqual(['Social media', 'Design & stock', UNCATEGORIZED_LABEL])
  })

  it('sorteert binnen een groep op platform', () => {
    expect(groups[0].items.map(i => i.platform)).toEqual(['Facebook', 'Instagram'])
  })

  it('laat geen login verdwijnen als zijn categorie niet meer bestaat', () => {
    expect(groups[2].items.map(i => i.platform)).toEqual(['Oud', 'Zoom'])
  })
})

describe('moveCategory', () => {
  it('ruilt met de buur en geeft alleen gewijzigde rijen terug', () => {
    expect(moveCategory(cats, 'design', -1)).toEqual([
      { id: 'design', sort_order: 0 },
      { id: 'social', sort_order: 1 },
    ])
  })

  it('herstelt gelijke sort_orders tot een echte volgorde', () => {
    const flat = cats.map(c => ({ ...c, sort_order: 0 }))
    // alfabetisch: Design, Leeg, Social → Social één omhoog
    expect(moveCategory(flat, 'social', -1)).toEqual([
      { id: 'social', sort_order: 1 },
      { id: 'leeg', sort_order: 2 },
    ])
  })

  it('doet niets aan de rand', () => {
    expect(moveCategory(cats, 'social', -1)).toEqual([])
  })
})
