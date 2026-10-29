import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params

  // Fetch the reservation to find the group (same equipment + pickup_datetime)
  const { data: res } = await supabase
    .from('equipment_reservations')
    .select('equipment_id, pickup_datetime')
    .eq('id', id)
    .single()

  if (!res) return new Response('Not found', { status: 404 })

  // Een reservatie over meerdere dagen is één rij per dag: die gaan samen weg.
  const { error } = res.pickup_datetime
    ? await supabase
        .from('equipment_reservations')
        .delete()
        .eq('equipment_id', res.equipment_id)
        .eq('pickup_datetime', res.pickup_datetime)
    : await supabase.from('equipment_reservations').delete().eq('id', id)

  if (error) return new Response(error.message, { status: 500 })

  return new Response(null, { status: 204 })
}
