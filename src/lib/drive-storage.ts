import { google } from 'googleapis'
import { Readable } from 'stream'
import { createAdminClient } from '@/lib/supabase/server'
import { extractPsdThumbnail, isPsdFilename, PSD_HEAD_BYTES } from '@/lib/psd-thumbnail'
import type { SupabaseClient } from '@supabase/supabase-js'

// Shared Drive-as-storage layer, used by every feature that stores files in
// Google Drive with only metadata in Supabase (Pré-Assist first, more to
// follow — see the platform-wide storage plan). One service account, one
// Shared Drive, one root folder; each feature gets its own subfolder via
// getOrCreateFolder/getOrCreateFolderPath rather than its own env var.
//
// Falls back to the original GOOGLE_PREASSIST_* env vars when the generic
// GOOGLE_DRIVE_* ones aren't set yet, so existing deployments keep working
// without a forced env var rename.

export interface DriveUploadedFile {
  id: string
  name: string
  mimeType: string
  size: string | null | undefined
  webViewLink: string
  webContentLink: string | null | undefined
  thumbnailLink: string | null | undefined
}

function serviceAccountEmail() {
  return process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? process.env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_EMAIL
}

function serviceAccountKey() {
  const key = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY ?? process.env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_PRIVATE_KEY
  return key?.replace(/\\n/g, '\n')
}

export function driveRootFolderId() {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? process.env.GOOGLE_PREASSIST_DRIVE_FOLDER_ID
}

// Sporthouse Intern documents (Financiën/Administratie) live in their own
// Shared Drive with only the service account as a member — a hard isolation
// boundary, independent of the shared root used by every other feature, so
// staff access to client-file folders there can never imply visibility into
// finance/admin docs.
export function sporthouseRootFolderId() {
  return process.env.GOOGLE_DRIVE_SPORTHOUSE_ROOT_FOLDER_ID
}

export function isSporthouseDriveConfigured() {
  return !!(serviceAccountEmail() && serviceAccountKey() && sporthouseRootFolderId())
}

function getClient() {
  const email = serviceAccountEmail()
  const key   = serviceAccountKey()
  if (!email || !key) throw new Error('Google Drive niet geconfigureerd.')
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/drive'] })
  return google.drive({ version: 'v3', auth })
}

export function isDriveStorageConfigured() {
  return !!(serviceAccountEmail() && serviceAccountKey() && driveRootFolderId())
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts) await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastErr
}

async function sharePublicly(fileId: string) {
  try {
    const drive = getClient()
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    })
  } catch (err) {
    // Sharing failure shouldn't block the upload — file is still safely
    // stored, only the public webViewLink/thumbnailLink won't resolve.
    console.error('Drive storage: kon permissie niet instellen:', err)
  }
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folderId: string,
  options?: { public?: boolean }
): Promise<DriveUploadedFile> {
  const drive = getClient()

  const file = await withRetry(() => drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink',
    supportsAllDrives: true,
  }))

  const fileId = file.data.id!
  if (options?.public !== false) await sharePublicly(fileId)

  return {
    id:             fileId,
    name:           file.data.name!,
    mimeType:       file.data.mimeType!,
    size:           file.data.size,
    webViewLink:    file.data.webViewLink!,
    webContentLink: file.data.webContentLink,
    thumbnailLink:  file.data.thumbnailLink,
  }
}

// ─── Direct-to-Drive resumable upload (browser bypasses our server entirely
// for the file bytes) ───────────────────────────────────────────────────────
//
// Our server only ever handles two small, fast, byte-free calls: opening the
// session (this function) and, once the browser has PUT the bytes straight to
// Google, fetching the resulting file's metadata (getFileMetadata). Removes
// the old double-hop (browser -> our server, fully buffered -> Drive) that
// made large uploads slow and memory-heavy, and removes our serverless
// function's duration/memory limits as a ceiling on upload size.

