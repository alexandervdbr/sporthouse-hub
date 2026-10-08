import { describe, it, expect } from 'vitest'
import { personKey, normName, getDaysInMonth } from '@/lib/planning-config'

// Een planningsdag hangt aan een contact-id. Dat is wat deze sleutel is — en
// het is precies waarom het rooster geen namen meer kopieert: twee "Thibault"
// zijn twee id's, en een hernoeming in Team raakt de sleutel niet.

describe('personKey', () => {
  it('is het contact-id, los van afdeling en naam', () => {
    expect(personKey({ id: 'abc' })).toBe('abc')
  })

  it('onderscheidt naamgenoten', () => {
    expect(personKey({ id: 'thibault-1' })).not.toBe(personKey({ id: 'thibault-2' }))
  })

  it('verandert niet als iemand van afdeling of naam wisselt', () => {
    const voor = personKey({ id: 'abc', dept: 'FOS', emp: 'Jarne Wauters' } as { id: string })
    const na = personKey({ id: 'abc', dept: 'Team PS', emp: 'Jarne Wouters' } as { id: string })
    expect(voor).toBe(na)
  })
})

describe('normName', () => {
  it('negeert hoofdletters en accenten bij het vergelijken met Team', () => {
    expect(normName('Nick Van Honsté')).toBe(normName('nick van honste'))
    expect(normName('Thijs Muësen')).toBe(normName('THIJS MUESEN'))
  })

  it('negeert spaties aan de randen', () => {
    expect(normName('  Clara ')).toBe('clara')
  })
})

describe('getDaysInMonth', () => {
  it('telt februari in een schrikkeljaar correct', () => {
    expect(getDaysInMonth(2028, 2)).toHaveLength(29)
    expect(getDaysInMonth(2026, 2)).toHaveLength(28)
  })

  it('markeert zaterdag en zondag als weekend', () => {
    const okt = getDaysInMonth(2026, 10)
    expect(okt.find(d => d.day === 10)?.isWeekend).toBe(true)
    expect(okt.find(d => d.day === 11)?.isWeekend).toBe(true)
    expect(okt.find(d => d.day === 12)?.isWeekend).toBe(false)
  })
})
