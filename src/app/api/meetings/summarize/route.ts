import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is niet ingesteld in .env.local' }, { status: 500 })
  }

  const { transcription } = await request.json()
  if (!transcription?.trim()) {
    return NextResponse.json({ error: 'Transcriptie is leeg.' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Je bent een professionele assistent die vergaderingen samenvat voor SporthouseGroup, een Belgisch sport marketing en media bedrijf.

Analyseer de volgende vergaderingstranscriptie en maak een gestructureerde samenvatting in het Nederlands.

Gebruik EXACT dit formaat met deze secties (ook als een sectie leeg is, schrijf dan "Geen."):

## Korte samenvatting
[2-3 zinnen die de kern van de vergadering beschrijven]

## Belangrijkste beslissingen
- [beslissing 1]
- [beslissing 2]

## Actiepunten
- [concrete actie] — [naam of rol verantwoordelijke]

## Volgende stappen
- [volgende stap 1]
- [volgende stap 2]

Transcriptie:
${transcription}`,
        },
      ],
    })

    const summary = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('Meeting summarize Claude error:', err)
    return NextResponse.json({ error: 'Kon geen samenvatting genereren. Probeer opnieuw.' }, { status: 500 })
  }
}
