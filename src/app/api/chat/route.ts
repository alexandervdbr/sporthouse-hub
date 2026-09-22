import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { Message } from '@/types/database'

export const maxDuration = 300

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function findRelevantContext(documents: { title: string; content: string }[], query: string): string {
  if (documents.length === 0) return ''

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)

  // Score documents by keyword relevance
  const scored = documents.map(doc => {
    const text = (doc.title + ' ' + doc.content).toLowerCase()
    const score = queryWords.reduce((acc, word) => {
      const count = (text.match(new RegExp(word, 'g')) || []).length
      return acc + count
    }, 0)
    return { ...doc, score }
  })

  // Sort by score and take top documents
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 3)

  if (top.every(d => d.score === 0)) {
    // No keyword matches — return all documents truncated
    return documents
      .map(d => `**${d.title}**\n${d.content.slice(0, 2000)}`)
      .join('\n\n---\n\n')
  }

  return top
    .map(d => `**${d.title}**\n${d.content.slice(0, 3000)}`)
    .join('\n\n---\n\n')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  }

  const body = await request.json()
  const { clientId, messages } = body as { clientId: string; messages: Message[] }

  if (!clientId || !messages?.length) {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  // Fetch documents for this client
  const { data: documents } = await supabase
    .from('documents')
    .select('title, content')
    .eq('client_id', clientId)

  if (!documents || documents.length === 0) {
    return NextResponse.json(
      { error: 'Geen documenten gevonden. Upload eerst documenten in de kennisbank.' },
      { status: 400 }
    )
  }

  // Get client name
  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()

  // Find relevant context for the latest user message
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
  const context = findRelevantContext(documents, lastUserMessage?.content || '')

  const systemPrompt = `Je bent een behulpzame AI-assistent voor ${client?.name || 'SporthouseGroup'}, een Belgisch sport marketing en media bedrijf.

Je beschikt over de volgende documenten uit de kennisbank als context:

${context}

Beantwoord vragen op basis van de beschikbare documenten. Wees precies, professioneel en bondig. Antwoord altijd in het Nederlands, tenzij de gebruiker expliciet in een andere taal schrijft.

Als de informatie niet in de documenten staat, geef dat dan eerlijk aan.`

  // Convert messages to Anthropic format (exclude the last user message since it's already in the messages array)
  const anthropicMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Stream the response
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const streamResponse = anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMessages,
        })

        for await (const event of streamResponse) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const data = JSON.stringify({ text: event.delta.text })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
