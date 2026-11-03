import { requireGear, dbErrorResponse } from '@/lib/gear/server'

// Een kit opheffen: de onderdelen worden los, de kit blijft bewaard voor de
// geschiedenis. Komende boekingen via deze kit houden hun items.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { id } = await params
  const { data, error } = await auth.supabase.rpc('gear_dissolve_kit', { p_kit_id: id })
  if (error) return dbErrorResponse(error)
  return Response.json({ released: data })
}
