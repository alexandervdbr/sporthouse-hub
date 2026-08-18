import Anthropic from '@anthropic-ai/sdk'
import { REEL_CATEGORIES, isReelCategory } from './reel-categories'
import { REEL_MEDIA_TYPES, isReelMediaType, type ReelMediaType } from './reel-media-types'

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

// Claude's `type: 'url'` image source is fetched by Anthropic's own servers,
// which honor the target's robots.txt — Instagram's CDN disallows that, so
// the call gets rejected outright. Fetching the image ourselves and sending
// it as base64 sidesteps that entirely.
async function fetchThumbnailAsBase64(
  url: string
): Promise<{ mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } | null> {
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

  const prompt = `Je krijgt de caption en thumbnail van een Instagram Reel/Post die iemand bewaarde als contentinspiratie voor SporthouseGroup, een sportmediabedrijf.

Wijs twee vaste classificaties toe, plus vrije tags.

1) CATEGORIE (onderwerp/doel — exact één uit de lijst):
${REEL_CATEGORIES.map(c => `- ${c}`).join('\n')}

2) TYPE (het fundamentele format — exact één uit de lijst, kijk vooral naar de thumbnail):
- Foto: een echte foto — actie-, portret- of sfeerfoto, geen ontworpen grafisch element dat overheerst
- Grafisch: een ontworpen statische visual — quote card, stat-graphic, poster, template met tekst/logo's, geen beweging
- Video: live-action videobeelden — gefilmd, wedstrijdbeelden, interview, backstage
- Motion: geanimeerde/motion-design content — bewegende graphics, kinetic typography, animaties (ook al is het technisch een videobestand, het draait om het ontwerp/de animatie, niet om gefilmde beelden)

Caption: "${input.caption ?? '(geen caption)'}"
Account: ${input.authorName ?? '(onbekend)'}

3) TAGS: geef zoveel tags als relevant zijn (kan gerust 8-15 zijn) die de inhoud doorzoekbaar maken voor iemand die later aan het brainstormen is — onderwerp, stijl, sfeer/mood, kleuren, setting, compositie, specifieke elementen die opvallen. Niet de categorie of het type zelf herhalen. Liever te veel dan te weinig, zolang elke tag iets specifieks toevoegt.

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

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Reel classificatie: geen JSON in antwoord:', text)
      return fallback(input.url)
    }

    const parsed = JSON.parse(jsonMatch[0])
    const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 20).map(String) : []
    const mediaType = isReelMediaType(parsed.mediaType) ? parsed.mediaType : deterministicMediaType(input.url)

    if (!isReelCategory(parsed.category)) return { ...fallback(input.url), mediaType, tags }

    return {
      category: parsed.category,
      mediaType,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      tags,
    }
  } catch (err) {
    console.error('Reel classificatie mislukt:', err instanceof Error ? err.message : err)
    return fallback(input.url)
  }
}
