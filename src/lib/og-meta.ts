// Open Graph-tags uit een pagina lezen.
//
// Stond in lib/instagram-oembed, waar het de stand-in was voor Meta's oEmbed
// zolang die geen metadata teruggeeft. Pré-assist heeft hetzelfde nodig voor
// links die géén Instagram zijn — een TikTok, een YouTube-video, een artikel —
// en dat is precies dezelfde drie tags lezen. Vandaar hier, één keer.

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
}

export function extractMeta(html: string, property: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'))
  return match ? decodeHtmlEntities(match[1]) : null
}

export interface OgMeta {
  title: string | null
  image: string | null
  siteName: string | null
}

// Nooit een exception: een link zonder bruikbare tags levert gewoon een
// kaartje met alleen de url op, en dat is beter dan een mislukte inzending.
// Korte timeout, want hier wacht een gebruiker op.
export async function fetchOgMeta(url: string): Promise<OgMeta> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SporthouseHub/1.0; +https://sporthousegroup.com)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { title: null, image: null, siteName: null }

    // Alleen het begin van de pagina: og-tags staan in de head, en een
    // nieuwspagina van een paar megabyte hoeft niet helemaal door het
    // geheugen voor drie tags.
    const html = (await res.text()).slice(0, 200_000)
    return {
      title:    extractMeta(html, 'og:title'),
      image:    extractMeta(html, 'og:image'),
      siteName: extractMeta(html, 'og:site_name'),
    }
  } catch {
    return { title: null, image: null, siteName: null }
  }
}
