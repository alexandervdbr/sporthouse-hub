import Anthropic from '@anthropic-ai/sdk'
import { REEL_CATEGORIES, isReelCategory } from './reel-categories'

export interface ReelClassification {
  category: string | null
  confidence: 'high' | 'medium' | 'low'
  tags: string[]
}

const FALLBACK: ReelClassification = { category: null, confidence: 'low', tags: [] }

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
// (caption + thumbnail in, category + tags out), same shape as
// freelancers/match/route.ts.
export async function classifyReel(input: {
  caption: string | null
  authorName: string | null
  thumbnailUrl: string | null
}): Promise<ReelClassification> {
  if (!process.env.ANTHROPIC_API_KEY) return FALLBACK

  const prompt = `Je krijgt de caption van een Instagram Reel/Post die iemand bewaarde als contentinspiratie voor SporthouseGroup, een sportmediabedrijf. Wijs er exact één categorie aan toe.

VASTE CATEGORIEËN:
${REEL_CATEGORIES.map(c => `- ${c}`).join('\n')}

Caption: "${input.caption ?? '(geen caption)'}"
Account: ${input.authorName ?? '(onbekend)'}

Geef ook 2-5 korte, vrije tags mee die de inhoud verder omschrijven (onderwerp, stijl, format — niet de categorie zelf herhalen).
Ben je niet zeker welke categorie het beste past? Kies toch de dichtstbijzijnde en zet confidence op "low".

Antwoord ALLEEN in geldig JSON (geen uitleg erbuiten):
{"category": "<exacte categorie uit de lijst>", "confidence": "high" | "medium" | "low", "tags": ["...", "..."]}`

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
      max_tokens: 512,
      messages: [{ role: 'user', content }],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Reel classificatie: geen JSON in antwoord:', text)
      return FALLBACK
    }

    const parsed = JSON.parse(jsonMatch[0])
    const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : []

    if (!isReelCategory(parsed.category)) return { ...FALLBACK, tags }

    return {
      category: parsed.category,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      tags,
    }
  } catch (err) {
    console.error('Reel classificatie mislukt:', err instanceof Error ? err.message : err)
    return FALLBACK
  }
}
