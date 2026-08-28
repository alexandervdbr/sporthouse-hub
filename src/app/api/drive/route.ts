import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createDriveFile, trashDriveFile, renameDriveFile, isDriveConfigured, type DriveDocType } from '@/lib/google-drive'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return new Response('clientId required', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drive_files')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  if (!isDriveConfigured()) return new Response('Google Drive niet geconfigureerd', { status: 503 })

  const { clientId, clientName, type, name } = await req.json()
  if (!clientId || !clientName || !type || !name?.trim()) {
    return new Response('clientId, clientName, type en name zijn verplicht', { status: 400 })
  }

  const admin = createAdminClient()

  const driveFile = await createDriveFile(type as DriveDocType, name.trim(), clientId, clientName)

  const { data, error } = await admin
    .from('drive_files')
    .insert({
      client_id:     clientId,
      drive_file_id: driveFile.id,
      name:          driveFile.name,
      mime_type:     driveFile.mimeType,
      created_by:    user.email,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id, name } = await req.json()
  if (!id || !name?.trim()) return new Response('id en name zijn verplicht', { status: 400 })

  const admin = createAdminClient()
  const { data: record } = await admin.from('drive_files').select('drive_file_id').eq('id', id).single()
  if (!record) return new Response('Niet gevonden', { status: 404 })

  await renameDriveFile(record.drive_file_id, name.trim())
  const { data, error } = await admin.from('drive_files').update({ name: name.trim() }).eq('id', id).select().single()
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return new Response('id required', { status: 400 })

  const admin = createAdminClient()
  const { data: record } = await admin.from('drive_files').select('drive_file_id').eq('id', id).single()
  if (!record) return new Response('Niet gevonden', { status: 404 })

  try { await trashDriveFile(record.drive_file_id) } catch { /* file may already be deleted in Drive */ }

  const { error } = await admin.from('drive_files').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
