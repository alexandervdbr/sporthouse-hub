import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createResumableUploadSession, driveRootFolderId, getOrCreateFolderPath, getResumableUploadResult, trashFile,
} from '@/lib/drive-storage'
import { fileExt, isAllowedUploadExt, MAX_UPLOAD_BYTES } from '@/lib/upload-policy'
import { getMetaNoShare, listAnyonePermissions, publicDownloadUrl, revokePermission, shareFilePublicly } from './drive-files'
import { INTERNAL_DOWNLOAD_MODE, MAX_FILES_PER_ASSIGNMENT, PUBLIC_SHARE_TTL_MS, type InternalDownloadMode } from './config'

// Bijlagen van opdrachten. Geen enkele byte loopt door onze functions:
//   upload   → de server opent een resumable sessie in de map van de opdracht,
//              de browser stuurt de bytes rechtstreeks naar Google, en
//              finalize vraagt bij Drive na wat er aankwam (naam, grootte,
//              map) in plaats van de browser te geloven.
//   download → na de rechtencheck een redirect: naar Drive (tijdelijk
//              gedeeld, of de webViewLink) of een signed URL van 60 s voor
//              oude bestanden in Supabase Storage.

type Db = SupabaseClient

export type Uploader = 'team' | 'freelancer'
export type FileKind = 'briefing' | 'oplevering'

// Een freelancer levert op; code en uitvoerbare bestanden horen daar niet bij.
const FREELANCER_BLOCKED_EXTS = new Set([
  'js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'py', 'html', 'htm', 'css', 'json', 'xml', 'yaml', 'yml', 'sql', 'svg',
  'exe', 'msi', 'bat', 'cmd', 'sh', 'app', 'dmg', 'jar', 'apk',
])

export function isAllowedFor(uploader: Uploader, filename: string): boolean {
  if (!isAllowedUploadExt(filename)) return false
  return uploader === 'team' || !FREELANCER_BLOCKED_EXTS.has(fileExt(filename))
}

export function folderSegments(freelancerId: string, assignmentId: string): string[] {
  return ['Freelancers', freelancerId, assignmentId]
}

async function folderFor(freelancerId: string, assignmentId: string): Promise<string> {
  const root = driveRootFolderId()
  if (!root) throw new Error('Google Drive is niet geconfigureerd.')
  return getOrCreateFolderPath(folderSegments(freelancerId, assignmentId), root)
}

export interface AssignmentRef { id: string; freelancer_id: string }

export async function openUploadSessions(
  db: Db, a: AssignmentRef, files: { name: string; size: number; mimeType?: string }[], uploader: Uploader,
): Promise<{ ok: true; uploadUrls: string[] } | { ok: false; status: 400 | 502; error: string }> {
  const bad = files.find(f => !isAllowedFor(uploader, f.name))
  if (bad) return { ok: false, status: 400, error: `"${bad.name}": dit bestandstype wordt niet ondersteund.` }
  if (files.some(f => f.size > MAX_UPLOAD_BYTES)) return { ok: false, status: 400, error: 'Een bestand is te groot (max. 2 GB).' }

  const { count } = await db.from('freelancer_assignment_files').select('id', { count: 'exact', head: true }).eq('assignment_id', a.id)
  if ((count ?? 0) + files.length > MAX_FILES_PER_ASSIGNMENT) {
    return { ok: false, status: 400, error: `Een opdracht kan maximaal ${MAX_FILES_PER_ASSIGNMENT} bestanden hebben.` }
  }

  try {
    const folderId = await folderFor(a.freelancer_id, a.id)
    const uploadUrls = await Promise.all(files.map(f =>
      createResumableUploadSession(f.name, f.mimeType || 'application/octet-stream', folderId, f.size)))
    return { ok: true, uploadUrls }
  } catch (err) {
    console.error('Freelancers: uploadsessie mislukt:', (err as Error).message)
    return { ok: false, status: 502, error: 'Kon de upload niet starten. Probeer opnieuw.' }
  }
}

export type FinalizeResult = { ok: true; id: string; name: string } | { ok: false; error: string }

export async function finalizeUploads(
  db: Db, a: AssignmentRef, uploads: { uploadUrl: string; size: number }[],
  opts: { uploader: Uploader; kind: FileKind; createdBy: string | null },
): Promise<FinalizeResult[]> {
  const folderId = await folderFor(a.freelancer_id, a.id)
  return Promise.all(uploads.map(u => finalizeOne(db, a, folderId, u, opts)))
}

async function finalizeOne(
  db: Db, a: AssignmentRef, folderId: string, u: { uploadUrl: string; size: number },
  opts: { uploader: Uploader; kind: FileKind; createdBy: string | null },
): Promise<FinalizeResult> {
  let fileId: string
  try {
    const r = await getResumableUploadResult(u.uploadUrl, u.size)
    if (!r.done) return { ok: false, error: 'Het bestand is nog niet volledig aangekomen.' }
    fileId = r.fileId
  } catch {
    return { ok: false, error: 'Kon de upload niet afronden.' }
  }

  const meta = await getMetaNoShare(fileId).catch(() => null)
  if (!meta) return { ok: false, error: 'Kon het bestand niet verifiëren.' }
  if (!meta.parents.includes(folderId)) return { ok: false, error: 'Dit bestand hoort niet bij deze opdracht.' }
  if (!isAllowedFor(opts.uploader, meta.name)) {
    await trashFile(fileId).catch(() => {})
    return { ok: false, error: 'Dit bestandstype wordt niet ondersteund.' }
  }

  const { data, error } = await db.from('freelancer_assignment_files').insert({
    assignment_id: a.id,
    file_name: meta.name,
    file_size: meta.size,
    file_type: meta.mimeType,
    storage_provider: 'drive',
    drive_file_id: fileId,
    web_view_link: meta.webViewLink,
    kind: opts.kind,
    uploaded_by: opts.uploader,
    created_by: opts.uploader === 'team' ? opts.createdBy : null,
  }).select('id').single()
  if (error || !data) {
    await trashFile(fileId).catch(() => {})
    return { ok: false, error: 'Kon het bestand niet registreren.' }
  }
  return { ok: true, id: data.id as string, name: meta.name }
}

