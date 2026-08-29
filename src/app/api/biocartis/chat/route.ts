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

  const { clientId, question } = await request.json()
  if (!question?.trim()) return NextResponse.json({ error: 'Vraag is leeg.' }, { status: 400 })

  // Fetch all document contents for this client
  const { data: docs, error } = await supabase
    .from('biocartis_documents')
    .select('filename, content, page_count')
    .eq('client_id', clientId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!docs || docs.length === 0) {
    return NextResponse.json({ error: 'Geen documenten gevonden. Upload eerst een PDF.' }, { status: 400 })
  }

  const docsContext = docs.map((d, i) =>
    `--- Document ${i + 1}: ${d.filename} (${d.page_count ?? '?'} pagina's) ---\n${d.content}`
  ).join('\n\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `Je bent een interne assistent voor Sporthouse die werkinstructies van Biocartis beheert.

Je hebt toegang tot ${docs.length} geüpload${docs.length === 1 ? '' : 'e'} instructiedocument${docs.length === 1 ? '' : 'en'}.

Beantwoord vragen van werknemers op basis van de inhoud van deze documenten. Wees precies en citeer de relevante instructies letterlijk waar nuttig. Als een instructie niet in de documenten staat, zeg dit dan duidelijk.

Antwoord altijd in het Nederlands. Vermeld bij elk antwoord uit welk document de informatie komt.

DOCUMENTEN:
${docsContext}`,
    messages: [{ role: 'user', content: question }],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (err) {
        console.error('Biocartis chat stream error:', err)
        controller.enqueue(encoder.encode('\n\n⚠️ Er ging iets mis. Probeer opnieuw.'))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
