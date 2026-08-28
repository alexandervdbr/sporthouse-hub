import { google } from 'googleapis'

export type DriveDocType = 'document' | 'spreadsheet' | 'presentation'

const MIME: Record<DriveDocType, string> = {
  document:     'application/vnd.google-apps.document',
  spreadsheet:  'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
}

function getClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Google Drive niet geconfigureerd.')
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/drive'] })
  return google.drive({ version: 'v3', auth })
}

export function isDriveConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
}

export async function getOrCreateClientFolder(clientId: string, clientName: string): Promise<string> {
  const drive = getClient()
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  const folderName = `${clientName} [${clientId.slice(0, 8)}]`

  const parentQ = rootId ? ` and '${rootId}' in parents` : ''
  const { data } = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder'${parentQ} and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })

  if (data.files?.length) return data.files[0].id!

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(rootId ? { parents: [rootId] } : {}),
    },
    fields: 'id',
  })
  return folder.data.id!
}

export async function createDriveFile(
  type: DriveDocType,
  name: string,
  clientId: string,
  clientName: string
): Promise<{ id: string; name: string; mimeType: string; webViewLink: string }> {
  const drive = getClient()
  const folderId = await getOrCreateClientFolder(clientId, clientName)

  const file = await drive.files.create({
    requestBody: {
      name,
      mimeType: MIME[type],
      parents: [folderId],
    },
    fields: 'id, name, mimeType, webViewLink',
  })

  // Share: anyone with the link can edit
  await drive.permissions.create({
    fileId: file.data.id!,
    requestBody: { role: 'writer', type: 'anyone' },
  })

  return {
    id:          file.data.id!,
    name:        file.data.name!,
    mimeType:    file.data.mimeType!,
    webViewLink: file.data.webViewLink!,
  }
}

export async function renameDriveFile(driveFileId: string, newName: string) {
  const drive = getClient()
  await drive.files.update({ fileId: driveFileId, requestBody: { name: newName } })
}

// Kept in case this service account's Drive role ever allows true permanent
// deletion — today it doesn't (same Content-Manager limitation documented
// in drive-storage.ts), so every real call site uses trashDriveFile below.
export async function deleteDriveFile(driveFileId: string) {
  const drive = getClient()
  await drive.files.delete({ fileId: driveFileId })
}

export async function trashDriveFile(driveFileId: string) {
  const drive = getClient()
  await drive.files.update({ fileId: driveFileId, requestBody: { trashed: true } })
}
