import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasClientAccess, isAdminUser } from '@/lib/auth-permissions'
import { EMPLOYMENT_TYPES, type EmploymentType } from '@/lib/employment'

// Onbekende waarden stil negeren in plaats van opslaan: de check-constraint op
// de tabel zou het toch weigeren, en een 500 uit de database is een slechter
// antwoord dan "we hebben dat veld niet aangepast".
function cleanType(v: unknown): EmploymentType | undefined {
  return typeof v === 'string' && (EMPLOYMENT_TYPES as readonly string[]).includes(v)
    ? v as EmploymentType
    : undefined
}

// Lege string betekent "wissen" (onbepaald), een datum betekent een einde.
// `undefined` betekent "niet meegestuurd, niet aanraken".
function cleanDate(v: unknown): string | null | undefined {
  if (v === null || v === '') return null
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return undefined
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')

  let query = supabase.from('contacts').select('*').order('name')

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await request.json()
  const { clientId, name, role, email, phone, photo_url } = body
  const employment_type = cleanType(body.employment_type)
  const active_until = cleanDate(body.active_until)

  if (!clientId || !name?.trim()) {
    return NextResponse.json({ error: 'clientId en naam zijn vereist' }, { status: 400 })
  }
  if (!hasClientAccess(user, clientId)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  // Eén e-mailadres per klant. Twee contacten voor dezelfde persoon lopen door
  // tot in de planning (die koppelt op naam) en in de avatars in Chat (die
  // koppelt op e-mail), en het is achteraf handwerk om ze te ontwarren.
  // Contacten zonder e-mailadres blijven ongemoeid: daar valt niets aan te
  // herkennen, en meerdere naamgenoten zijn legitiem.
  if (email?.trim()) {
    const wanted = email.trim().toLowerCase()
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, name, email')
      .eq('client_id', clientId)
      .not('email', 'is', null)
    const clash = (existing ?? []).find(
      (c: { email: string | null }) => c.email?.trim().toLowerCase() === wanted
    )
    if (clash) {
      return NextResponse.json(
        { error: `${clash.name} staat al in deze lijst met dit e-mailadres.` },
        { status: 409 }
      )
    }
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      client_id: clientId, name: name.trim(), role, email, phone, photo_url,
      ...(employment_type ? { employment_type } : {}),
      ...(active_until !== undefined ? { active_until } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}


// De einddatum van de persoon doortrekken naar zijn login.
//
// Dezelfde datum stond op twee plekken: active_until op het contact en
// expires_at op het account. Twee keer typen betekent in de praktijk één keer
// vergeten — en vergeet je het account, dan blijft iemand inloggen nadat hij
// vertrokken is. Dat is de richting die ertoe doet.
//
// Beheer-only, want dit plant het verwijderen van een account in: de
// nachtelijke cron ruimt alles op waarvan expires_at voorbij is.
//
// Stil mislukken is hier de juiste keuze. Het contact is al bijgewerkt, en dat
// terugdraaien omdat de accountkant niet lukte zou het echte werk ongedaan
// maken voor een bijwerking. De vervaldatum blijft zichtbaar in Beheer →
// Gebruikers, met een knop om hem alsnog over te nemen.
async function syncAccountExpiry(email: string | null | undefined, activeUntil: string | null) {
  if (!email?.trim()) return
  try {
    const admin = createAdminClient()
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const wanted = email.trim().toLowerCase()
    const account = users.find(u => u.email?.trim().toLowerCase() === wanted)
    if (!account) return

    const current = account.app_metadata?.expires_at ?? null
    const next = activeUntil // null wist hem weer
    if (current === next) return

    await admin.auth.admin.updateUserById(account.id, {
      app_metadata: { ...account.app_metadata, expires_at: next },
    })
  } catch {
    // Zie hierboven.
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await request.json()
  const { id, name, role, email, phone, photo_url } = body
  const employment_type = cleanType(body.employment_type)
  const active_until = cleanDate(body.active_until)

  if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

  // Previously missing entirely — any authenticated user could edit any
  // contact for any client, not just the ones they have access to.
  const { data: existing } = await supabase.from('contacts').select('client_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  if (!hasClientAccess(user, existing.client_id)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { data, error } = await supabase
    .from('contacts')
    .update({
      name, role, email, phone, photo_url,
      ...(employment_type ? { employment_type } : {}),
      ...(active_until !== undefined ? { active_until } : {}),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (active_until !== undefined && isAdminUser(user)) {
    await syncAccountExpiry(data.email, active_until)
  }

  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  // Same gap as PATCH — no authorization check existed at all.
  const { data: existing } = await supabase.from('contacts').select('client_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  if (!hasClientAccess(user, existing.client_id)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { error } = await supabase.from('contacts').delete().eq('id', id)

  // 23503 = foreign_key_violation. Dat is planning_entries.contact_id met zijn
  // `on delete restrict` (zie migratie 0053): deze persoon heeft ingevulde
  // dagen, en die zijn van hem. De database weigert het, en dat is precies de
  // bedoeling — maar een ruwe Postgres-fout is geen antwoord voor wie op een
  // prullenbakje klikt.
  if (error && (error as { code?: string }).code === '23503') {
    return NextResponse.json(
      { error: 'Deze persoon heeft ingevulde planning staan en kan niet verwijderd worden. Geef hem een einddatum of zet hem op non-actief.' },
      { status: 409 }
    )
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