export async function createResumableUploadSession(
  filename: string,
  mimeType: string,
  folderId: string,
  fileSize: number
): Promise<string> {
  const email = serviceAccountEmail()
  const key = serviceAccountKey()
  if (!email || !key) throw new Error('Google Drive niet geconfigureerd.')

  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/drive'] })
  const { token } = await auth.getAccessToken()
  if (!token) throw new Error('Kon geen Drive-toegangstoken ophalen.')

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(fileSize),
    },
    body: JSON.stringify({ name: filename, parents: [folderId] }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Kon upload-sessie niet starten: ${res.status} ${text}`)
  }

  const location = res.headers.get('Location')
  if (!location) throw new Error('Geen upload-sessie-URL ontvangen van Drive.')
  return location
}

// Called after the browser has PUT the file bytes straight to the session
// URL above — fetches canonical metadata via our own service-account
// credentials (rather than trusting whatever the client claims), which also
// doubles as an existence/ownership check on the given file id.
export async function getFileMetadata(fileId: string): Promise<DriveUploadedFile> {
  const drive = getClient()
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink',
    supportsAllDrives: true,
  })
  await sharePublicly(fileId)
  return {
    id:             res.data.id!,
    name:           res.data.name!,
    mimeType:       res.data.mimeType!,
    size:           res.data.size,
    webViewLink:    res.data.webViewLink!,
    webContentLink: res.data.webContentLink,
    thumbnailLink:  res.data.thumbnailLink,
  }
}

export async function updateFileContent(driveFileId: string, buffer: Buffer, mimeType: string) {
  const drive = getClient()
  await drive.files.update({
    fileId: driveFileId,
    media: { mimeType, body: Readable.from(buffer) },
    supportsAllDrives: true,
  })
}

// The Drive service account is a Content Manager on this Shared Drive, not
// a Manager — files.delete() (true, permanent removal) always fails as a
// 404 for that role, silently, no matter the caller. Kept only in case the
// account's role is ever elevated; every real call site in this codebase
// uses trashFile/trashDriveFolder below instead, which a Content Manager
// genuinely can do.
export async function deleteFile(driveFileId: string) {
  const drive = getClient()
  await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true })
}

export async function trashFile(driveFileId: string) {
  const drive = getClient()
  await drive.files.update({ fileId: driveFileId, requestBody: { trashed: true }, supportsAllDrives: true })
}

export async function restoreFile(driveFileId: string) {
  const drive = getClient()
  await drive.files.update({ fileId: driveFileId, requestBody: { trashed: false }, supportsAllDrives: true })
}

export async function moveFile(driveFileId: string, newParentId: string) {
  const drive = getClient()
  const current = await drive.files.get({ fileId: driveFileId, fields: 'parents', supportsAllDrives: true })
  const oldParents = (current.data.parents ?? []).join(',')
  await drive.files.update({
    fileId: driveFileId,
    addParents: newParentId,
    removeParents: oldParents,
    supportsAllDrives: true,
  })
}

// Combines a trash + move into one update call — used when deleting a folder
// "with contents": the file needs to land in the trash, but it also has to be
// relocated out of the folder first, otherwise the folder's own Drive delete
// would permanently destroy it along with the folder, defeating the 30-day
// recovery window the trash system otherwise guarantees.
export async function trashAndMoveFile(driveFileId: string, newParentId: string) {
  const drive = getClient()
  const current = await drive.files.get({ fileId: driveFileId, fields: 'parents', supportsAllDrives: true })
  const oldParents = (current.data.parents ?? []).join(',')
  await drive.files.update({
    fileId: driveFileId,
    requestBody: { trashed: true },
    addParents: newParentId,
    removeParents: oldParents,
    supportsAllDrives: true,
  })
}

export async function downloadFile(driveFileId: string) {
  const drive = getClient()
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  )
  return res.data as unknown as NodeJS.ReadableStream
}

export interface DriveRangeResult {
  stream: NodeJS.ReadableStream
  // Present when Drive answered with a partial body; mirrored back to the
  // browser so it knows which slice it got.
  contentRange?: string
  contentLength?: string
  partial: boolean
}

// Same download, but passing a browser's Range header through to Drive.
//
// Worth the extra path because this route streams through a function with a
// hard duration limit: a 2 GB file on a slow connection simply can't finish
// inside it. With ranges the browser asks for bounded slices instead, each
// comfortably inside the limit, and can resume rather than start over when a
// connection drops. Drive honours Range on alt=media — verified, it answers
// 206 with a Content-Range.
export async function downloadFileRange(
  driveFileId: string,
  range: string
): Promise<DriveRangeResult> {
  const drive = getClient()
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream', headers: { Range: range } }
  )
  const headers = res.headers as Record<string, string | undefined>
  return {
    stream: res.data as unknown as NodeJS.ReadableStream,
    contentRange: headers['content-range'],
    contentLength: headers['content-length'],
    // Drive is free to ignore the Range and send the whole file; status says
    // which happened, and the response must match what actually came back.
    partial: res.status === 206,
  }
}

// Drive renders a flat preview image for formats the browser can't display
// itself — a PSD, a video's poster frame — which is all you need to recognise
// a file, and far cheaper than booting Drive's whole preview app in an iframe.
//
// The large size is pinned to =s2400 on purpose. Measured against real PSDs,
// Drive caps these at 1024px on the long edge and returns the identical image
// for =s1600, =s2400 and =s4000 — so this asks for the maximum it will ever
// give. Asking for one fixed size also means Drive only ever generates and
// caches a single variant: the first request for a size it hasn't rendered
// before took 15s in testing, every later one a few hundred ms.
//
// Returns null rather than throwing when Drive has no thumbnail (folders,
// formats it can't render, a file still being processed right after upload)
// so callers can quietly fall back to the preview iframe.
// Two fixed sizes, no arbitrary numbers: a list tile is ~36px (220 covers it
// on a retina screen at a few tens of KB), the viewer wants everything Drive
// will give. Keeping it to two means Drive renders at most two variants per
// file, so the slow first-render is paid twice per file at worst, ever.
const THUMBNAIL_SIZES = { small: 220, large: 2400 } as const
export type ThumbnailSize = keyof typeof THUMBNAIL_SIZES

export interface DriveThumbnailResult {
  body: ReadableStream
  contentType: string
  // True when this is Photoshop's own small embedded preview rather than
  // Drive's render — capped at 160px, so the UI should present it as a rough
  // impression instead of the real thing.
  limited?: boolean
}

export async function fetchThumbnail(
  driveFileId: string,
  size: ThumbnailSize = 'large'
): Promise<DriveThumbnailResult | null> {
  const drive = getClient()

  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: 'thumbnailLink, name',
    supportsAllDrives: true,
  })

  const link = meta.data.thumbnailLink
  // Drive stops rendering previews somewhere above 40-90 MB and then offers
  // no thumbnail at all — which hits exactly the large design files you most
  // need to recognise. A PSD carries its own preview, so fall back to that.
  if (!link) {
    const name = meta.data.name
    if (!name || !isPsdFilename(name)) return null
    return fetchEmbeddedPsdThumbnail(driveFileId)
  }

  // Google's own link carries a small default (=s220). Swap it for ours.
  const sized = link.replace(/=s\d+(-c)?$/, `=s${THUMBNAIL_SIZES[size]}`)

  // This URL is short-lived and session-bound — it 403s within about a day,
  // the same lesson /api/reels/thumbnail already documents. That's exactly
  // why it's fetched fresh here per request and proxied, instead of being
  // handed to the browser.
  const res = await fetch(sized, { signal: AbortSignal.timeout(20000) })
  if (!res.ok || !res.body) return null

  return {
    body: res.body,
    contentType: res.headers.get('content-type') ?? 'image/png',
  }
}

// Reads just the head of the file — a few hundred KB whether the PSD is 7 MB
// or 235 MB — and pulls out the JPEG preview Photoshop stored there.
async function fetchEmbeddedPsdThumbnail(driveFileId: string): Promise<DriveThumbnailResult | null> {
  const drive = getClient()
  try {
    const res = await drive.files.get(
      { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer', headers: { Range: `bytes=0-${PSD_HEAD_BYTES - 1}` } }
    )
    const thumb = extractPsdThumbnail(Buffer.from(res.data as ArrayBuffer))
    if (!thumb) return null

    // Handed back as a stream so every caller sees one body type, whether the
    // bytes came from Drive's CDN or out of the file itself.
    const bytes = new Uint8Array(thumb.jpeg.byteLength)
    bytes.set(thumb.jpeg)
    const body = new ReadableStream({
      start(controller) { controller.enqueue(bytes); controller.close() },
    })
    return { body, contentType: 'image/jpeg', limited: true }
  } catch (err) {
    console.error('Kon ingebouwd PSD-voorbeeld niet lezen:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Folder resolution ──────────────────────────────────────────────────────
//
// Mirrors an app-level folder hierarchy (edition/section/client, or a client's
// own file_folders tree) into real Drive subfolders, with a Supabase-backed
// cache so repeat uploads into the same folder don't re-list/re-create every
// time. The cache row itself is the lock: a fresh folder is first inserted as
// 'pending', so a second concurrent request for the same (parent, name) waits
// for the first to finish instead of racing it into creating a duplicate
// folder in Drive.

const PENDING = 'pending'

async function pollUntilResolved(admin: SupabaseClient, parentId: string, name: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const { data: row } = await admin
      .from('drive_folders')
      .select('drive_folder_id')
      .eq('parent_drive_folder_id', parentId)
      .eq('name', name)
      .maybeSingle()
    if (row && row.drive_folder_id !== PENDING) return row.drive_folder_id
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Timeout bij wachten op Drive-map "${name}".`)
}

