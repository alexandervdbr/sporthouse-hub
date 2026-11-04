import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'

// POST — de blokkade van een ernstige melding opheffen zonder dat ze
// hersteld is. Alleen beheer (pool_lift_damage_block).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase.rpc('pool_lift_damage_block', { p_id: id })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
