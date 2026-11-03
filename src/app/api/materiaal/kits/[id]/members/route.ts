import { requireGear, dbErrorResponse, optionalText } from '@/lib/gear/server'
import { labelMoveEffects } from '@/lib/gear/move-labels'
import type { GearMoveResult } from '@/lib/gear/types'

// Onderdelen van een kit. Alles loopt via de databasefuncties, zodat de
// verhuisgeschiedenis klopt en komende boekingen mee kunnen:
// POST   { item_id, update_bookings }  → in deze kit (verhuist uit een andere)
// DELETE { item_id, update_bookings }  → uit deze kit, item wordt los
// PATCH  { order: [item_id, …] }       → volgorde

async function move(itemId: string | null, kitId: string | null, update: unknown) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  if (!itemId) return new Response('Kies een onderdeel.', { status: 400 })
  const { data, error } = await auth.supabase.rpc('gear_move_item', {
    p_item_id: itemId, p_to_kit_id: kitId, p_update_bookings: update !== false,
  })
  if (error) return dbErrorResponse(error)
  const result = data as GearMoveResult
  return Response.json({
    updated: await labelMoveEffects(result.updated ?? []),
    failed: await labelMoveEffects(result.failed ?? []),
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  return move(optionalText(body.item_id), id, body.update_bookings)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  const body = await req.json()
  return move(optionalText(body.item_id), null, body.update_bookings)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { id } = await params
  const body = await req.json()
  if (!Array.isArray(body.order) || body.order.some((x: unknown) => typeof x !== 'string')) {
    return new Response('Ongeldige volgorde', { status: 400 })
  }
  const { error } = await auth.supabase.rpc('gear_reorder_kit', { p_kit_id: id, p_item_ids: body.order })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
