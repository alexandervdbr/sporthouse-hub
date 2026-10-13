import { describe, it, expect } from 'vitest'
import {
  allStatusOptions, pickerStatusOptions, splitThuis, matchStatus, thuisColor,
} from '../planning-status'
import { isArchived, telMeeInStats, type PlanningPreset } from '../planning-presets'
import type { CellData } from '../planning-week'

function preset(name: string, extra: Partial<PlanningPreset> = {}): PlanningPreset {
  return { id: name, name, color: '#111111', sort_order: 0, ...extra }
}

function cel(value: string): CellData {
  return { value, bold: true, textColor: '#fff', bgColor: null, note: null }
}

describe('splitThuis', () => {
  it('haalt het achtervoegsel eraf', () => {
    expect(splitThuis('PS - THUIS')).toEqual({ base: 'PS', thuis: true })
  })

  it('laat een gewone status met rust', () => {
    expect(splitThuis('Verlof')).toEqual({ base: 'Verlof', thuis: false })
  })

  it('kijkt niet naar hoofdletters', () => {
    expect(splitThuis('ps - thuis').thuis).toBe(true)
  })
})

describe('pickerStatusOptions', () => {
  it('verbergt een THUIS-variant waarvan de basis bestaat', () => {
    const namen = pickerStatusOptions([preset('PS'), preset('PS - THUIS')]).map(o => o.name)
    expect(namen).toEqual(['PS'])
  })

  it('houdt een losse THUIS-variant, anders is hij onbereikbaar', () => {
    const namen = pickerStatusOptions([preset('PS - THUIS')]).map(o => o.name)
    expect(namen).toEqual(['PS - THUIS'])
  })

  // De kern van archiveren: uit de kiezer, maar niet uit de herkenning.
  it('laat een gearchiveerde preset weg', () => {
    const presets = [preset('PS'), preset('FOS', { archived_at: '2026-10-13T00:00:00Z' })]
    expect(pickerStatusOptions(presets).map(o => o.name)).toEqual(['PS'])
  })

  it('houdt die wel in allStatusOptions', () => {
    const presets = [preset('PS'), preset('FOS', { archived_at: '2026-10-13T00:00:00Z' })]
    expect(allStatusOptions(presets).map(o => o.name)).toEqual(['FOS', 'PS'])
  })

  it('zodat een cel met een gearchiveerde status nog herkend wordt', () => {
    const presets = [preset('FOS', { archived_at: '2026-10-13T00:00:00Z' })]
    expect(matchStatus(cel('FOS'), allStatusOptions(presets))).toEqual({ name: 'FOS', thuis: false })
    expect(matchStatus(cel('FOS'), pickerStatusOptions(presets))).toBeNull()
  })
})

describe('matchStatus', () => {
  it('matcht op naam, niet op kleur', () => {
    const opties = allStatusOptions([preset('PS', { color: '#ff0000' })])
    expect(matchStatus(cel('ps'), opties)).toEqual({ name: 'PS', thuis: false })
  })

  it('leest de thuisschakelaar uit de opgeslagen waarde', () => {
    const opties = allStatusOptions([preset('PS')])
    expect(matchStatus(cel('PS - THUIS'), opties)).toEqual({ name: 'PS', thuis: true })
  })

  it('geeft niets terug voor een lege cel of een onbekende waarde', () => {
    const opties = allStatusOptions([preset('PS')])
    expect(matchStatus(cel('  '), opties)).toBeNull()
    expect(matchStatus(cel('Vakantiejob'), opties)).toBeNull()
  })
})

describe('thuisColor', () => {
  it('neemt de kleur van de echte THUIS-preset als die bestaat', () => {
    const presets = [preset('PS', { color: '#aaaaaa' }), preset('PS - THUIS', { color: '#bbbbbb' })]
    const [basis] = allStatusOptions([presets[0]])
    expect(thuisColor(presets, basis)).toBe('#bbbbbb')
  })

  it('valt anders terug op de kleur van de status zelf', () => {
    const presets = [preset('PS', { color: '#aaaaaa' })]
    expect(thuisColor(presets, allStatusOptions(presets)[0])).toBe('#aaaaaa')
  })
})

describe('preset-vlaggen', () => {
  it('ziet een preset zonder archived_at als actief', () => {
    expect(isArchived(preset('PS'))).toBe(false)
    expect(isArchived(preset('PS', { archived_at: '2026-01-01T00:00:00Z' }))).toBe(true)
  })

  // Presets van voor migratie 0055 hebben het veld niet; die horen gewoon mee
  // te tellen in plaats van stil uit de statistieken te vallen.
  it('telt mee in de statistieken tenzij het uitdrukkelijk uit staat', () => {
    expect(telMeeInStats(preset('Verlof'))).toBe(true)
    expect(telMeeInStats(preset('Verlof', { in_stats: null }))).toBe(true)
    expect(telMeeInStats(preset('NB', { in_stats: false }))).toBe(false)
  })
})
