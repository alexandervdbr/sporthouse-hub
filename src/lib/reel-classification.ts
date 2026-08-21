import Anthropic from '@anthropic-ai/sdk'
import { REEL_CATEGORIES } from './reel-categories'
import { REEL_MEDIA_TYPES, type ReelMediaType } from './reel-media-types'
import { fetchDriveThumbnailAsBase64 } from './reel-thumbnail-storage'

export interface ReelClassification {
  category: string | null
  mediaType: ReelMediaType | null
  confidence: 'high' | 'medium' | 'low'
  tags: string[]
}

// Last-resort signal when the AI call fails outright and there's nothing
// else to go on — a /reel/ or /tv/ permalink is, at minimum, a video file.
function deterministicMediaType(url: string): ReelMediaType | null {
  return /\/(reel|tv)\//.test(url) ? 'Video' : null
}

function fallback(url: string): ReelClassification {
  return { category: null, mediaType: deterministicMediaType(url), confidence: 'low', tags: [] }
}

// Trimmed + case-insensitive match against the fixed lists, mapped back to
// the canonical casing — the model occasionally drifts on exact casing
// ("behind the scenes" vs "Behind the scenes"), which an exact-match guard
// would silently discard the whole classification over.
function normalizeCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return REEL_CATEGORIES.find(c => c.toLowerCase() === trimmed) ?? null
}

function normalizeMediaType(value: unknown): ReelMediaType | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return REEL_MEDIA_TYPES.find(t => t.toLowerCase() === trimmed) ?? null
}

// Claude's `type: 'url'` image source is fetched by Anthropic's own servers,
// which honor the target's robots.txt — Instagram's CDN disallows that, so
// the call gets rejected outright. Fetching the image ourselves and sending
// it as base64 sidesteps that entirely.
async function fetchThumbnailAsBase64(
  url: string
): Promise<{ mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } | null> {
  // Our own thumbnail proxy (see reel-thumbnail-storage.ts) requires a
  // browser session cookie a server-to-server call doesn't have — read the
  // Drive file directly through the service account instead of over HTTP.
  const driveMatch = url.match(/^\/api\/reels\/thumbnail\/([^/?]+)/)
  if (driveMatch) return fetchDriveThumbnailAsBase64(driveMatch[1])

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return null
    const mediaType = contentType.split(';')[0] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null

    const buffer = await res.arrayBuffer()
    return { mediaType, data: Buffer.from(buffer).toString('base64') }
  } catch {
    return null
  }
}