// A cached id is only worth anything if the folder behind it still exists and
// isn't in the trash. Dropping a file into a trashed folder succeeds without
// complaint — Drive just hides the whole subtree — so nothing downstream ever
// notices; the file plays fine through the app while being invisible in Drive.
//
// The check costs a Drive round trip (measured ~300ms), and resolving one
// file's target folder walks several levels — root, client, then each folder
// in the path. Checking every level for every file turned a 100-file upload
// into minutes of extra waiting, so a confirmation is remembered briefly.
// Folders are not trashed mid-upload in practice, and the window is short
// enough that a stale answer costs at most one misfiled batch — while the
// invalidation in forgetCachedFolder keeps the common case exact.
const FOLDER_ALIVE_TTL_MS = 60 * 1000
const FOLDER_ALIVE_LIMIT = 200
const verifiedFolders = new Map<string, number>()

function rememberVerified(folderId: string) {
  verifiedFolders.delete(folderId)
  verifiedFolders.set(folderId, Date.now())
  if (verifiedFolders.size > FOLDER_ALIVE_LIMIT) {
    verifiedFolders.delete(verifiedFolders.keys().next().value!)
  }
}

async function driveFolderIsUsable(folderId: string): Promise<boolean> {
  const verifiedAt = verifiedFolders.get(folderId)
  if (verifiedAt !== undefined && Date.now() - verifiedAt < FOLDER_ALIVE_TTL_MS) return true

  try {
    const drive = getClient()
    const { data } = await drive.files.get({
      fileId: folderId,
      fields: 'trashed',
      supportsAllDrives: true,
    })
    if (data.trashed) {
      verifiedFolders.delete(folderId)
      return false
    }
    rememberVerified(folderId)
    return true
  } catch {
    // Gone entirely, or no longer reachable by this account.
    verifiedFolders.delete(folderId)
    return false
  }
}

