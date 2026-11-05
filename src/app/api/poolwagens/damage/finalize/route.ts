import { requirePoolwagens, readJson } from '@/lib/poolwagens/server'
import { getFileMetadata, getOrCreateFolderPath, getResumableUploadResult, sporthouseRootFolderId, trashFile } from '@/lib/drive-storage'
import { isAllowedPhoto, parseFinishedUploads, photoFolderSegments, type FinishedUpload } from '@/lib/poolwagens/photos'
import { MAX_PHOTOS } from '@/lib/poolwagens/damage-input'
import { photoTarget } from '@/lib/poolwagens/photo-access'
import { poolDbErrorText } from '@/lib/poolwagens/server'
import type { UserClient } from '@/lib/poolwagens/server'

// Na de uploads: per foto bij Drive navragen wat er aankwam (niet de browser
// geloven), controleren dat het in de map van deze melding staat, en de
// verwijzing opslaan via pool_add_damage_photo. Alle foto's van een melding
// in één verzoek, met de map één keer opgezocht. Zelfde opzet als
// /api/preassist/finalize. Antwoord per foto, in dezelfde volgorde: een foto
// die mislukt, houdt de andere niet tegen.

export type FinalizeResult = { ok: true; id: string; filename: string } | { ok: false; error: string }

export async function POST(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase, user, access } = auth

  const body = (await readJson(req)) as Record<string, unknown> | null
  const reportId = typeof body?.report_id === 'string' ? body.report_id : ''
  if (!reportId) return new Response('Ongeldig verzoek.', { status: 400 })
  const parsed = parseFinishedUploads(body?.uploads, MAX_PHOTOS)
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const target = await photoTarget(supabase, reportId, user.id, access.manage, parsed.uploads.length)
  if ('error' in target) return target.error

  let folderId: string
  try {
    folderId = await getOrCreateFolderPath(photoFolderSegments(reportId), sporthouseRootFolderId()!)
  } catch (err) {
    console.error('Poolwagens: map niet te vinden:', err)
    return new Response('Kon de foto’s niet verifiëren.', { status: 502 })
  }

  const results = await Promise.all(parsed.uploads.map(u => finalizeOne(supabase, reportId, folderId, u)))
  return Response.json({ results })
}

async function finalizeOne(supabase: UserClient, reportId: string, folderId: string, u: FinishedUpload): Promise<FinalizeResult> {
  let fileId: string
  try {
    const result = await getResumableUploadResult(u.uploadUrl, u.fileSize)
    if (!result.done) return { ok: false, error: 'De foto is nog niet volledig aangekomen.' }
    fileId = result.fileId
  } catch (err) {
    console.error('Poolwagens: upload afronden mislukt:', err)
    return { ok: false, error: 'Kon de upload niet afronden.' }
  }

  let meta
  try {
    meta = await getFileMetadata(fileId)
  } catch (err) {
    console.error('Poolwagens: foto niet te verifiëren:', err)
    return { ok: false, error: 'Kon de foto niet verifiëren.' }
  }
  if (!meta.parents?.includes(folderId)) return { ok: false, error: 'Deze foto hoort niet bij deze melding.' }
  if (!isAllowedPhoto(meta.name)) {
    await trashFile(fileId).catch(() => {})
    return { ok: false, error: 'Dit bestandstype wordt niet ondersteund.' }
  }

  const { data, error } = await supabase.rpc('pool_add_damage_photo', {
    p_report_id: reportId, p_drive_file_id: fileId, p_filename: meta.name, p_mime_type: meta.mimeType,
  })
  if (error) {
    // Niet gekoppeld: dan ook niet laten rondslingeren in Drive.
    await trashFile(fileId).catch(() => {})
    return { ok: false, error: poolDbErrorText(error) }
  }
  return { ok: true, id: data as string, filename: meta.name }
}
