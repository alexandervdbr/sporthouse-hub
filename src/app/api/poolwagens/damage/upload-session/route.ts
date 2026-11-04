import { requirePoolwagens, readJson } from '@/lib/poolwagens/server'
import { createResumableUploadSession, driveErrorMessage, getOrCreateFolderPath, isSporthouseDriveConfigured, sporthouseRootFolderId } from '@/lib/drive-storage'
import { isAllowedPhoto, MAX_PHOTO_BYTES, MAX_PHOTO_LABEL, PHOTO_HINT, photoFolderSegments } from '@/lib/poolwagens/photos'
import { photoTarget } from '@/lib/poolwagens/photo-access'

// Opent een Drive-sessie voor één schadefoto en geeft de browser de
// sessie-URL; die stuurt de bytes rechtstreeks naar Google. Deze route raakt
// nooit bestandsinhoud aan (zelfde opzet als /api/preassist/upload-session).
export async function POST(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase, user, access } = auth

  if (!isSporthouseDriveConfigured()) return new Response('Google Drive is niet geconfigureerd.', { status: 503 })

  const body = (await readJson(req)) as Record<string, unknown> | null
  const reportId = typeof body?.report_id === 'string' ? body.report_id : ''
  const filename = typeof body?.filename === 'string' ? body.filename.trim() : ''
  const mimeType = typeof body?.mimeType === 'string' && body.mimeType ? body.mimeType : 'application/octet-stream'
  const fileSize = typeof body?.fileSize === 'number' ? body.fileSize : NaN
  if (!reportId || !filename || !Number.isFinite(fileSize) || fileSize <= 0) return new Response('Ongeldig verzoek.', { status: 400 })
  if (!isAllowedPhoto(filename)) return new Response(`Dit bestandstype wordt niet ondersteund. Toegestaan: ${PHOTO_HINT}.`, { status: 400 })
  if (fileSize > MAX_PHOTO_BYTES) return new Response(`Een foto mag niet groter zijn dan ${MAX_PHOTO_LABEL}.`, { status: 400 })

  const target = await photoTarget(supabase, reportId, user.id, access.manage)
  if ('error' in target) return target.error

  try {
    const folderId = await getOrCreateFolderPath(photoFolderSegments(reportId), sporthouseRootFolderId()!)
    const uploadUrl = await createResumableUploadSession(filename.slice(0, 200), mimeType, folderId, fileSize)
    return Response.json({ uploadUrl })
  } catch (err) {
    console.error('Poolwagens: uploadsessie mislukt:', err)
    return new Response(driveErrorMessage(err), { status: 502 })
  }
}