// A claim that never resolved — the request died between claiming and
// creating — otherwise blocks that (parent, name) pair forever: every later
// call polls it and times out. Past this age, assume nobody is coming back.
const PENDING_STALE_MS = 2 * 60 * 1000

async function claimOrAwaitFolder(parentId: string, name: string): Promise<{ claimed: true; rowId: string } | { claimed: false; folderId: string }> {
  const admin = createAdminClient()

  // Fast path: the folder is already cached — a single read covers this,
  // the overwhelmingly common case for every move/upload into a folder
  // that's been used before. Only fall into the claim/poll dance below on
  // a genuine cache miss.
  const { data: existing } = await admin
    .from('drive_folders')
    .select('id, drive_folder_id, created_at')
    .eq('parent_drive_folder_id', parentId)
    .eq('name', name)
    .maybeSingle()

  if (existing) {
    if (existing.drive_folder_id !== PENDING) {
      if (await driveFolderIsUsable(existing.drive_folder_id)) {
        return { claimed: false, folderId: existing.drive_folder_id }
      }
      // Stale mapping: the folder it points at was trashed or removed in
      // Drive. Deleting a folder in the app and making a new one with the
      // same name landed here — the cache handed back the old, trashed id
      // and everything filed into it quietly disappeared from view.
      await admin.from('drive_folders').delete().eq('id', existing.id)
    } else if (Date.now() - new Date(existing.created_at).getTime() > PENDING_STALE_MS) {
      await admin.from('drive_folders').delete().eq('id', existing.id)
    } else {
      // Someone else is actively creating it right now — poll until ready.
      return { claimed: false, folderId: await pollUntilResolved(admin, parentId, name) }
    }
  }

  const { data: claimed } = await admin
    .from('drive_folders')
    .upsert(
      { parent_drive_folder_id: parentId, name, drive_folder_id: PENDING },
      { onConflict: 'parent_drive_folder_id,name', ignoreDuplicates: true }
    )
    .select('id, drive_folder_id')
    .maybeSingle()

  if (claimed) return { claimed: true, rowId: claimed.id }

  // Lost the race between our read and our claim attempt — someone else
  // just created (or is creating) this row instead. Poll until ready.
  return { claimed: false, folderId: await pollUntilResolved(admin, parentId, name) }
}

