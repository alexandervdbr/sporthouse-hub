import { Readable } from 'stream'
import { createAdminClient } from '@/lib/supabase/server'
import { isDriveStorageConfigured, uploadFile, trashFile, downloadFile, getOrCreateFolderPath, driveRootFolderId } from '@/lib/drive-storage'
import { isAllowedUploadExt, ALLOWED_UPLOAD_HINT } from '@/lib/upload-policy'
import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { fileDeleteSchema } from '@/features/freelancers/lib/schemas-legacy'

export const maxDuration = 300

// Hoort deze opdracht bij de freelancer uit de URL? Elke methode vraagt het
// eerst, zodat een opdracht-id onder een andere freelancer niets oplevert.
async function assignmentOf(admin: ReturnType<typeof createAdminClient>, freelancerId: string, assignmentId: string) {
  if (!isUuid(freelancerId) || !isUuid(assignmentId)) return null
  const { data } = await admin
    .from('freelancer_assignments')
    .select('id, title')
    .eq('id', assignmentId)
    .eq('freelancer_id', freelancerId)
    .maybeSingle()
  return data
}

// Staff-facing download — there was previously no equivalent to the
// freelancer portal's signed-URL download at all on this side.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error
  const { id: freelancerId, assignmentId } = await params
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')
  if (!fileId) return new Response('fileId required', { status: 400 })
  if (!isUuid(fileId)) return new Response('Not found', { status: 404 })

  const admin = createAdminClient()
  if (!await assignmentOf(admin, freelancerId, assignmentId)) return new Response('Not found', { status: 404 })
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
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id: freelancerId, assignmentId } = await params

  if (!isDriveStorageConfigured()) {
    return new Response('Google Drive is niet geconfigureerd.', { status: 503 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return new Response('file required', { status: 400 })
  if (!isAllowedUploadExt(file.name)) {
    return new Response(`Dit bestandstype wordt niet ondersteund. Toegestaan: ${ALLOWED_UPLOAD_HINT}.`, { status: 400 })
  }

  const admin = createAdminClient()

  const [{ data: freelancer }, assignment] = await Promise.all([
    admin.from('freelancers').select('name').eq('id', freelancerId).maybeSingle(),
    assignmentOf(admin, freelancerId, assignmentId),
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
    try { await trashFile(driveFile.id) } catch { /* best effort cleanup */ }
    return new Response(error.message, { status: 500 })
  }
  return Response.json(data, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id: freelancerId, assignmentId } = await params
  const body = await parseBody(req, fileDeleteSchema)
  if ('error' in body) return body.error
  const { fileId } = body.data

  const admin = createAdminClient()
  if (!await assignmentOf(admin, freelancerId, assignmentId)) return new Response('Not found', { status: 404 })
  const { data: file } = await admin
    .from('freelancer_assignment_files')
    .select('file_url, storage_provider, drive_file_id')
    .eq('id', fileId).eq('assignment_id', assignmentId)
    .single()

  if (file) {
    if (file.storage_provider === 'drive' && file.drive_file_id) {
      try { await trashFile(file.drive_file_id) } catch (err) { console.error('Drive delete error:', err) }
    } else if (file.file_url) {
      await admin.storage.from('freelancer-assignments').remove([file.file_url])
    }
  }

  await admin.from('freelancer_assignment_files').delete()
    .eq('id', fileId).eq('assignment_id', assignmentId)

  return new Response(null, { status: 204 })
}
