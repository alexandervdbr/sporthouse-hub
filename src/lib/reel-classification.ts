import Anthropic from '@anthropic-ai/sdk'
import { normalizeMediaType } from './reel-media-types'
import { fetchDriveThumbnailAsBase64 } from './reel-thumbnail-storage'
import { scrapeEmbedVideo } from './instagram-oembed'
import { extractVideoFrames } from './reel-video-frames'

export interface ReelClassification {
  mediaType: string | null
  confidence: 'high' | 'medium' | 'low'
  tags: string[]
}

// Last-resort signal when the AI call fails outright and there's nothing
// else to go on — a /reel/ or /tv/ permalink is, at minimum, a video file.
// Only used if "Video" is still actually one of the current valid types.
function deterministicMediaType(url: string, mediaTypes: string[]): string | null {
  if (!/\/(reel|tv)\//.test(url)) return null
  return mediaTypes.find(t => t.toLowerCase() === 'video') ?? null
}

function fallback(url: string, mediaTypes: string[]): ReelClassification {
  return { mediaType: deterministicMediaType(url, mediaTypes), confidence: 'low', tags: [] }
}

// Descriptions for the small set of types we know about up front — anything
// beyond these (a new type someone added, e.g. "3D") gets no canned
// description, just its name; the model uses its own judgment for those.
const KNOWN_TYPE_DESCRIPTIONS: Record<string, string> = {
  foto: 'een echte foto — actie-, portret- of sfeerfoto, geen ontworpen grafisch element dat overheerst',
  grafisch: "een ontworpen STATISCHE visual — quote card, stat-graphic, poster, template met tekst/logo's, geen beweging in het spel",
  video: 'gefilmde, live-action beelden — wedstrijdbeelden, interview, backstage, iemand die praat of beweegt voor de camera. Een score-overlay, logo, lower-third, of één afwijkend frame (overgang, intro-kaart, grafisch/3D-element) bovenop/tussen verder gefilmde beelden verandert dit NIET naar Motion of 3D — de onderliggende beelden zijn nog steeds gefilmd, dus dit blijft Video.',
  motion: 'het ontwerp/de animatie IS de content, doorheen de HELE clip — kinetic typography, een volledig geanimeerde infographic, motion-graphic templates, abstracte animaties. Geen gefilmde mensen of actie te zien, enkel bewegend grafisch ontwerp. Één los animatie-frame tussen verder gefilmde beelden is niet genoeg — dat blijft Video.',
  '3d': 'volledig 3D-gerenderde/CGI-content is de hoofdmoot doorheen de HELE clip — geen gefilmde mensen of actie te zien. Eén los 3D-element, overlay of transitie tussen verder gefilmde beelden verandert dit NIET naar 3D — dat blijft Video, net als bij Motion hierboven.',
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
// (caption + thumbnail in, media type + tags out), same shape as
// freelancers/match/route.ts. `mediaTypes` is the current live list from
// reel_media_types (fetched by the caller) — permitted staff can add new
// ones (e.g. "3D"), so the valid set is never hardcoded here.
export async function classifyReel(input: {
  url: string
  caption: string | null
  authorName: string | null
  thumbnailUrl: string | null
  mediaTypes: string[]
}): Promise<ReelClassification> {
  if (!process.env.ANTHROPIC_API_KEY) return fallback(input.url, input.mediaTypes)

  // Resolved before the prompt is built so the prompt can tell the model
  // exactly what it's looking at — see imageContext below. That context was
  // previously missing entirely, which looks like the real cause of two
  // observed misclassifications: clearly-filmed video getting tagged "Foto"
  // (the model had no signal that a Reel is inherently video, or that
  // several images are sequential frames of one clip rather than unrelated
  // stills), and one single off-frame (an intro card, transition, or a
  // passing 3D/graphic element) getting to decide the whole clip's type.
  const video = await scrapeEmbedVideo(input.url)
  const frames = video ? await extractVideoFrames(video.videoUrl, video.durationS) : null

  type ImageInput = { mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
  const images: ImageInput[] = frames?.length ? frames : []
  if (images.length === 0 && input.thumbnailUrl) {
    const thumbnail = await fetchThumbnailAsBase64(input.thumbnailUrl)
    if (thumbnail) images.push(thumbnail)
  }

  const isReelUrl = /\/(reel|tv)\//.test(input.url)
  const contextLines: string[] = []
  if (images.length > 1) {
    contextLines.push(
      `Je krijgt ${images.length} afbeeldingen: dit zijn frames verspreid over de volledige duur van dezelfde video, van begin tot eind — geen losse foto's. Baseer je oordeel op wat het MERENDEEL van de frames toont. Eén enkel afwijkend frame (bv. een korte overgang, intro-kaart, logo-bumper of eenmalig grafisch/3D-element tussen verder gefilmde beelden) verandert het type NIET.`
    )
  }
  if (isReelUrl) {
    contextLines.push(
      `Dit is een Instagram Reel — Reels zijn per definitie gefilmde of geanimeerde videocontent, nooit een losstaande foto. Kies "Foto" enkel als het overduidelijk om een fotoserie/slideshow gaat, niet als twijfelachtige standaardkeuze.`
    )
  }
  const imageContext = contextLines.length ? `\n${contextLines.join('\n')}\n` : ''

  const typeLines = input.mediaTypes.map(t => {
    const description = KNOWN_TYPE_DESCRIPTIONS[t.toLowerCase()]
    return description ? `- ${t}: ${description}` : `- ${t}`
  }).join('\n')

  const prompt = `Je krijgt de caption en ${images.length > 1 ? 'videoframes' : 'thumbnail'} van een Instagram Reel/Post die iemand bewaarde als contentinspiratie voor SporthouseGroup, een sportmediabedrijf. Iemand gaat dit later terugvinden tijdens een brainstorm — dus kijk echt grondig naar het beeld voor je iets invult, niet oppervlakkig.
${imageContext}
1) TYPE (het fundamentele format — exact één uit de lijst). Dit is waar het vaakst misgaat, dus let goed op:
${typeLines}
Vuistregel bij twijfel tussen Video en een ander type (Motion, 3D, of gelijkaardig): kies Video, tenzij de volledige clip overheerst wordt door dat andere type. Eén frame met een grafisch/geanimeerd/3D-element temidden van verder gefilmde beelden is niet genoeg om van Video af te wijken.
Staat er een type in de lijst zonder beschrijving hierboven (bv. een nieuw toegevoegde categorie)? Gebruik je eigen inschatting op basis van de naam — kies het als het duidelijk de HOOFDMOOT van de clip beschrijft, niet één enkel frame.

Caption: "${input.caption ?? '(geen caption)'}"
Account: ${input.authorName ?? '(onbekend)'}

2) TAGS: analyseer het beeld grondig en geef een uitgebreide, specifieke tagset (gerust 12-25) zodat iemand later exact kan terugvinden waar dit over ging. Denk na over:
- Onderwerp/doel — bv. interview, behind the scenes, match moment, community & fans, atmosphere, graphic design, format idea — voeg dit toe als tag(s) wanneer het van toepassing is, net als elk ander kenmerk
- Wat is er letterlijk te zien: wie/wat, welke actie, welke setting/locatie
- Stijl: bv. cinematic, ruw/UGC, studio-opname, close-up, wide shot, hoge/lage hoek
- Sfeer/mood: bv. energiek, rustig, emotioneel, speels, serieus
- Kleuren en licht: bv. donker/moody, felle kleuren, natuurlijk licht, clubkleuren
- Tekst/typografie op beeld, merk- of logo-elementen
Niet het type zelf herhalen als tag. Liever te veel dan te weinig, zolang elke tag iets specifieks toevoegt — geen vage vulwoorden.
Schrijf de tags in het ENGELS, ongeacht de taal van de caption — dat maakt zoeken consistent.

Ben je niet zeker welk type het beste past? Kies toch de dichtstbijzijnde en zet confidence op "low".

Antwoord ALLEEN in geldig JSON (geen uitleg erbuiten):
{"mediaType": "<exact type>", "confidence": "high" | "medium" | "low", "tags": ["...", "..."]}`

  const content: Anthropic.MessageParam['content'] = images.length
    ? [
        ...images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
        })),
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
      const mediaType = normalizeMediaType(parsed.mediaType, input.mediaTypes) ?? deterministicMediaType(input.url, input.mediaTypes)

      return {
        mediaType,
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
        tags,
      }
    } catch (err) {
      console.error(`Reel classificatie mislukt (poging ${attempt}):`, err instanceof Error ? err.message : err)
    }
  }

  return fallback(input.url, input.mediaTypes)
}
