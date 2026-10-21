import { describe, it, expect } from 'vitest'
import { normalizeSubmittedUrl, parseSubmittedUrls, isInstagramUrl, hostnameOf } from '@/lib/preassist-links'

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
