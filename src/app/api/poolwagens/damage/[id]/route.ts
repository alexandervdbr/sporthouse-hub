import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { isDamageStatus } from '@/lib/poolwagens/damage-input'

// PATCH { status } — gemeld → in behandeling → hersteld. Alleen beheer; de
// database controleert het opnieuw (pool_set_damage_status). Hersteld heft
// de blokkade van een ernstige melding op.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = (await readJson(req)) as { status?: unknown } | null
  if (!isDamageStatus(body?.status)) return new Response('Onbekende status.', { status: 400 })

  const { error } = await supabase.rpc('pool_set_damage_status', { p_id: id, p_status: body.status })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
