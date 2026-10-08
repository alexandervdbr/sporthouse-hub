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
// 'key' is Keynote. Net als de Office- en OpenDocument-formaten hierboven een
// presentatiebestand dat we alleen opslaan en teruggeven, nooit uitlezen.
const DOC_EXTS      = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'key', 'txt', 'md', 'csv', 'rtf', 'odt', 'ods', 'odp']
const FONT_EXTS     = ['ttf', 'otf', 'woff', 'woff2', 'eot']
const CODE_EXTS     = ['js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sql']
// Design/creative source files (Adobe, Affinity, Figma, Sketch). Binary project
// files we only ever store and hand back — never parse — so they're as safe to
// keep as any archive, and the team uploads them as templates.
const DESIGN_EXTS   = ['psd', 'psb', 'ai', 'indd', 'idml', 'eps', 'xd', 'sketch', 'fig', 'afphoto', 'afdesign', 'afpub', 'aep', 'prproj', 'mogrt']

export const ALLOWED_UPLOAD_EXTS = [
  ...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS, ...ARCHIVE_EXTS, ...DOC_EXTS, ...FONT_EXTS, ...CODE_EXTS,
  ...DESIGN_EXTS,
]

export const ALLOWED_UPLOAD_HINT =
  "Afbeeldingen, video's, audio, documenten en presentaties (PDF, Office, Keynote, …), archieven, lettertypes, ontwerpbestanden (PSD, AI, INDD, …) en code-/configbestanden"

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

// One ceiling for general-purpose uploads, instead of the same number copied
// into four routes and a component — where it had already started drifting.
//
// Only reachable through the chunked upload path (upload-session → relay →
// finalize), which slices the file client-side. A whole file posted in one
// request can never get near this: Vercel rejects any function request body
// over 4.5 MB before our code runs, whatever we allow here.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_UPLOAD_LABEL = '2 GB'

// Media types we're willing to serve inline, so the browser plays a file in
// place instead of downloading it.
//
// Deliberately only audio and video. Serving an upload inline means the
// browser renders it in our origin — for HTML or SVG that's a script
// execution hole, since anyone who can upload could then run code as a
// logged-in colleague. Those stay downloads, and anything not on this list
// falls back to application/octet-stream.
const INLINE_MIME_BY_EXT: Record<string, string> = {
  mp4:  'video/mp4',
  m4v:  'video/x-m4v',
  mov:  'video/quicktime',
  webm: 'video/webm',
  mkv:  'video/x-matroska',
  avi:  'video/x-msvideo',
  wmv:  'video/x-ms-wmv',
  flv:  'video/x-flv',
  mp3:  'audio/mpeg',
  m4a:  'audio/mp4',
  wav:  'audio/wav',
  aac:  'audio/aac',
  flac: 'audio/flac',
  ogg:  'audio/ogg',
  wma:  'audio/x-ms-wma',
}

export function inlineMimeType(fileTypeOrName: string): string | null {
  const ext = fileTypeOrName.includes('.') ? fileExt(fileTypeOrName) : fileTypeOrName.toLowerCase()
  return INLINE_MIME_BY_EXT[ext] ?? null
}
