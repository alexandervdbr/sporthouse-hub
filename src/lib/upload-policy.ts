// Shared allowlist for general-purpose uploads (client Bestanden, Sporthouse
// documents, freelancer assignment files). Built from the exact extension
// categories FileManager.tsx already defines for its own file-type icons —
// those represent every format the app already anticipates handling — minus
// .sh, the one category in there that's a real script/executable format
// rather than a media or office file.
const IMAGE_EXTS   = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif', 'heic', 'heif']
const VIDEO_EXTS    = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v']
const AUDIO_EXTS    = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma']
const ARCHIVE_EXTS  = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
const DOC_EXTS      = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt', 'ods', 'odp']
const FONT_EXTS     = ['ttf', 'otf', 'woff', 'woff2', 'eot']
const CODE_EXTS     = ['js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sql']

export const ALLOWED_UPLOAD_EXTS = [
  ...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS, ...ARCHIVE_EXTS, ...DOC_EXTS, ...FONT_EXTS, ...CODE_EXTS,
]

export const ALLOWED_UPLOAD_HINT =
  "Afbeeldingen, video's, audio, documenten, archieven, lettertypes en code-/configbestanden"

export function fileExt(filename: string): string {
  return filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
}

export function isAllowedUploadExt(filename: string): boolean {
  return ALLOWED_UPLOAD_EXTS.includes(fileExt(filename))
}

// Narrower allowlist for purpose-specific image uploads (avatars, logos).
export const ALLOWED_IMAGE_EXTS = IMAGE_EXTS
export const ALLOWED_IMAGE_HINT = 'Afbeeldingen (JPG, PNG, WebP, GIF, HEIC, …)'

export function isAllowedImageExt(filename: string): boolean {
  return ALLOWED_IMAGE_EXTS.includes(fileExt(filename))
}

// Narrower allowlist for plain-text document uploads (kennisbank), which are
// read via file.text() — a real PDF/Office file would just produce garbage
// bytes-as-text there, so restricting to actual text formats is correctness,
// not just a security nicety.
export const ALLOWED_TEXT_DOC_EXTS = ['txt', 'md', 'csv', 'rtf']
export const ALLOWED_TEXT_DOC_HINT = 'Tekstdocumenten (TXT, MD, CSV, RTF)'

export function isAllowedTextDocExt(filename: string): boolean {
  return ALLOWED_TEXT_DOC_EXTS.includes(fileExt(filename))
}
