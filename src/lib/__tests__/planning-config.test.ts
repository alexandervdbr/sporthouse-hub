import { describe, it, expect } from 'vitest'
import { personKey, parsePersonKey, normName, getDaysInMonth } from '@/lib/planning-config'

// personKey is het antwoord op het probleem dat het rooster echt dubbele
// voornamen heeft: "Thibault" bij Stags PS en bij STAGS Projectkant zijn twee
// mensen. Op de naam alleen vergelijken betekende dat de tweede zichzelf niet
// kon kiezen, dat één permissie-kolom ze beide ontgrendelde, en dat hun dagen
// in Statistieken bij elkaar opgeteld werden.

describe('personKey', () => {
  it('onderscheidt naamgenoten in verschillende afdelingen', () => {
    expect(personKey({ dept: 'Stags PS', emp: 'Thibault' }))
      .not.toBe(personKey({ dept: 'STAGS Projectkant', emp: 'Thibault' }))
  })
})

describe('parsePersonKey', () => {
  it('leest een sleutel terug', () => {
    expect(parsePersonKey('FOS|Rune Stiers')).toEqual({ dept: 'FOS', emp: 'Rune Stiers' })
  })

  it('splitst op de eerste pipe, zodat een naam er zelf een mag bevatten', () => {
    expect(parsePersonKey('FOS|Jan|Pieter')).toEqual({ dept: 'FOS', emp: 'Jan|Pieter' })
  })

  it('geeft null voor een kale naam — dat is een keuze van voor deze vorm', () => {
    expect(parsePersonKey('Thibault')).toBeNull()
  })

  it('geeft null bij een lege helft, want dat wijst niemand aan', () => {
    expect(parsePersonKey('|Thibault')).toBeNull()
    expect(parsePersonKey('FOS|')).toBeNull()
  })

  it('is het omgekeerde van personKey', () => {
    const p = { dept: 'Projectkant SHG', emp: 'Nick Van Honsté' }
    expect(parsePersonKey(personKey(p))).toEqual(p)
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
