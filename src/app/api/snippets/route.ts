import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY niet ingesteld.' }, { status: 500 })
  }

  const { transcript, podcastName } = await request.json()
  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'Transcript is leeg.' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Je bent een social media expert gespecialiseerd in podcast content voor ${podcastName || 'een sportpodcast'}.

Analyseer onderstaand transcript en selecteer de 6 beste snippets die geschikt zijn als social media clip of audiogram.

Kies fragmenten die:
- Een sterke mening, verrassende uitspraak of emotioneel moment bevatten
- Op zichzelf begrijpelijk zijn zonder context
- Kort genoeg zijn voor social media (15–60 seconden wanneer uitgesproken)
- Geschikt zijn voor Instagram Reels, TikTok of YouTube Shorts

Geef je antwoord als een JSON array met exact dit formaat (geen markdown, enkel pure JSON):
[
  {
    "quote": "De exacte tekst uit het transcript",
    "reden": "Waarom dit een sterke snippet is",
    "platform": ["Instagram Reels", "TikTok"],
    "toon": "confronterend"
  }
]

Mogelijke waarden voor toon: grappig, confronterend, emotioneel, verrassend, inspirerend, controversieel

Transcript:
${transcript}`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]'
    // Strip potential markdown code fences
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const snippets = JSON.parse(cleaned)
    return NextResponse.json({ snippets })
  } catch (err) {
    console.error('Snippets Claude error:', err)
    return NextResponse.json({ error: 'Kon snippets niet verwerken. Probeer opnieuw.' }, { status: 500 })
  }
}