// Isolated, single-purpose call — deliberately not the Expert AI's system
// prompt/persona/conversation context. This is a narrow structured-data task
// (caption + thumbnail in, category + media type + tags out), same shape as
// freelancers/match/route.ts.
export async function classifyReel(input: {
  url: string
  caption: string | null
  authorName: string | null
  thumbnailUrl: string | null
}): Promise<ReelClassification> {
  if (!process.env.ANTHROPIC_API_KEY) return fallback(input.url)

  const prompt = `Je krijgt de caption en thumbnail van een Instagram Reel/Post die iemand bewaarde als contentinspiratie voor SporthouseGroup, een sportmediabedrijf. Iemand gaat dit later terugvinden tijdens een brainstorm — dus kijk echt grondig naar het beeld voor je iets invult, niet oppervlakkig.

Wijs twee vaste classificaties toe, plus vrije tags.

1) CATEGORIE (onderwerp/doel — exact één uit de lijst):
${REEL_CATEGORIES.map(c => `- ${c}`).join('\n')}

2) TYPE (het fundamentele format — exact één uit de lijst). Dit is waar het vaakst misgaat, dus let goed op:
- Foto: een echte foto — actie-, portret- of sfeerfoto, geen ontworpen grafisch element dat overheerst
- Grafisch: een ontworpen STATISCHE visual — quote card, stat-graphic, poster, template met tekst/logo's, geen beweging in het spel
- Video: gefilmde, live-action beelden — wedstrijdbeelden, interview, backstage, iemand die praat of beweegt voor de camera. Een score-overlay, logo of lower-third bovenop gefilmde beelden verandert dit NIET naar Motion — de onderliggende beelden zijn nog steeds gefilmd, dus dit blijft Video.
- Motion: het ontwerp/de animatie IS de content — kinetic typography, een volledig geanimeerde infographic, motion-graphic templates, abstracte animaties. Geen gefilmde mensen of actie te zien, enkel bewegend grafisch ontwerp.
Vuistregel bij twijfel: kies Video, niet Motion. Motion is de uitzondering voor puur grafisch/geanimeerd werk, niet de standaardkeuze voor elke Reel.

Caption: "${input.caption ?? '(geen caption)'}"
Account: ${input.authorName ?? '(onbekend)'}

3) TAGS: analyseer het beeld grondig en geef een uitgebreide, specifieke tagset (gerust 12-25) zodat iemand later exact kan terugvinden waar dit over ging. Denk na over:
- Wat is er letterlijk te zien: wie/wat, welke actie, welke setting/locatie
- Stijl: bv. cinematic, ruw/UGC, studio-opname, close-up, wide shot, hoge/lage hoek
- Sfeer/mood: bv. energiek, rustig, emotioneel, speels, serieus
- Kleuren en licht: bv. donker/moody, felle kleuren, natuurlijk licht, clubkleuren
- Tekst/typografie op beeld, merk- of logo-elementen
- Type content: bv. resultaat-post, hype/promo, interview-snippet, statistiek, wedstrijdmoment, community-moment
Niet de categorie of het type zelf herhalen als tag. Liever te veel dan te weinig, zolang elke tag iets specifieks toevoegt — geen vage vulwoorden.
Schrijf de tags in het ENGELS, ongeacht de taal van de caption — dat maakt zoeken consistent.

Ben je niet zeker welke categorie of welk type het beste past? Kies toch de dichtstbijzijnde en zet confidence op "low".

Antwoord ALLEEN in geldig JSON (geen uitleg erbuiten):
{"category": "<exacte categorie>", "mediaType": "<exact type>", "confidence": "high" | "medium" | "low", "tags": ["...", "..."]}`

  const thumbnail = input.thumbnailUrl ? await fetchThumbnailAsBase64(input.thumbnailUrl) : null

  const content: Anthropic.MessageParam['content'] = thumbnail
    ? [
        { type: 'image', source: { type: 'base64', media_type: thumbnail.mediaType, data: thumbnail.data } },
        { type: 'text', text: prompt },
      ]
    : prompt

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Observed in production: an occasional call comes back with stop_reason
  // "end_turn" but a genuinely empty content block — no truncation, no
  // error, just nothing. Rare enough to look like transient API flakiness
  // rather than a prompt problem, so one retry before giving up on it.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        // Rich captions (long, bilingual, lots to react to) push the model
        // toward a longer response — a prior 1536 ceiling was observed
        // truncating mid-JSON on exactly that kind of post, which silently
        // discarded the whole classification. Generous headroom is cheap.
        max_tokens: 3072,
        messages: [{ role: 'user', content }],
      })

      const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error(`Reel classificatie: geen JSON in antwoord (poging ${attempt}, stop_reason:`, message.stop_reason, '):', text)
        continue
      }

      const parsed = JSON.parse(jsonMatch[0])
      const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 30).map(String) : []
      const mediaType = normalizeMediaType(parsed.mediaType) ?? deterministicMediaType(input.url)
      const category = normalizeCategory(parsed.category)

      if (!category) {
        console.error(`Reel classificatie: onbekende categorie (poging ${attempt}):`, parsed.category, '(stop_reason:', message.stop_reason, ')')
        continue
      }

      return {
        category,
        mediaType,
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
        tags,
      }
    } catch (err) {
      console.error(`Reel classificatie mislukt (poging ${attempt}):`, err instanceof Error ? err.message : err)
    }
  }

  return fallback(input.url)
}
