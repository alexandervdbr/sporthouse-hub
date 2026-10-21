import { describe, it, expect } from 'vitest'
import {
  normalizeSubmittedUrl, parseSubmittedUrls, isInstagramUrl, hostnameOf, groupLabelFor, linksAsText,
} from '@/lib/preassist-links'

// Hierop staat de unieke index die dezelfde link twee keer in één editie
// tegenhoudt. Normaliseert dit anders dan de database verwacht, dan krijg je
// alsnog dubbele kaartjes — precies waar /api/save-reel eerder op stukliep.

describe('normalizeSubmittedUrl', () => {
  it('haalt Instagrams trackingparameter eraf', () => {
    // Deze verschilt per deelactie, ook voor exact dezelfde post.
    expect(normalizeSubmittedUrl('https://www.instagram.com/p/ABC123/?igsh=xyz987'))
      .toBe('https://www.instagram.com/p/ABC123/')
  })

  it('maakt dezelfde post met en zonder slash gelijk', () => {
    const a = normalizeSubmittedUrl('https://www.instagram.com/p/ABC123')
    const b = normalizeSubmittedUrl('https://www.instagram.com/p/ABC123/')
    expect(a).toBe(b)
  })

  it('plukt de link uit een geplakt tekstblok', () => {
    // Vanaf een telefoon komt er vaak een regel tekst mee.
    expect(normalizeSubmittedUrl('Kijk hier eens naar https://www.instagram.com/reel/XYZ/ echt goed'))
      .toBe('https://www.instagram.com/reel/XYZ/')
  })

  it('haalt utm-ruis van gewone links', () => {
    expect(normalizeSubmittedUrl('https://voorbeeld.be/artikel?utm_source=nieuwsbrief&id=4'))
      .toBe('https://voorbeeld.be/artikel?id=4')
  })

  it('weigert wat geen http(s)-link is', () => {
    expect(normalizeSubmittedUrl('gewoon wat tekst')).toBeNull()
    expect(normalizeSubmittedUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeSubmittedUrl('')).toBeNull()
  })
})

describe('parseSubmittedUrls', () => {
  it('leest meerdere regels en houdt de volgorde', () => {
    const out = parseSubmittedUrls('https://a.be/1\nhttps://b.be/2')
    expect(out).toEqual(['https://a.be/1', 'https://b.be/2'])
  })

  it('slaat lege regels en dubbels over', () => {
    const out = parseSubmittedUrls('https://a.be/1\n\n\nhttps://a.be/1\nrommel')
    expect(out).toEqual(['https://a.be/1'])
  })

  it('ziet twee keer dezelfde post met verschillende tracking als één', () => {
    const out = parseSubmittedUrls(
      'https://www.instagram.com/p/ABC/?igsh=een\nhttps://www.instagram.com/p/ABC/?igsh=twee'
    )
    expect(out).toEqual(['https://www.instagram.com/p/ABC/'])
  })
})

describe('isInstagramUrl', () => {
  it('herkent instagram en niets anders', () => {
    expect(isInstagramUrl('https://www.instagram.com/p/ABC/')).toBe(true)
    expect(isInstagramUrl('https://instagram.com/reel/ABC/')).toBe(true)
    expect(isInstagramUrl('https://www.tiktok.com/@x/video/1')).toBe(false)
    // Een domein dat er alleen op lijkt, hoort er niet onder te vallen.
    expect(isInstagramUrl('https://instagram.com.phish.be/p/ABC/')).toBe(false)
  })
})

describe('hostnameOf', () => {
  it('geeft de site zonder www terug', () => {
    expect(hostnameOf('https://www.tiktok.com/@x/video/1')).toBe('tiktok.com')
    expect(hostnameOf('rommel')).toBeNull()
  })
})

// Waar een inzending onder komt te staan. Content hangt aan een klant,
// Inspiratie aan een onderwerp — zodat een handvol links voor hetzelfde
// project bij elkaar staat in plaats van los naast elkaar.
describe('groupLabelFor', () => {
  it('groepeert content op de klant', () => {
    expect(groupLabelFor({ section: 'content', title: 'iets', client_name: 'Club Brugge' }))
      .toBe('Club Brugge')
  })

  it('groepeert inspiratie op het onderwerp, niet op de klant', () => {
    expect(groupLabelFor({ section: 'inspiratie', title: 'Refs Genk', client_name: 'KRC Genk' }))
      .toBe('Refs Genk')
  })

  it('valt terug op Algemeen zonder onderwerp of klant', () => {
    expect(groupLabelFor({ section: 'inspiratie', title: null, client_name: null })).toBe('Algemeen')
    expect(groupLabelFor({ section: 'inspiratie', title: '   ', client_name: null })).toBe('Algemeen')
    expect(groupLabelFor({ section: 'content', title: null, client_name: null })).toBe('Algemeen')
  })

  it('ziet hetzelfde onderwerp met losse spaties als één groep', () => {
    expect(groupLabelFor({ section: 'inspiratie', title: ' Refs Genk ', client_name: null }))
      .toBe(groupLabelFor({ section: 'inspiratie', title: 'Refs Genk', client_name: null }))
  })
})

// De links van een editie in één keer meenemen naar waar je de sessie
// voorbereidt. Zat alleen in de zip per persoon, terwijl de vraag bijna
// altijd "geef mij alles" is.
describe('linksAsText', () => {
  const links = [
    { url: 'https://a.be/1', title: 'Refs Genk', note: 'mooie overgang', link_author: 'ilovedust', submitted_by_name: 'Arne' },
    { url: 'https://b.be/2', title: 'Refs Genk', note: null, link_author: null, submitted_by_name: 'Thijs' },
    { url: 'https://c.be/3', title: null, note: null, link_author: 'tiktok.com', submitted_by_name: 'Arne' },
  ]

  it('groepeert per onderwerp, met Algemeen voor wat er geen heeft', () => {
    const out = linksAsText('Editie 6 November 2026', links)
    expect(out).toContain('Inspiratie — Editie 6 November 2026')
    expect(out).toContain('## Refs Genk')
    expect(out).toContain('## Algemeen')
  })

  it('zet elke link erin, met auteur, inzender en notitie waar die er zijn', () => {
    const out = linksAsText('Q1', links)
    for (const l of links) expect(out).toContain(l.url)
    expect(out).toContain('ilovedust · Arne')
    expect(out).toContain('"mooie overgang"')
    // Zonder auteur blijft alleen de inzender staan, zonder losse scheiding.
    expect(out).toContain('\n  Thijs')
  })

  it('kan overweg met een editie zonder links', () => {
    expect(linksAsText('Leeg', [])).toContain('Inspiratie — Leeg')
  })
})
