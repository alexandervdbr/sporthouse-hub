import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canSeeClient, canEditKennisbank } from '@/lib/kennisbank-access'
import { ALL_QUESTIONS, isCustomKey } from '@/lib/kennisbank-questions'

// Antwoorden op de vaste vragenlijst per klant. Onbekende sleutels worden
// geweigerd, zodat er geen rijen ontstaan die bij geen enkele vraag horen.
const VALID_KEYS = new Set(ALL_QUESTIONS.map(q => q.key))

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId ontbreekt.' }, { status: 400 })
  if (!canSeeClient(user, clientId)) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_knowledge')
    .select('question_key, answer, title, sort_order, updated_at, updated_by')
    .eq('client_id', clientId)

  // Tabel bestaat nog niet: lege kennisbank in plaats van een foutmelding.
  if (error) {
    return NextResponse.json({ answers: {}, sections: [], meta: {}, canEdit: canEditKennisbank(user, clientId) })
  }

  const answers: Record<string, string> = {}
  const sections: { key: string; title: string; answer: string; sort_order: number }[] = []
  const meta: Record<string, { updated_at: string; updated_by: string | null }> = {}
  for (const row of data ?? []) {
    if (isCustomKey(row.question_key)) {
      sections.push({
        key: row.question_key,
        title: row.title ?? '',
        answer: row.answer,
        sort_order: row.sort_order ?? 0,
      })
    } else {
      answers[row.question_key] = row.answer
    }
    meta[row.question_key] = { updated_at: row.updated_at, updated_by: row.updated_by }
  }
  sections.sort((a, b) => a.sort_order - b.sort_order)

  return NextResponse.json({ answers, sections, meta, canEdit: canEditKennisbank(user, clientId) })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { clientId, answers, sections } = await req.json()
  if (!clientId || typeof answers !== 'object' || answers === null) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  if (!canEditKennisbank(user, clientId)) {
    return NextResponse.json({ error: 'Je hebt geen rechten om deze kennisbank te bewerken.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const rows = Object.entries(answers as Record<string, unknown>)
    .filter(([key, value]) => VALID_KEYS.has(key) && typeof value === 'string')
    .map(([question_key, value]) => ({
      client_id: clientId,
      question_key,
      answer: (value as string).trim(),
      updated_at: now,
      updated_by: user.email,
    })) as Record<string, unknown>[]

  // Eigen secties: sleutel moet met 'custom:' beginnen, titel is verplicht —
  // zonder titel is het geen sectie maar losse tekst.
  if (Array.isArray(sections)) {
    for (const s of sections) {
      if (!s || typeof s.key !== 'string' || !isCustomKey(s.key)) continue
      if (typeof s.title !== 'string' || !s.title.trim()) continue
      rows.push({
        client_id: clientId,
        question_key: s.key,
        answer: typeof s.answer === 'string' ? s.answer.trim() : '',
        title: s.title.trim(),
        sort_order: Number.isFinite(s.sort_order) ? s.sort_order : 0,
        updated_at: now,
        updated_by: user.email,
      })
    }
  }

  if (rows.length === 0) return NextResponse.json({ saved: 0 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('client_knowledge')
    .upsert(rows, { onConflict: 'client_id,question_key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: rows.length })
}

// Een eigen sectie verwijderen. Antwoorden op vaste vragen worden nooit
// verwijderd — leegmaken volstaat daar.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const key = searchParams.get('key')
  if (!clientId || !key) return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  if (!isCustomKey(key)) return NextResponse.json({ error: 'Alleen eigen secties kunnen verwijderd worden.' }, { status: 400 })
  if (!canEditKennisbank(user, clientId)) {
    return NextResponse.json({ error: 'Geen rechten.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('client_knowledge')
    .delete()
    .eq('client_id', clientId)
    .eq('question_key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
