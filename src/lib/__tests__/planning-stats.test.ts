import { describe, it, expect } from 'vitest'
import { afwezigeDagen } from '@/lib/planning-stats'

const afwezig = (s: string) => ['VERLOF', 'RECUP', 'ZIEK'].includes(s)
const rij = (extra: Partial<Parameters<typeof afwezigeDagen>[0][number]>) => ({
  contact_id: 'a', month: 3, day: 3, value: 'PS', value_pm: null, note: null, ...extra,
})

describe('afwezigeDagen', () => {
  it('neemt een hele dag afwezigheid mee met zijn notitie', () => {
    expect(afwezigeDagen([rij({ value: 'RECUP', note: 'tandarts' })], afwezig)).toEqual([
      { contactId: 'a', month: 3, day: 3, value: 'RECUP', helft: 'dag', note: 'tandarts' },
    ])
  })

  it('laat werkdagen weg', () => {
    expect(afwezigeDagen([rij({ value: 'PS', note: 'event' })], afwezig)).toEqual([])
  })

  it('zet de notitie bij de afwezige helft van een halve dag', () => {
    const uit = afwezigeDagen([rij({ value: 'PS', value_pm: 'RECUP', note: 'vroeger weg' })], afwezig)
    expect(uit).toEqual([{ contactId: 'a', month: 3, day: 3, value: 'RECUP', helft: 'nm', note: 'vroeger weg' }])
  })

  it('geeft beide helften als ze allebei afwezig zijn', () => {
    const uit = afwezigeDagen([rij({ value: 'VERLOF', value_pm: 'ZIEK', note: 'griep' })], afwezig)
    expect(uit.map(d => [d.value, d.helft, d.note])).toEqual([['VERLOF', 'vm', 'griep'], ['ZIEK', 'nm', 'griep']])
  })

  it('ziet twee keer dezelfde helft als een hele dag', () => {
    expect(afwezigeDagen([rij({ value: 'ZIEK', value_pm: 'ZIEK' })], afwezig)[0].helft).toBe('dag')
  })

  it('herkent een THUIS-variant aan zijn basis', () => {
    expect(afwezigeDagen([rij({ value: 'VERLOF - THUIS' })], afwezig)).toHaveLength(1)
  })

  it('maakt van een lege notitie null', () => {
    expect(afwezigeDagen([rij({ value: 'VERLOF', note: '  ' })], afwezig)[0].note).toBeNull()
  })

  it('sorteert op datum', () => {
    const uit = afwezigeDagen([
      rij({ value: 'VERLOF', month: 5, day: 1 }),
      rij({ value: 'VERLOF', month: 2, day: 9 }),
      rij({ value: 'VERLOF', month: 2, day: 3 }),
    ], afwezig)
    expect(uit.map(d => `${d.month}-${d.day}`)).toEqual(['2-3', '2-9', '5-1'])
  })
})
