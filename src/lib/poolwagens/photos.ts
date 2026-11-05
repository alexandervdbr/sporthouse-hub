import { ALLOWED_IMAGE_EXTS, fileExt } from '@/lib/upload-policy'

// Schadefoto's: alleen beeld, geen svg (zoals Pré-assist: een svg kan scripts
// bevatten). Ze gaan rechtstreeks van de browser naar Google Drive, in de map
// Poolwagens/Schade/<melding> onder de interne Sporthouse-map.

export const PHOTO_EXTS = ALLOWED_IMAGE_EXTS.filter(e => e !== 'svg')
export const PHOTO_HINT = 'Foto’s (JPG, PNG, HEIC, WebP, …)'
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const MAX_PHOTO_LABEL = '25 MB'

export function isAllowedPhoto(filename: string): boolean {
  return PHOTO_EXTS.includes(fileExt(filename))
}

export function photoFolderSegments(reportId: string): string[] {
  return ['Poolwagens', 'Schade', reportId]
}

export const DRIVE_UPLOAD_URL_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files?'

// ── Meerdere foto's tegelijk ────────────────────────────────────────────────
// De browser vraagt in één keer een uploadsessie voor alle foto's van een
// melding (de map wordt dan één keer opgezocht of aangemaakt), stuurt de
// bytes daarna met hoogstens PARALLEL_UPLOADS tegelijk naar Drive, en rondt
// alles in één verzoek af.

/** Hoeveel foto's de browser tegelijk naar Drive stuurt. */
export const PARALLEL_UPLOADS = 3

export interface PhotoFile { filename: string; mimeType: string; fileSize: number }
export interface FinishedUpload { uploadUrl: string; fileSize: number }

/** De foto's van één verzoek, of de reden waarom het niet mag. */
export function parsePhotoFiles(value: unknown, existing: number, max: number): { files: PhotoFile[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: 'Ongeldig verzoek.' }
  if (existing + value.length > max) return { error: `Hoogstens ${max} foto’s per melding.` }
  const files: PhotoFile[] = []
  for (const v of value) {
    const o = (v ?? {}) as Record<string, unknown>
    const filename = typeof o.filename === 'string' ? o.filename.trim().slice(0, 200) : ''
    const mimeType = typeof o.mimeType === 'string' && o.mimeType ? o.mimeType : 'application/octet-stream'
    const fileSize = typeof o.fileSize === 'number' ? o.fileSize : NaN
    if (!filename || !Number.isFinite(fileSize) || fileSize <= 0) return { error: 'Ongeldig verzoek.' }
    if (!isAllowedPhoto(filename)) return { error: `${filename}: dit bestandstype wordt niet ondersteund. Toegestaan: ${PHOTO_HINT}.` }
    if (fileSize > MAX_PHOTO_BYTES) return { error: `${filename} is groter dan ${MAX_PHOTO_LABEL}.` }
    files.push({ filename, mimeType, fileSize })
  }
  return { files }
}

/** De afgeronde uploads van één verzoek; alleen Drive-uploadsessies. */
export function parseFinishedUploads(value: unknown, max: number): { uploads: FinishedUpload[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return { error: 'Ongeldig verzoek.' }
  const uploads: FinishedUpload[] = []
  for (const v of value) {
    const o = (v ?? {}) as Record<string, unknown>
    const uploadUrl = typeof o.uploadUrl === 'string' ? o.uploadUrl : ''
    const fileSize = typeof o.fileSize === 'number' ? o.fileSize : NaN
    if (!uploadUrl || !Number.isFinite(fileSize) || fileSize <= 0) return { error: 'Ongeldig verzoek.' }
    // De sessie-URL komt van de browser: naar niets anders dan Drive.
    if (!uploadUrl.startsWith(DRIVE_UPLOAD_URL_PREFIX)) return { error: 'Ongeldige upload-URL.' }
    uploads.push({ uploadUrl, fileSize })
  }
  return { uploads }
}

/** fn op elk element, met hoogstens `limit` tegelijk; de uitkomsten in dezelfde volgorde. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
