import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { getFileMetadata, getOrCreateFolderPath, getResumableUploadResult, sporthouseRootFolderId, trashFile } from '@/lib/drive-storage'
import { DRIVE_UPLOAD_URL_PREFIX, isAllowedPhoto, photoFolderSegments } from '@/lib/poolwagens/photos'
import { photoTarget } from '@/lib/poolwagens/photo-access'

// Na de upload: bij Drive navragen wat er aankwam (niet de browser geloven),
// controleren dat het in de map van deze melding staat, en de verwijzing
// opslaan via pool_add_damage_photo. Zelfde opzet als /api/preassist/finalize.
export async function POST(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase, user, access } = auth

  const body = (await readJson(req)) as Record<string, unknown> | null
  const reportId = typeof body?.report_id === 'string' ? body.report_id : ''
  const uploadUrl = typeof body?.uploadUrl === 'string' ? body.uploadUrl : ''
  const fileSize = typeof body?.fileSize === 'number' ? body.fileSize : NaN
  if (!reportId || !uploadUrl || !Number.isFinite(fileSize) || fileSize <= 0) return new Response('Ongeldig verzoek.', { status: 400 })
  // De sessie-URL komt van de browser: hier wordt naar niets anders dan een
  // Drive-uploadsessie geschreven.
  if (!uploadUrl.startsWith(DRIVE_UPLOAD_URL_PREFIX)) return new Response('Ongeldige upload-URL.', { status: 400 })

  const target = await photoTarget(supabase, reportId, user.id, access.manage)
  if ('error' in target) return target.error

  let fileId: string
  try {
    const result = await getResumableUploadResult(uploadUrl, fileSize)
    if (!result.done) return new Response('De foto is nog niet volledig aangekomen.', { status: 409 })
    fileId = result.fileId
  } catch (err) {
    console.error('Poolwagens: upload afronden mislukt:', err)
    return new Response('Kon de upload niet afronden.', { status: 502 })
  }

  let meta
  try {
    meta = await getFileMetadata(fileId)
    const expected = await getOrCreateFolderPath(photoFolderSegments(reportId), sporthouseRootFolderId()!)
    if (!meta.parents?.includes(expected)) return new Response('Deze foto hoort niet bij deze melding.', { status: 400 })
  } catch (err) {
    console.error('Poolwagens: foto niet te verifiëren:', err)
    return new Response('Kon de foto niet verifiëren.', { status: 502 })
  }
  if (!isAllowedPhoto(meta.name)) {
    await trashFile(fileId).catch(() => {})
    return new Response('Dit bestandstype wordt niet ondersteund.', { status: 400 })
  }

  const { data, error } = await supabase.rpc('pool_add_damage_photo', {
    p_report_id: reportId, p_drive_file_id: fileId, p_filename: meta.name, p_mime_type: meta.mimeType,
  })
  if (error) {
    // Niet gekoppeld: dan ook niet laten rondslingeren in Drive.
    await trashFile(fileId).catch(() => {})
    return dbErrorResponse(error)
  }
  return Response.json({ id: data, filename: meta.name }, { status: 201 })
}
