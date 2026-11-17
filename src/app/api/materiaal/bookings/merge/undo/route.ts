import { after } from 'next/server'
import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import { calendarAfterUnmerge } from '@/lib/gear/mail-server'

// POST { merge_id } — samenvoegen ongedaan maken (gear_unmerge_bookings,
// 0094): de boekingen terug zoals ze waren. Kan alleen wie samenvoegde (of
// Beheren), en zolang de boeking intussen niet gewijzigd is. Geen mail.

export async function POST(req: Request) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const body = await req.json().catch(() => null)
  if (typeof body?.merge_id !== 'string') return new Response('Welke samenvoeging?', { status: 400 })

  const { data, error } = await auth.supabase.rpc('gear_unmerge_bookings', { p_merge_id: body.merge_id })
  if (error) return dbErrorResponse(error)
  const r = data as { target_id: string; restored_ids: string[] }
  after(() => calendarAfterUnmerge(r.target_id, r.restored_ids))
  return Response.json({ id: r.target_id, restored: r.restored_ids })
}
