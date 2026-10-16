import { describe, it, expect } from 'vitest'
import { preassistFolderSegments, preassistSectionLabel, preassistUploadName } from '@/lib/preassist-upload'

// upload-session maakt deze map aan, finalize rekent hem opnieuw uit om te
// controleren dat het bestand er echt in beland is. Gaan die twee uit elkaar
// lopen, dan weigert finalize een upload die prima is aangekomen. Deze test
// bestaat om dat pad vast te zetten, niet omdat de functie ingewikkeld is.

describe('preassistFolderSegments', () => {
  it('zet het pad in de volgorde die in Drive staat', () => {
    expect(preassistFolderSegments('Q1 2026', 'content', 'Club Brugge'))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Content', 'Club Brugge'])
  })

  it('gebruikt het label van de sectie, niet de sleutel', () => {
    expect(preassistFolderSegments('Q1 2026', 'inspiratie', 'KRC Genk'))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Inspiratie', 'KRC Genk'])
  })
})

describe('preassistSectionLabel', () => {
  it('vertaalt beide secties', () => {
    expect(preassistSectionLabel('content')).toBe('Content')
    expect(preassistSectionLabel('inspiratie')).toBe('Inspiratie')
  })
})

describe('preassistUploadName', () => {
  it('zet de inzender voor de bestandsnaam', () => {
    expect(preassistUploadName('Arne Smets', 'reel.mp4')).toBe('Arne Smets — reel.mp4')
  })
})
