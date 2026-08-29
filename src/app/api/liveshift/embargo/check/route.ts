import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY niet ingesteld.' }, { status: 500 })
  }

  const { clientId } = await request.json()
  if (!clientId || !hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  const { data: docs } = await supabase
    .from('liveshift_embargo_docs')
    .select('content, filename')
    .eq('client_id', clientId)
    .limit(1)
    .single()

  if (!docs) {
    return NextResponse.json({ error: 'Geen embargo-document gevonden.' }, { status: 400 })
  }

  // Current Belgian time
  const now = new Date().toLocaleString('nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Je bent een embargo-checker voor Pro League social media.

Huidige datum en tijd (Belgische tijd): ${now}

Bepaal op basis van de embargo-regels hieronder of het op dit moment toegestaan is om content te posten.

Antwoord ENKEL met een geldig JSON-object, niets anders:
{"allowed": true, "reason": "korte uitleg"}
of
{"allowed": false, "reason": "korte uitleg waarom embargo actief is"}

EMBARGO-REGELS (uit document: ${docs.filename}):
${docs.content}`,
        },
      ],
    })

    const raw = response.content.find(b => b.type === 'text')?.text?.trim() ?? ''
    // Strip possible markdown code fences
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { allowed: boolean; reason: string }
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Embargo check Claude error:', err)
    // If Claude didn't respond or didn't return valid JSON, fall back gracefully
    return NextResponse.json({
      allowed: false,
      reason: 'Kon embargo-status niet bepalen. Controleer manueel.',
    })
  }
}
