import { after } from 'next/server'
import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import { calendarAfterMerge } from '@/lib/gear/mail-server'
import type { MergeResult } from '@/lib/gear/types'

// POST { ids: [...], keep_from?: id } — boekingen samenvoegen tot één
// (gear_merge_bookings, 0094). De database controleert alles: rechten per
// boeking, dezelfde persoon, exact dezelfde periode, botsingen. Geen mail;
// na het antwoord blijft er één afspraak in de agenda.

export async function POST(req: Request) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids) && body.ids.every((x: unknown) => typeof x === 'string') ? (body.ids as string[]) : null
  if (!ids || new Set(ids).size < 2) return new Response('Kies minstens twee boekingen om samen te voegen.', { status: 400 })
  const keepFrom = typeof body?.keep_from === 'string' ? body.keep_from : null

  const { data, error } = await auth.supabase.rpc('gear_merge_bookings', { p_booking_ids: ids, p_keep_from: keepFrom })
  if (error) return dbErrorResponse(error)
  const r = data as MergeResult
  after(() => calendarAfterMerge(r.target_id, r.absorbed_ids))
  return Response.json({ id: r.target_id, merge_id: r.merge_id })
}
