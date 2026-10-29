import { createClient } from '@/lib/supabase/server'

// ─── Occupied dates (Brussels timezone, 10:30-rule) ───────────────────────────

function getOccupiedDates(pickupISO: string, returnISO: string): string[] {
  const pickup = new Date(pickupISO)
  const ret    = new Date(returnISO)

  const pickupDate = pickup.toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })
  const returnDate = ret.toLocaleDateString('en-CA',    { timeZone: 'Europe/Brussels' })

  // Return time in Brussels
  const retH = parseInt(ret.toLocaleString('en-US', { timeZone: 'Europe/Brussels', hour: '2-digit', hour12: false }))
  const retM = parseInt(ret.toLocaleString('en-US', { timeZone: 'Europe/Brussels', minute: '2-digit' }))
  const retAfter1030 = retH > 10 || (retH === 10 && retM > 30)

  const dates: string[] = []
  const cur = new Date(pickupDate + 'T12:00:00Z')
  const end = new Date(returnDate + 'T12:00:00Z')

  while (cur <= end) {
    const iso       = cur.toISOString().slice(0, 10)
    const isReturn  = iso === returnDate
    if (!isReturn || retAfter1030) dates.push(iso)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  return dates
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end   = searchParams.get('end')
  if (!start || !end) return new Response('start and end required', { status: 400 })

  const { data, error } = await supabase
    .from('equipment_reservations')
    .select('*')
    .gte('date', start)
    .lte('date', end)

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { equipment_id, pickup_datetime, return_datetime, project, note, reserved_for } = body

  if (!equipment_id || !pickup_datetime || !return_datetime) {
    return new Response('Missing required fields', { status: 400 })
  }

  // Defect materiaal kan niet gereserveerd worden, ook niet door wie de
  // knop nog in beeld heeft staan van voor het defect gemeld werd.
  const { data: item } = await supabase
    .from('equipment')
    .select('name, is_broken')
    .eq('id', equipment_id)
    .maybeSingle()

  if (item?.is_broken) {
    return new Response(
      JSON.stringify({ error: `${item.name} staat als defect gemeld en kan niet gereserveerd worden.` }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Compute occupied dates
  const occupiedDates = getOccupiedDates(pickup_datetime, return_datetime)
  if (occupiedDates.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Ongeldige datum/tijdcombinatie.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Check conflicts for all occupied dates
  const { data: existing } = await supabase
    .from('equipment_reservations')
    .select('date, reserved_by')
    .eq('equipment_id', equipment_id)
    .in('date', occupiedDates)

  if (existing && existing.length > 0) {
    const conflicts = existing.map((r: { date: string; reserved_by: string }) =>
      `${r.date} (${r.reserved_by})`
    ).join(', ')
    return new Response(
      JSON.stringify({ error: `Al gereserveerd op: ${conflicts}` }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Iedereen mag voor een collega reserveren: reserved_by is voor wie het is,
  // created_by wie het ingaf. Zonder reserved_for is dat dezelfde persoon.
  const meta        = user.user_metadata ?? {}
  const created_by  = meta.full_name ?? meta.name ?? meta.email ?? user.email ?? 'Onbekend'
  const reserved_by = typeof reserved_for === 'string' && reserved_for.trim() ? reserved_for.trim() : created_by

  const rows = occupiedDates.map(date => ({
    equipment_id,
    reserved_by,
    created_by,
    date,
    pickup_datetime,
    return_datetime,
    project: project?.trim() || null,
    note:    note?.trim()    || null,
  }))

  const { data, error } = await supabase
    .from('equipment_reservations')
    .insert(rows)
    .select()

  if (error) {
    // 23505: iemand anders was net sneller op een van deze dagen.
    if (error.code === '23505') {
      return new Response(
        JSON.stringify({ error: 'Net gereserveerd door iemand anders. Herlaad de pagina en kies andere dagen.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  return Response.json(data, { status: 201 })
}
