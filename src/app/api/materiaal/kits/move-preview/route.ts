import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import { todayInBrussels } from '@/lib/gear/dates'
import { previewMove } from '@/lib/gear/kits'
import { bookingWho } from '@/lib/gear/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET ?item_id=&to_kit_id= (leeg = los maken) — welke komende boekingen een
// verhuis zou raken, vóór je bevestigt. Verandert niets.
export async function GET(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const url = new URL(req.url)
  const itemId = url.searchParams.get('item_id') ?? ''
  const toKitId = url.searchParams.get('to_kit_id') || null
  if (!itemId) return new Response('item_id ontbreekt', { status: 400 })

  const today = todayInBrussels()
  const [membership, bookings] = await Promise.all([
    supabase.from('gear_kit_members').select('kit_id').eq('item_id', itemId).is('removed_at', null).maybeSingle(),
    supabase.from('gear_bookings')
      .select('id, start_date, end_date, person_name, client_id, gear_booking_items(item_id, via_kit_id, via_kit_name)')
      .is('cancelled_at', null).gte('end_date', today),
  ])
  const failed = [membership, bookings].find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)

  const clientIds = [...new Set((bookings.data ?? []).map(b => b.client_id).filter((c): c is string => !!c))]
  const { data: clients } = clientIds.length
    ? await createAdminClient().from('clients').select('id, name, color').in('id', clientIds)
    : { data: [] as { id: string; name: string; color: string | null }[] }
  const clientById = new Map((clients ?? []).map(c => [c.id, c]))

  const rows = (bookings.data ?? []).map(b => ({
    id: b.id, start_date: b.start_date, end_date: b.end_date, person_name: b.person_name,
    client: b.client_id ? clientById.get(b.client_id) ?? null : null,
    lines: b.gear_booking_items as { item_id: string; via_kit_id: string | null; via_kit_name: string | null }[],
    booked_for_user_id: null, freelancer_id: null, external_name: null, project: null, note: null, created_by: null, created_by_name: '',
  }))
  const fromKitId = membership.data?.kit_id ?? null
  const { remove, add } = previewMove(itemId, fromKitId, toKitId, rows, today)
  const out = (steps: typeof remove) => steps.map(s => ({
    booking_id: s.booking.id, start_date: s.booking.start_date, end_date: s.booking.end_date,
    ok: s.ok, reason: s.reason, label: bookingWho({ person_name: s.booking.person_name, client_name: s.booking.client?.name }),
  }))
  return Response.json({ from_kit_id: fromKitId, remove: out(remove), add: out(add) })
}
