import { describe, it, expect } from 'vitest'
import {
  preassistFolderSegments, preassistSectionLabel, preassistUploadName, preassistRequiresClient,
} from '@/lib/preassist-upload'

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

  it('laat de klantlaag weg als er geen klant is', () => {
    // Inspiratie wordt zonder klant ingestuurd; dan hoort er in Drive geen
    // map "Algemeen" te ontstaan die niets betekent.
    expect(preassistFolderSegments('Q1 2026', 'inspiratie', null))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Inspiratie'])
  })
})

describe('preassistRequiresClient', () => {
  it('vraagt een klant bij content en niet bij inspiratie', () => {
    expect(preassistRequiresClient('content')).toBe(true)
    expect(preassistRequiresClient('inspiratie')).toBe(false)
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

// Content hangt onder een klant én een project; Inspiratie onder geen van
// beide. upload-session maakt dit pad en finalize rekent het opnieuw uit om
// te controleren of het bestand erin beland is, dus het moet vastliggen.
describe('preassistFolderSegments met project', () => {
  it('zet het project onder de klant', () => {
    expect(preassistFolderSegments('Q1 2026', 'content', 'Club Brugge', 'Shoot 12 nov'))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Content', 'Club Brugge', 'Shoot 12 nov'])
  })

  it('laat het project weg als er geen is', () => {
    expect(preassistFolderSegments('Q1 2026', 'content', 'Club Brugge', null))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Content', 'Club Brugge'])
    expect(preassistFolderSegments('Q1 2026', 'content', 'Club Brugge', '  '))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Content', 'Club Brugge'])
  })

  it('negeert het project zonder klant, want dan is er niets om onder te hangen', () => {
    expect(preassistFolderSegments('Q1 2026', 'inspiratie', null, 'Refs Genk'))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Inspiratie'])
  })

  it('maakt van een schuine streep geen extra map', () => {
    // Drive zou "A/B" anders als twee mappen lezen.
    expect(preassistFolderSegments('Q1 2026', 'content', 'KRC Genk', 'Shoot 12/11'))
      .toEqual(['Pré-Assist', 'Q1 2026', 'Content', 'KRC Genk', 'Shoot 12-11'])
  })
})
