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
