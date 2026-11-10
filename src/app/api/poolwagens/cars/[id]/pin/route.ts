import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'

// POST — de pincode van de tankkaart van deze wagen. De database beslist wie
// ze krijgt (pool_fuel_card_pin, 0087): wie op dat moment met de wagen
// onderweg is, en beheer. Een POST en no-store, zodat geen enkele cache ze
// bewaart; ze komt ook nooit in een log.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { id } = await params

  const { data, error } = await auth.supabase.rpc('pool_fuel_card_pin', { p_car_id: id })
  if (error) return dbErrorResponse(error)
  return Response.json({ pin: (data as string | null) ?? null }, { headers: { 'Cache-Control': 'no-store, private' } })
}
