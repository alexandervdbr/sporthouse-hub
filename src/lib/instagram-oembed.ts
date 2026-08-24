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

function embedUrlFor(url: string): string {
  return `${url.split('?')[0].replace(/\/?$/, '/')}embed/captioned/`
}

// Shared by scrapeEmbedImage/parseEmbedVideo/parseEmbedCarousel so a single
// classification only ever fetches the embed page once (see classifyReel),
// instead of each concern re-fetching the same URL independently.
export async function fetchEmbedHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(embedUrlFor(url), {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(6000),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

// og:image is Instagram's own square feed-thumbnail crop — for taller or
// multi-slide posts it chops off real content (confirmed by inspecting the
// actual bytes: a portrait poster came back as a hard 640x640 square,
// missing everything below the fold). Instagram's *static* embed page
// (no JS needed) carries an untransformed image at `class="EmbeddedMediaImage"`
// — verified at full native resolution (portrait posters at ~1080x1425,
// reels at their real 1080x1920) rather than cropped to a square. Same
// fragility profile as the og:image scrape above (undocumented markup,
// could change), just a better source when it's there — falls back to
// og:image if the pattern isn't found.
async function scrapeEmbedImage(url: string): Promise<string | null> {
  const html = await fetchEmbedHtml(url)
  if (!html) return null

  const match = html.match(/<img class="EmbeddedMediaImage"[^>]*\bsrc="([^"]*)"/)
  return match ? decodeHtmlEntities(match[1]) : null
}

// The `efg` query param on Instagram's signed video URLs is base64 JSON
// carrying `duration_s` (among other encoding metadata), needed to size
// frame extraction — shared by the single-video and per-carousel-slide
// paths below.
function durationFromVideoUrl(videoUrl: string): number | null {
  try {
    const efg = new URL(videoUrl).searchParams.get('efg')
    if (!efg) return null

    // The decoded payload has trailing padding-artifact bytes after the
    // JSON object (confirmed by hand) — extract just the {...} span rather
    // than parsing the whole decoded string.
    const decoded = Buffer.from(efg, 'base64').toString('utf8')
    const jsonMatch = decoded.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const durationS = Number(JSON.parse(jsonMatch[0]).duration_s)
    return Number.isFinite(durationS) && durationS > 0 ? durationS : null
  } catch {
    return null
  }
}

export interface ScrapedVideo {
  videoUrl: string
  durationS: number
}

// Instagram's static embed page occasionally also carries a direct, signed
// MP4 URL for the post's own video, buried in an escaped JSON blob deep in
// the page — confirmed by hand: downloaded a real ~13s clip via this exact
// path for a reel that plays inline, while a reel that instead redirects to
// Instagram (see the thumbnail-cropping/inline-play investigation) had zero
// .mp4 references at all — Instagram is withholding the video source there
// entirely (most likely a licensed/trending-audio restriction), so no
// scrape can recover a video for those; callers must fall back to the
// single embed image for that shortcode. The URL itself is short-lived
// (signed `oe=` expiry) — never cache/persist it, always re-scrape fresh at
// the moment it's used.
export function parseEmbedVideo(html: string): ScrapedVideo | null {
  const match = html.match(/"([^"]*\.mp4[^"]*)"/)
  if (!match) return null

  const videoUrl = decodeHtmlEntities(match[1].replace(/\\+/g, ''))
  const durationS = durationFromVideoUrl(videoUrl)
  return durationS ? { videoUrl, durationS } : null
}

export async function scrapeEmbedVideo(url: string): Promise<ScrapedVideo | null> {
  const html = await fetchEmbedHtml(url)
  return html ? parseEmbedVideo(html) : null
}

export interface CarouselSlide {
  isVideo: boolean
  imageUrl: string
  videoUrl?: string
  durationS?: number
}

// Carousel ("slider") posts embed their entire GraphQL sidecar payload in
// the same static embed page, as edge_sidecar_to_children.edges[] — each
// node carrying is_video/display_url/(video_url if a video slide).
// Confirmed by hand against several real saved carousel posts. That data
// lives inside a JSON-encoded-as-a-string field (`contextJSON`), so its own
// quotes/slashes come out backslash-escaped in the raw page text — stripped
// here the same blunt way the single-video URL above is cleaned, just
// applied to the whole span up front so the quote-delimited regexes below
// can match at all. Only present for GraphSidecar posts — never a Reel or a
// single-image/video post — so this is a safe, cheap first check before
// falling back to the single-item path.
export function parseEmbedCarousel(html: string): CarouselSlide[] | null {
  const marker = html.indexOf('edge_sidecar_to_children')
  if (marker === -1) return null

  const normalized = html.slice(marker).replace(/\\+/g, '')
  const chunks = normalized.split('"node":{').slice(1, 21)

  const slides: CarouselSlide[] = []
  for (const chunk of chunks) {
    const displayMatch = chunk.match(/"display_url":"([^"]*)"/)
    if (!displayMatch) break // ran past the sidecar array into unrelated page JSON

    const imageUrl = decodeHtmlEntities(displayMatch[1])
    if (!/"is_video":true/.test(chunk)) {
      slides.push({ isVideo: false, imageUrl })
      continue
    }

    const videoMatch = chunk.match(/"video_url":"([^"]*)"/)
    const videoUrl = videoMatch ? decodeHtmlEntities(videoMatch[1]) : undefined
    const durationS = videoUrl ? durationFromVideoUrl(videoUrl) ?? undefined : undefined
    slides.push({ isVideo: true, imageUrl, videoUrl, durationS })
  }

  return slides.length ? slides : null
}

async function scrapeInstagramMeta(url: string): Promise<ScrapedMeta> {
  const empty: ScrapedMeta = { caption: null, authorName: null, thumbnailUrl: null }

  try {
    const [res, embedImage] = await Promise.all([
      fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT }, signal: AbortSignal.timeout(6000) }),
      scrapeEmbedImage(url),
    ])
    if (!res.ok) return { ...empty, thumbnailUrl: embedImage }

    const html = await res.text()
    const ogTitle = extractMeta(html, 'og:title')
    const ogUrl = extractMeta(html, 'og:url')

    const usernameMatch = ogUrl?.match(/instagram\.com\/([^/]+)\/(?:reel|p|tv)\//)
    const quoteMatch = ogTitle?.match(/"([^"]*)"\s*$/)

    return {
      caption: quoteMatch?.[1] ?? null,
      authorName: usernameMatch?.[1] ?? ogTitle?.split(' on Instagram')[0] ?? null,
      thumbnailUrl: embedImage ?? extractMeta(html, 'og:image'),
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
