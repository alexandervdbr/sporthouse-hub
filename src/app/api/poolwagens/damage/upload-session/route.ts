import { requirePoolwagens, readJson } from '@/lib/poolwagens/server'
import { createResumableUploadSession, driveErrorMessage, getOrCreateFolderPath, isSporthouseDriveConfigured, sporthouseRootFolderId } from '@/lib/drive-storage'
import { parsePhotoFiles, photoFolderSegments } from '@/lib/poolwagens/photos'
import { MAX_PHOTOS } from '@/lib/poolwagens/damage-input'
import { photoTarget } from '@/lib/poolwagens/photo-access'

// Opent in één keer een Drive-sessie voor elke foto van een melding en geeft
// de browser de sessie-URL's; die stuurt de bytes rechtstreeks naar Google.
// De map Poolwagens/Schade/<melding> wordt hier één keer opgezocht of
// aangemaakt, vóór de uploads parallel lopen (anders kunnen er twee mappen
// met dezelfde naam ontstaan). Deze route raakt nooit bestandsinhoud aan
// (zelfde opzet als /api/preassist/upload-session).
export async function POST(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase, user, access } = auth

  if (!isSporthouseDriveConfigured()) return new Response('Google Drive is niet geconfigureerd.', { status: 503 })

  const body = (await readJson(req)) as Record<string, unknown> | null
  const reportId = typeof body?.report_id === 'string' ? body.report_id : ''
  if (!reportId) return new Response('Ongeldig verzoek.', { status: 400 })
  const parsed = parsePhotoFiles(body?.files, 0, MAX_PHOTOS)
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  // Ook de foto's die al bij de melding staan, tellen mee.
  const target = await photoTarget(supabase, reportId, user.id, access.manage, parsed.files.length)
  if ('error' in target) return target.error

  try {
    const folderId = await getOrCreateFolderPath(photoFolderSegments(reportId), sporthouseRootFolderId()!)
    const uploadUrls = await Promise.all(parsed.files.map(f => createResumableUploadSession(f.filename, f.mimeType, folderId, f.fileSize)))
    return Response.json({ uploadUrls })
  } catch (err) {
    console.error('Poolwagens: uploadsessie mislukt:', err)
    return new Response(driveErrorMessage(err), { status: 502 })
  }
}
