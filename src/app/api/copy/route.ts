import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Niet ingelogd.', { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key') {
    return new Response('ANTHROPIC_API_KEY is niet ingesteld.', { status: 500 })
  }

  const { clientId, clientName, messages, brief, platform, copyTypeName } = await request.json()
  if (!clientId || !hasClientAccess(user, clientId)) {
    return new Response('Geen toegang tot deze klant.', { status: 403 })
  }

  // Fetch copy examples — scoped to the selected type (or general if no type selected)
  let examplesQuery = supabase
    .from('copy_examples')
    .select('content, platform')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (copyTypeName) {
    examplesQuery = examplesQuery.eq('copy_type_name', copyTypeName)
  } else {
    examplesQuery = examplesQuery.is('copy_type_name', null)
  }

  const { data: examples } = await examplesQuery

  const examplesBlock = examples && examples.length > 0
    ? `\nSTIJLVOORBEELDEN${copyTypeName ? ` — ${copyTypeName.toUpperCase()}` : ''} VOOR ${clientName.toUpperCase()}:\n${examples.map((e, i) =>
        `${i + 1}. ${e.platform ? `[${e.platform}] ` : ''}${e.content}`
      ).join('\n\n')}\n`
    : '\n(Nog geen stijlvoorbeelden toegevoegd — schrijf in een algemene professionele stijl.)\n'

  const isTitelCaption = copyTypeName === 'Titel + Caption'

  const typeInstruction = copyTypeName
    ? isTitelCaption
      ? `TYPE: Titel + Caption — Genereer telkens een gecombineerde optie die bestaat uit twee onderdelen:
1. TITEL: Een korte, pakkende tekst die op de foto zelf komt (max 6 woorden, impactvol, geen volledige zin nodig).
2. CAPTION: De begeleidende tekst die bij de post hoort (conversationeel, mag langer zijn, mag hashtags bevatten).

Formatteer elke optie ALTIJD exact zo:
**TITEL:** [de titel]
**CAPTION:** [de caption]

Geef 10 genummerde opties, elk met deze structuur.`
      : `TYPE: ${copyTypeName} — Pas het formaat, de lengte en de stijl volledig aan op dit type. Interpreteer het logisch (bv. "Titels": kort en pakkend, max 6 woorden; "Captions": begeleidende tekst bij beeld, conversationeel).`
    : ''

  // Pro League: auto-inject #jupilerMOTM rule when brief references MOTM
  const briefLower = (brief ?? '').toLowerCase()
  const motmKeywords = ['motm', 'man of the match', 'man of the game', 'speler van de wedstrijd', 'beste speler']
  const isMOTM = clientName === 'Pro League' && motmKeywords.some(kw => briefLower.includes(kw))
  const motmInstruction = isMOTM
    ? `\nBELANGRIJK: Voeg de hashtag #jupilerMOTM toe aan elke gegenereerde optie. Plaats de hashtag op dezelfde manier en positie als hashtags in de stijlvoorbeelden staan — volg de opmaakconventie van de voorbeelden.\n`
    : ''

  const forceEnglish = clientName === 'Unibet Experts'

  const systemPrompt = `Je bent een ervaren copywriter voor ${clientName}, een klant van SporthouseGroup (Belgisch sport marketing en media bedrijf).

Je taak is om copy te schrijven die perfect aansluit bij de identiteit van ${clientName}.
${typeInstruction ? `\n${typeInstruction}\n` : ''}${motmInstruction}${examplesBlock}
REGELS:
- ${forceEnglish ? 'Schrijf ALTIJD in het Engels, zonder uitzondering. Gebruik NOOIT Nederlandse woorden of zinnen, ook niet gedeeltelijk.' : 'Schrijf altijd in het Nederlands tenzij de klant duidelijk Franstalig is'}
- Match de toon, stijl en lengte van de stijlvoorbeelden
- Geen generieke of saaie teksten — wees specifiek en impactvol
- Als een platform opgegeven is, respecteer dan de conventies van dat platform (hashtags voor Instagram, kortere tekst voor Twitter/X, professioneler voor LinkedIn)
- Bij de eerste generatie: geef altijd exact 10 genummerde opties (1. t/m 10.), elk duidelijk gescheiden
- Bij feedback of verfijning: pas aan op basis van de specifieke feedback`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Build the message history
  // messages comes from the client: [{role, content}, ...]
  // If it's the first message, we construct it from brief + platform
  const anthropicMessages: Anthropic.MessageParam[] = messages.length > 0
    ? messages
    : [{
        role: 'user' as const,
        content: `${copyTypeName ? `Type: ${copyTypeName}\n` : ''}${platform ? `Platform: ${platform}\n` : ''}Brief: ${brief}\n\nGenereer 10 copy-opties.`,
      }]

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: anthropicMessages,
  })

  // Return a streaming response
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
