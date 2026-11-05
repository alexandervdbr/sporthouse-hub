import { describe, it, expect } from 'vitest'
import { moveCategory } from '@/lib/gear/categories'
import type { GearCategory } from '@/lib/gear/types'

const cat = (id: string, sort_order: number): GearCategory => ({ id, name: id.toUpperCase(), color: '#000', sort_order })
const cats = [cat('video', 1), cat('foto', 2), cat('drone', 3), cat('licht', 4)]
const ids = (c: GearCategory[] | null) => c?.map(x => `${x.id}:${x.sort_order}`)

describe('moveCategory', () => {
  it('schuift naar beneden en nummert opnieuw 1…n', () => {
    expect(ids(moveCategory(cats, 'video', 'drone'))).toEqual(['foto:1', 'drone:2', 'video:3', 'licht:4'])
  })

  it('schuift naar boven', () => {
    expect(ids(moveCategory(cats, 'licht', 'foto'))).toEqual(['video:1', 'licht:2', 'foto:3', 'drone:4'])
  })

  it('houdt categorieën die niet in beeld zijn op hun plek', () => {
    // "drone" staat niet in het raster (leeg); licht naar de plek van foto.
    const out = moveCategory(cats, 'licht', 'foto')!
    expect(out.findIndex(c => c.id === 'drone')).toBe(3)
    expect(out.map(c => c.id).filter(id => id !== 'drone')).toEqual(['video', 'licht', 'foto'])
  })

  it('werkt ook als de invoer niet gesorteerd is', () => {
    expect(ids(moveCategory([cat('foto', 2), cat('video', 1)], 'video', 'foto'))).toEqual(['foto:1', 'video:2'])
  })

  it('geeft null als er niets verandert of een id onbekend is', () => {
    expect(moveCategory(cats, 'foto', 'foto')).toBeNull()
    expect(moveCategory(cats, 'foto', 'bestaat-niet')).toBeNull()
  })
})
