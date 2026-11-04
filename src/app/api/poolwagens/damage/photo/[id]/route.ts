import { requirePoolwagens } from '@/lib/poolwagens/server'
import { driveThumbnailResponse, thumbnailSizeFromRequest } from '@/lib/thumbnail-response'

// GET ?size=small — het voorbeeld van een schadefoto, zoals Drive het
// rendert (gedeelde helper van de andere Drive-functies; lang in de cache).
// Wie de poolwagens gebruikt, ziet de foto's; RLS beslist of de rij bestaat.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { data } = await supabase.from('pool_car_damage_photos').select('drive_file_id').eq('id', id).maybeSingle()
  if (!data) return new Response('Foto niet gevonden.', { status: 404 })
  return driveThumbnailResponse(data.drive_file_id, thumbnailSizeFromRequest(req))
}