export async function getOrCreateFolder(name: string, parentId: string): Promise<string> {
  const claim = await claimOrAwaitFolder(parentId, name)
  if (!claim.claimed) return claim.folderId

  // From here on, any throw must delete the pending row we just claimed —
  // otherwise every future call for this (parent, name) pair polls it
  // forever and times out, even once the underlying failure is fixed.
  try {
    const drive = getClient()
    const escaped = name.replace(/'/g, "\\'")
    const { data } = await drive.files.list({
      q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    })

    let folderId = data.files?.[0]?.id
    if (!folderId) {
      const folder = await drive.files.create({
        requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id',
        supportsAllDrives: true,
      })
      folderId = folder.data.id!
    }

    const admin = createAdminClient()
    await admin.from('drive_folders').update({ drive_folder_id: folderId }).eq('id', claim.rowId)

    return folderId
  } catch (err) {
    const admin = createAdminClient()
    await admin.from('drive_folders').delete().eq('id', claim.rowId)
    throw err
  }
}

// Called when the app deletes a folder, so the cache can't hand its id back
// for a new folder with the same name later. The check in claimOrAwaitFolder
// would catch that anyway, but only after a wasted Drive round trip — and
// only for paths that go through it.
export async function forgetCachedFolder(driveFolderId: string) {
  // Also drop any remembered "this folder is fine" answer, so a folder that
  // was just trashed can't be treated as usable for the rest of the window.
  verifiedFolders.delete(driveFolderId)

  const admin = createAdminClient()
  // The folder itself, plus anything cached directly beneath it: trashing a
  // folder in Drive takes its whole subtree with it.
  await admin.from('drive_folders').delete().eq('drive_folder_id', driveFolderId)
  await admin.from('drive_folders').delete().eq('parent_drive_folder_id', driveFolderId)
}

export async function getOrCreateFolderPath(segments: string[], rootId: string): Promise<string> {
  let current = rootId
  for (const segment of segments) {
    current = await getOrCreateFolder(segment, current)
  }
  return current
}

// Drive renames a file the same way it renames a folder — a folder is just a
// file with a folder mime type.
export async function renameDriveFile(driveFileId: string, newName: string) {
  const drive = getClient()
  await drive.files.update({ fileId: driveFileId, requestBody: { name: newName }, supportsAllDrives: true })
}

export async function renameDriveFolder(driveFolderId: string, newName: string) {
  const drive = getClient()
  await drive.files.update({ fileId: driveFolderId, requestBody: { name: newName }, supportsAllDrives: true })
}

// Same Content-Manager-can't-hard-delete limitation as deleteFile above —
// kept for the same reason, use trashDriveFolder for real.
export async function deleteDriveFolder(driveFolderId: string) {
  const drive = getClient()
  await drive.files.delete({ fileId: driveFolderId, supportsAllDrives: true })
}

// Folders trash the same way files do in Drive's model (a folder is just a
// file with a folder mimeType) — this is what every real "delete folder"
// call site uses.
export async function trashDriveFolder(driveFolderId: string) {
  const drive = getClient()
  await drive.files.update({ fileId: driveFolderId, requestBody: { trashed: true }, supportsAllDrives: true })
}
