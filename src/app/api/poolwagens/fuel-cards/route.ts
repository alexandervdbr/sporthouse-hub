import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'
import type { FuelCard } from '@/lib/poolwagens/types'

// GET — per wagen het volledige tankkaartnummer en of er een pincode is
// (beheer). De pincodes zelf zitten hier niet in (pool_fuel_cards, 0087).
export async function GET() {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { data, error } = await auth.supabase.rpc('pool_fuel_cards')
  if (error) return dbErrorResponse(error)
  return Response.json((data ?? []) as FuelCard[], { headers: { 'Cache-Control': 'no-store' } })
}
