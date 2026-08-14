import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canSeeClient, canEditKennisbank } from '@/lib/kennisbank-access'
import { ALL_QUESTIONS } from '@/lib/kennisbank-questions'

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
    .select('question_key, answer, updated_at, updated_by')
    .eq('client_id', clientId)

  // Tabel bestaat nog niet: lege kennisbank in plaats van een foutmelding.
  if (error) {
    return NextResponse.json({ answers: {}, meta: {}, canEdit: canEditKennisbank(user, clientId) })
  }

  const answers: Record<string, string> = {}
  const meta: Record<string, { updated_at: string; updated_by: string | null }> = {}
  for (const row of data ?? []) {
    answers[row.question_key] = row.answer
    meta[row.question_key] = { updated_at: row.updated_at, updated_by: row.updated_by }
  }

  return NextResponse.json({ answers, meta, canEdit: canEditKennisbank(user, clientId) })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { clientId, answers } = await req.json()
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
    }))

  if (rows.length === 0) return NextResponse.json({ saved: 0 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('client_knowledge')
    .upsert(rows, { onConflict: 'client_id,question_key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: rows.length })
}
