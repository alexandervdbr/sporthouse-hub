import { google } from 'googleapis'
import { Readable } from 'stream'
import { createAdminClient } from '@/lib/supabase/server'
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

async function claimOrAwaitFolder(parentId: string, name: string): Promise<{ claimed: true; rowId: string } | { claimed: false; folderId: string }> {
  const admin = createAdminClient()

  // Fast path: the folder is already cached — a single read covers this,
  // the overwhelmingly common case for every move/upload into a folder
  // that's been used before. Only fall into the claim/poll dance below on
  // a genuine cache miss.
  const { data: existing } = await admin
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('parent_drive_folder_id', parentId)
    .eq('name', name)
    .maybeSingle()

  if (existing) {
    if (existing.drive_folder_id !== PENDING) return { claimed: false, folderId: existing.drive_folder_id }
    // Someone else is actively creating it right now — poll until ready.
    return { claimed: false, folderId: await pollUntilResolved(admin, parentId, name) }
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

export async function getOrCreateFolderPath(segments: string[], rootId: string): Promise<string> {
  let current = rootId
  for (const segment of segments) {
    current = await getOrCreateFolder(segment, current)
  }
  return current
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
