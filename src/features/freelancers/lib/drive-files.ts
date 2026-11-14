import { google, type drive_v3 } from 'googleapis'

// Drive-handelingen die de freelancertool nodig heeft en die lib/drive-storage
// niet (zo) aanbiedt. Eigen client, met dezelfde env vars als drive-storage.
//
// Waarom niet getFileMetadata()/uploadFile() uit drive-storage: die delen elk
// bestand blijvend met "iedereen met de link" (sharePublicly). Voor
// freelancerbestanden mag een publieke deling alleen tijdelijk bestaan
// (V1 in docs/freelancers-redesign.md), dus hier wordt nooit vanzelf gedeeld.

function client(): drive_v3.Drive {
  const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? process.env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_EMAIL
  const key = (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY ?? process.env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_PRIVATE_KEY)?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Google Drive niet geconfigureerd.')
  return google.drive({ version: 'v3', auth: new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/drive'] }) })
}

export interface DriveMeta {
  id: string
  name: string
  mimeType: string | null
  size: number | null
  parents: string[]
  webViewLink: string | null
}

/** Metadata zoals Drive ze kent — zonder iets te delen. */
export async function getMetaNoShare(fileId: string): Promise<DriveMeta> {
  const res = await client().files.get({
    fileId,
    fields: 'id, name, mimeType, size, parents, webViewLink',
    supportsAllDrives: true,
  })
  return {
    id: res.data.id!,
    name: res.data.name ?? '',
    mimeType: res.data.mimeType ?? null,
    size: res.data.size != null ? Number(res.data.size) : null,
    parents: res.data.parents ?? [],
    webViewLink: res.data.webViewLink ?? null,
  }
}

/** Eén bestand (nooit een map) delen met "iedereen met de link", lezen. Geeft het permissie-id. */
export async function shareFilePublicly(fileId: string): Promise<string> {
  const drive = client()
  const meta = await drive.files.get({ fileId, fields: 'mimeType', supportsAllDrives: true })
  if (meta.data.mimeType === 'application/vnd.google-apps.folder') throw new Error('Een map wordt nooit gedeeld.')
  const res = await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone', allowFileDiscovery: false },
    supportsAllDrives: true,
    fields: 'id',
  })
  if (!res.data.id) throw new Error('Drive gaf geen permissie-id terug.')
  return res.data.id
}

/** Een publieke deling intrekken. Al weg = ook goed. */
export async function revokePermission(fileId: string, permissionId: string): Promise<void> {
  try {
    await client().permissions.delete({ fileId, permissionId, supportsAllDrives: true })
  } catch (err) {
    const code = (err as { code?: number })?.code
    if (code === 404) return
    throw err
  }
}

/** Alle "iedereen"-delingen op een bestand (voor de nachtelijke opruimronde). */
export async function listAnyonePermissions(fileId: string): Promise<string[]> {
  const res = await client().permissions.list({
    fileId, supportsAllDrives: true, fields: 'permissions(id, type)',
  })
  return (res.data.permissions ?? []).filter(p => p.type === 'anyone' && p.id).map(p => p.id!)
}

/** Rechtstreekse download van Drive (geen bytes via onze function). */
export function publicDownloadUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`
}
