import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseDamageInput } from '@/lib/poolwagens/damage-input'
import { DAMAGE_COLUMNS, type DamageReport } from '@/lib/poolwagens/types'

// GET ?car=&scope=open|all — schademeldingen, nieuwste eerst. "open" = nog
// niet hersteld (standaard). De mailstatus ziet alleen beheer.
// POST — schade melden (pool_report_damage). Foto's komen erna, via
// upload-session en finalize; de mail vertrekt via [id]/notify.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase, access } = auth

  const params = new URL(req.url).searchParams
  const car = params.get('car')
  let q = supabase.from('pool_car_damage_reports').select(DAMAGE_COLUMNS).order('created_at', { ascending: false }).limit(200)
  if (car && UUID_RE.test(car)) q = q.eq('car_id', car)
  if (params.get('scope') !== 'all') q = q.neq('status', 'hersteld')
  const { data, error } = await q
  if (error) return dbErrorResponse(error)

  type Row = Omit<DamageReport, 'photos'> & { pool_car_damage_photos: { id: string; filename: string }[] }
  const reports: DamageReport[] = ((data ?? []) as unknown as Row[]).map(({ pool_car_damage_photos, ...r }) => ({
    ...r,
    mail_status: access.manage ? r.mail_status : null,
    mail_error: access.manage ? r.mail_error : null,
    photos: pool_car_damage_photos ?? [],
  }))
  return Response.json(reports)
}

export async function POST(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = parseDamageInput(await readJson(req))
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { data, error } = await supabase.rpc('pool_report_damage', parsed.args)
  if (error) return dbErrorResponse(error)
  return Response.json({ id: data }, { status: 201 })
}
