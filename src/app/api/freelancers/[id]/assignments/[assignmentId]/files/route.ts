import { Readable } from 'stream'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isDriveStorageConfigured, uploadFile, deleteFile, downloadFile, getOrCreateFolderPath, driveRootFolderId } from '@/lib/drive-storage'

export const maxDuration = 60

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') ? user : null
}

// Staff-facing download — there was previously no equivalent to the
// freelancer portal's signed-URL download at all on this side.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { assignmentId } = await params
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')
  if (!fileId) return new Response('fileId required', { status: 400 })

  const admin = createAdminClient()
  const { data: file } = await admin
    .from('freelancer_assignment_files')
    .select('file_name, file_url, storage_provider, drive_file_id')
    .eq('id', fileId).eq('assignment_id', assignmentId)
    .single()

  if (!file) return new Response('Not found', { status: 404 })

  if (file.storage_provider === 'drive' && file.drive_file_id) {
    try {
      const stream = await downloadFile(file.drive_file_id)
      const webStream = Readable.toWeb(stream as Readable) as ReadableStream
      return new Response(webStream, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(file.file_name)}"`,
        },
      })
    } catch (err) {
      console.error('Drive download error:', err)
      return new Response('Kon bestand niet downloaden.', { status: 500 })
    }
  }

  if (!file.file_url) return new Response('Not found', { status: 404 })
  const { data: signed } = await admin.storage.from('freelancer-assignments').createSignedUrl(file.file_url, 3600)
  if (!signed?.signedUrl) return new Response('Kon URL niet genereren.', { status: 500 })
  return Response.redirect(signed.signedUrl)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { id: freelancerId, assignmentId } = await params

  if (!isDriveStorageConfigured()) {
    return new Response('Google Drive is niet geconfigureerd.', { status: 503 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return new Response('file required', { status: 400 })

  const admin = createAdminClient()

  const [{ data: freelancer }, { data: assignment }] = await Promise.all([
    admin.from('freelancers').select('name').eq('id', freelancerId).single(),
    admin.from('freelancer_assignments').select('title').eq('id', assignmentId).single(),
  ])
  if (!freelancer || !assignment) return new Response('Not found', { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())

  let driveFile
  try {
    const folderId = await getOrCreateFolderPath(
      ['Freelancers', `${freelancer.name} — ${assignment.title}`],
      driveRootFolderId()!
    )
    driveFile = await uploadFile(buffer, file.name, file.type || 'application/octet-stream', folderId)
  } catch (err) {
    console.error('Drive upload error:', err)
    return new Response('Upload naar Drive mislukt.', { status: 500 })
  }

  const { data, error } = await admin
    .from('freelancer_assignment_files')
    .insert({
      assignment_id: assignmentId,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      storage_provider: 'drive',
      drive_file_id: driveFile.id,
      web_view_link: driveFile.webViewLink,
      web_content_link: driveFile.webContentLink,
      thumbnail_link: driveFile.thumbnailLink,
    })
    .select()
    .single()

  if (error) {
    console.error('DB insert error:', error)
    try { await deleteFile(driveFile.id) } catch { /* best effort cleanup */ }
    return new Response(error.message, { status: 500 })
  }
  return Response.json(data, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { assignmentId } = await params
  const { fileId } = await req.json()

  const admin = createAdminClient()
  const { data: file } = await admin
    .from('freelancer_assignment_files')
    .select('file_url, storage_provider, drive_file_id')
    .eq('id', fileId).eq('assignment_id', assignmentId)
    .single()

  if (file) {
    if (file.storage_provider === 'drive' && file.drive_file_id) {
      try { await deleteFile(file.drive_file_id) } catch (err) { console.error('Drive delete error:', err) }
    } else if (file.file_url) {
      await admin.storage.from('freelancer-assignments').remove([file.file_url])
    }
  }

  await admin.from('freelancer_assignment_files').delete()
    .eq('id', fileId).eq('assignment_id', assignmentId)

  return new Response(null, { status: 204 })
}