// ── Downloaden ──────────────────────────────────────────────────────────────

export interface FileRow {
  id: string
  storage_provider: string | null
  drive_file_id: string | null
  file_url: string | null
  web_view_link: string | null
  public_shared_at: string | null
  public_permission_id: string | null
}
export const FILE_DOWNLOAD_COLUMNS = 'id, storage_provider, drive_file_id, file_url, web_view_link, public_shared_at, public_permission_id'

/**
 * Waar de browser naartoe moet om het bestand te halen. Roep dit pas aan
 * NA de rechtencheck (bij de link: link, pincode én eigenaarschap).
 */
export async function downloadUrl(
  db: Db, file: FileRow, mode: InternalDownloadMode = INTERNAL_DOWNLOAD_MODE, now = Date.now(),
): Promise<string | null> {
  if (file.storage_provider !== 'drive' || !file.drive_file_id) {
    if (!file.file_url) return null
    const { data } = await db.storage.from('freelancer-assignments').createSignedUrl(file.file_url, 60)
    return data?.signedUrl ?? null
  }

  if (mode === 'webviewlink') {
    return file.web_view_link ?? (await getMetaNoShare(file.drive_file_id)).webViewLink
  }

  const stillShared = file.public_permission_id && file.public_shared_at
    && now - Date.parse(file.public_shared_at) < PUBLIC_SHARE_TTL_MS
  if (!stillShared) {
    const permissionId = await shareFilePublicly(file.drive_file_id)
    // Het tijdstip van de EERSTE deling blijft staan zolang ze loopt, zodat
    // herhaald downloaden de deling niet eindeloos verlengt.
    const { error } = await db.from('freelancer_assignment_files')
      .update({ public_shared_at: new Date(now).toISOString(), public_permission_id: permissionId })
      .eq('id', file.id)
    if (error) {
      await revokePermission(file.drive_file_id, permissionId).catch(() => {})
      throw new Error('Kon de deling niet vastleggen.')
    }
  }
  return publicDownloadUrl(file.drive_file_id)
}

// ── Delingen intrekken ──────────────────────────────────────────────────────

/** Elke vastgelegde deling ouder dan het uur intrekken (uurlijks en bij elke download). */
export async function revokeExpiredShares(db: Db, now = Date.now(), limit = 50): Promise<{ ingetrokken: number; mislukt: number }> {
  const cutoff = new Date(now - PUBLIC_SHARE_TTL_MS).toISOString()
  const { data } = await db.from('freelancer_assignment_files')
    .select('id, drive_file_id, public_permission_id')
    .not('public_shared_at', 'is', null).lt('public_shared_at', cutoff)
    .limit(limit)
  let ingetrokken = 0, mislukt = 0
  for (const f of data ?? []) {
    try {
      if (f.drive_file_id && f.public_permission_id) await revokePermission(f.drive_file_id, f.public_permission_id)
      await db.from('freelancer_assignment_files').update({ public_shared_at: null, public_permission_id: null }).eq('id', f.id)
      ingetrokken++
    } catch (err) {
      mislukt++
      console.error(`Freelancers: deling van bestand ${f.id} niet ingetrokken:`, (err as Error).message)
    }
  }
  return { ingetrokken, mislukt }
}

/**
 * De nachtelijke vangnetronde: kijkt bij Drive zelf naar ELKE "iedereen"-
 * deling op elk freelancerbestand — ook delingen die nooit in de database
 * stonden (bv. van vóór dit ontwerp) — en trekt alles in wat niet een nog
 * lopende, vastgelegde deling is. Logt wat er gevonden werd.
 */
export async function sweepAllShares(db: Db, now = Date.now()): Promise<{ bekeken: number; ingetrokken: number; mislukt: number }> {
  const { data } = await db.from('freelancer_assignment_files')
    .select('id, drive_file_id, public_shared_at, public_permission_id')
    .eq('storage_provider', 'drive').not('drive_file_id', 'is', null)
  let bekeken = 0, ingetrokken = 0, mislukt = 0
  for (const f of data ?? []) {
    bekeken++
    const keep = f.public_permission_id && f.public_shared_at && now - Date.parse(f.public_shared_at) < PUBLIC_SHARE_TTL_MS
      ? f.public_permission_id : null
    try {
      for (const pid of await listAnyonePermissions(f.drive_file_id!)) {
        if (pid === keep) continue
        await revokePermission(f.drive_file_id!, pid)
        ingetrokken++
        console.info(`Freelancers: achtergebleven publieke deling ingetrokken (bestand ${f.id}).`)
      }
      if (!keep && (f.public_shared_at || f.public_permission_id)) {
        await db.from('freelancer_assignment_files').update({ public_shared_at: null, public_permission_id: null }).eq('id', f.id)
      }
    } catch (err) {
      mislukt++
      console.error(`Freelancers: bestand ${f.id} niet nagekeken:`, (err as Error).message)
    }
  }
  console.info(`Freelancers: nachtronde delingen — ${bekeken} bekeken, ${ingetrokken} ingetrokken, ${mislukt} mislukt.`)
  return { bekeken, ingetrokken, mislukt }
}
