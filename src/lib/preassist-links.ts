import { fetchInstagramOembed, InstagramOembedError, normalizeInstagramUrl } from '@/lib/instagram-oembed'
import { fetchOgMeta } from '@/lib/og-meta'

// Een geplakte link omzetten naar wat er op een kaartje komt te staan.
//
// Instagram krijgt zijn eigen pad, omdat lib/instagram-oembed daar al het
// moeilijke werk voor doet: oEmbed, en als dat niets geeft (Meta's endpoint
// geeft pas echte metadata na App Review) het scrapen van de postpagina zelf.
// Alles wat geen Instagram is — een TikTok, een YouTube-video, een artikel —
// gaat via de gewone og:-tags.

export interface LinkMetadata {
  author: string | null
  caption: string | null
  thumbnailUrl: string | null
}

export function isInstagramUrl(url: string): boolean {
  return hostMatches(url, /(^|\.)instagram\.com$/i)
}

export function isTikTokUrl(url: string): boolean {
  return hostMatches(url, /(^|\.)tiktok\.com$/i)
}

// Op de hostnaam van een geparste URL, niet op de tekst: anders telt
// "instagram.com.iets-anders.be" ook mee.
function hostMatches(url: string, pattern: RegExp): boolean {
  try {
    return pattern.test(new URL(url).hostname)
  } catch {
    return false
  }
}

// TikTok geeft niets bruikbaars via og:-tags — geen titel, geen afbeelding.
// Hun eigen oEmbed-endpoint wel, en dat is openbaar (geen sleutel nodig).
// Het is wel streng met rate limits per IP, dus dit is een poging en geen
// garantie: lukt het niet, dan valt fetchLinkMetadata terug op de og-tags en
// uiteindelijk op alleen de hostnaam.
async function fetchTikTokOembed(url: string): Promise<LinkMetadata | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    const thumb = typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null
    const title = typeof data.title === 'string' ? data.title : null
    const author = typeof data.author_name === 'string' ? data.author_name : null
    if (!thumb && !title && !author) return null
    return { author: author ?? 'TikTok', caption: title, thumbnailUrl: thumb }
  } catch {
    return null
  }
}

// Parameters die per deelactie verschillen en dus van dezelfde pagina twee
// verschillende links maken. Instagram's igsh is de bekendste; de utm-reeks
// komt mee uit nieuwsbrieven en advertenties.
const TRACKING_PARAMS = [
  'igsh', 'igshid', 'fbclid', 'gclid', 'si', 'ref', 'ref_src',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
]

// Wat iemand plakt is niet altijd een kale url: vanaf een telefoon komt er
// vaak een blok tekst mee. Pak de link eruit, en haal de ruis eraf zodat
// dezelfde post twee keer insturen ook echt als hetzelfde telt — dezelfde
// reden als in /api/save-reel, waar deze les eerder geleerd is.
export function normalizeSubmittedUrl(raw: string): string | null {
  const match = raw.match(/https?:\/\/[^\s<>"']+/i)
  if (!match) return null

  let url: URL
  try {
    url = new URL(match[0])
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (isInstagramUrl(url.toString())) return normalizeInstagramUrl(url.toString())

  for (const p of TRACKING_PARAMS) url.searchParams.delete(p)
  return url.toString()
}

// Meerdere links tegelijk: mensen plakken een rijtje uit hun notities. Lege
// regels en dubbele links vallen weg, de volgorde blijft.
export function parseSubmittedUrls(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of input.split(/[\n\r]+/)) {
    const url = normalizeSubmittedUrl(line)
    if (url && !seen.has(url)) {
      seen.add(url)
      out.push(url)
    }
  }
  return out
}

// Nooit een exception, om dezelfde reden als fetchOgMeta: een link waar niets
// van op te halen valt hoort een kaartje met alleen de url te worden, geen
// mislukte inzending. Wie hem instuurde weet zelf wel wat het is, en de
// toelichting staat ernaast.
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  if (isInstagramUrl(url)) {
    try {
      const oembed = await fetchInstagramOembed(url)
      return {
        author: oembed.authorName,
        caption: oembed.title,
        thumbnailUrl: oembed.thumbnailUrl,
      }
    } catch (err) {
      if (!(err instanceof InstagramOembedError)) console.error('Instagram-metadata mislukt:', err)
      return { author: null, caption: null, thumbnailUrl: null }
    }
  }

  if (isTikTokUrl(url)) {
    const tiktok = await fetchTikTokOembed(url)
    if (tiktok) return tiktok
  }

  const og = await fetchOgMeta(url)
  return {
    author: og.siteName ?? hostnameOf(url),
    caption: og.title,
    thumbnailUrl: og.image,
  }
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
