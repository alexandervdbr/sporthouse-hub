export interface InstagramOembed {
  title: string | null
  authorName: string | null
  thumbnailUrl: string | null
  html: string | null
}

export class InstagramOembedError extends Error {}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function requestOembed(url: string, accessToken?: string): Promise<Response> {
  const params = new URLSearchParams({ url, omitscript: 'true' })
  if (accessToken) params.set('access_token', accessToken)

  try {
    return await fetch(`https://graph.facebook.com/v25.0/instagram_oembed?${params.toString()}`)
  } catch {
    throw new InstagramOembedError('Kon Instagram niet bereiken.')
  }
}

function toOembed(data: Record<string, unknown>): InstagramOembed {
  return {
    title: (data.title as string) ?? null,
    authorName: (data.author_name as string) ?? null,
    thumbnailUrl: (data.thumbnail_url as string) ?? null,
    html: (data.html as string) ?? null,
  }
}

// Meta's oEmbed endpoint only returns metadata (title/author/thumbnail) once
// "Meta oEmbed Read" App Review is approved — until then it's bare `html`
// only. Instagram's own post pages still carry og:title/og:image/og:url meta
// tags for a plain unauthenticated request, so we scrape those as a stand-in
// for the real metadata while review is pending (or skipped). This is
// undocumented and fragile — Instagram can change its markup or start
// blocking datacenter IPs at any time — so it never throws, just returns
// whatever it can get, and is bounded by a short timeout so a slow/hanging
// fetch can't hold up the save response.
interface ScrapedMeta {
  caption: string | null
  authorName: string | null
  thumbnailUrl: string | null
}

function decodeHtmlEntities(text: string): string {
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

function extractMeta(html: string, property: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'))
  return match ? decodeHtmlEntities(match[1]) : null
}

async function scrapeInstagramMeta(url: string): Promise<ScrapedMeta> {
  const empty: ScrapedMeta = { caption: null, authorName: null, thumbnailUrl: null }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return empty

    const html = await res.text()
    const ogTitle = extractMeta(html, 'og:title')
    const ogUrl = extractMeta(html, 'og:url')

    const usernameMatch = ogUrl?.match(/instagram\.com\/([^/]+)\/(?:reel|p|tv)\//)
    const quoteMatch = ogTitle?.match(/"([^"]*)"\s*$/)

    return {
      caption: quoteMatch?.[1] ?? null,
      authorName: usernameMatch?.[1] ?? ogTitle?.split(' on Instagram')[0] ?? null,
      thumbnailUrl: extractMeta(html, 'og:image'),
    }
  } catch {
    return empty
  }
}

export async function fetchInstagramOembed(url: string): Promise<InstagramOembed> {
  const token = process.env.META_APP_ACCESS_TOKEN

  if (token) {
    const res = await requestOembed(url, token)
    if (res.ok) return toOembed(await res.json())

    const body = await res.text().catch(() => '')
    console.error(`Instagram oEmbed (met token) ${res.status}:`, body)
  }

  const [oembedRes, scraped] = await Promise.all([requestOembed(url), scrapeInstagramMeta(url)])

  if (!oembedRes.ok) {
    const body = await oembedRes.text().catch(() => '')
    console.error(`Instagram oEmbed ${oembedRes.status}:`, body)

    const isNotFound = oembedRes.status === 400 || oembedRes.status === 404
    throw new InstagramOembedError(
      isNotFound
        ? 'Deze post is privé, verwijderd of ongeldig.'
        : `Instagram gaf een fout terug (${oembedRes.status}).`
    )
  }

  const oembed = toOembed(await oembedRes.json())
  return {
    title: scraped.caption ?? oembed.title,
    authorName: scraped.authorName ?? oembed.authorName,
    thumbnailUrl: scraped.thumbnailUrl ?? oembed.thumbnailUrl,
    html: oembed.html,
  }
}
