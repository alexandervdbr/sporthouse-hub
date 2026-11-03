import { describe, it, expect } from 'vitest'
import { pickTeamClient } from '../team-client'

describe('pickTeamClient', () => {
  const sporthouse = { id: 'sh', name: 'Sporthouse' }
  const fos        = { id: 'fos', name: 'Friends of Sports' }
  const spor       = { id: 'spor', name: 'Sporting Hasselt' }

  it('kiest altijd Sporthouse, ongeacht de volgorde', () => {
    expect(pickTeamClient([fos, sporthouse])).toEqual({ ok: true, id: 'sh' })
    expect(pickTeamClient([spor, fos, sporthouse])).toEqual({ ok: true, id: 'sh' })
    expect(pickTeamClient([sporthouse, fos])).toEqual({ ok: true, id: 'sh' })
  })

  it('weigert als Sporthouse ontbreekt in plaats van een andere te kiezen', () => {
    const r = pickTeamClient([fos, spor])
    expect(r.ok).toBe(false)
  })

  it('weigert bij twee keer Sporthouse', () => {
    const r = pickTeamClient([sporthouse, { id: 'sh2', name: 'Sporthouse' }])
    expect(r.ok).toBe(false)
  })

  it('negeert spaties rond de naam', () => {
    expect(pickTeamClient([{ id: 'x', name: ' Sporthouse ' }, fos])).toEqual({ ok: true, id: 'x' })
  })

  it('weigert bij een lege lijst', () => {
    expect(pickTeamClient([]).ok).toBe(false)
  })
})
