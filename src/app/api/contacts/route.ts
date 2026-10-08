import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
