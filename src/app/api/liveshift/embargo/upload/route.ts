import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const clientId = formData.get('clientId') as string | null

  if (!file || !clientId) {
    return NextResponse.json({ error: 'Bestand en clientId zijn vereist.' }, { status: 400 })
  }
  if (!hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Alleen PDF-bestanden zijn toegestaan.' }, { status: 400 })
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'Bestand is te groot (max 20MB).' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string; numpages: number }>

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PDF verwerken duurde te lang.')), 30_000)
    )

    const parsed = await Promise.race([pdfParse(buffer), timeout])

    const text = parsed.text?.trim()
    if (!text) {
      return NextResponse.json({
        error: 'Kon geen tekst uit de PDF halen. Controleer of het geen gescand document is.',
      }, { status: 400 })
    }

    // Remove existing docs for this client (only keep latest embargo doc)
    await supabase.from('liveshift_embargo_docs').delete().eq('client_id', clientId)

    const { data, error } = await supabase
      .from('liveshift_embargo_docs')
      .insert({
        client_id: clientId,
        filename: file.name,
        content: text,
        page_count: parsed.numpages ?? null,
        uploaded_by: user.email,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ document: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fout bij verwerken van PDF.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
