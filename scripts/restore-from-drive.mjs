// Herstelt de databaserijen van bestanden die nog in Google Drive staan.
//
// Geschreven na het verlies van de Supabase-database op 28 oktober 2026: de
// bestanden zelf stonden nog in Drive, maar de app wist er niets meer van.
// Dit script loopt de mappen in Drive af en maakt de rijen opnieuw aan:
//
//   Klant-documenten/<klant>/…          → file_folders + files
//   <Sporthouse-root>/finance|administration/… → sporthouse_document_folders + sporthouse_documents
//   Pré-Assist/<editie>/Content|Inspiratie/…    → preassist_editions + preassist_submissions
//
// Alleen toevoegen. Er wordt niets verplaatst, hernoemd of verwijderd — niet
// in Drive en niet in de database. Wat al bestaat (zelfde Drive-id) wordt
// overgeslagen, dus het script mag zo vaak lopen als nodig.
//
// Een klantmap koppelt op naam aan een klant. Bestaat die klant (nog) niet,
// dan meldt het script dat en slaat het de map over: maak de klant aan met
// exact die naam en draai opnieuw.
//
// Wat niet terugkomt: wie iets uploadde (komt op "Hersteld uit Drive"),
// beschrijvingen, Pré-assist-links (die stonden alleen in de database) en
// Mijn gedacht!-reels (in Drive staan enkel hun thumbnails, zonder link).
//
// Gebruik:
//   node scripts/restore-from-drive.mjs          (proefdraai: toont wat er zou gebeuren)
//   node scripts/restore-from-drive.mjs --write  (voert het uit)

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const envContent = readFileSync(new URL('../.env.local', import.meta.url).pathname, 'utf8')
const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => {
  const idx = l.indexOf('='); return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, '')]
}))

// Dezelfde terugval als src/lib/drive-storage.ts, zodat het script in
// dezelfde mappen kijkt als de app.
const email = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_EMAIL
const key = (env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY ?? env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_PRIVATE_KEY)?.replace(/\\n/g, '\n')
const ROOT = env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? env.GOOGLE_PREASSIST_DRIVE_FOLDER_ID
const SPORTHOUSE_ROOT = env.GOOGLE_DRIVE_SPORTHOUSE_ROOT_FOLDER_ID
if (!email || !key || !ROOT) throw new Error('Google Drive-gegevens ontbreken in .env.local')
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase-gegevens ontbreken in .env.local')

const WRITE = process.argv.includes('--write')
const RESTORED_BY = 'Hersteld uit Drive'
const FOLDER = 'application/vnd.google-apps.folder'

// Alleen-lezen scope: ook met --write raakt het script Drive niet aan.
const drive = google.drive({ version: 'v3', auth: new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const LIST = { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'allDrives', spaces: 'drive' }
const FIELDS = 'nextPageToken, files(id, name, mimeType, size, createdTime, webViewLink, webContentLink, thumbnailLink)'

async function children(parentId) {
  const out = []
  let pageToken
  do {
    const { data } = await drive.files.list({ ...LIST, q: `'${parentId}' in parents and trashed=false`, fields: FIELDS, pageSize: 1000, pageToken })
    out.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function childFolder(parentId, name) {
  return (await children(parentId)).find(f => f.mimeType === FOLDER && f.name === name) ?? null
}

const norm = s => s.trim().toLowerCase()
const ext = name => (name.includes('.') ? name.split('.').pop().toLowerCase() : '')
const mb = bytes => `${(bytes / 1e6).toFixed(1)} MB`

async function existingIds(table, column, ids) {
  const found = new Set()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from(table).select(column).in(column, ids.slice(i, i + 200))
    if (error) throw new Error(`${table}: ${error.message}`)
    for (const row of data) found.add(row[column])
  }
  return found
}

async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 200))
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

// Loopt een map recursief af. Mappen komen vóór hun inhoud in de lijst, zodat
// een ouder altijd eerst wordt ingevoegd.
async function walk(folderId, parentRowId, makeFolderRow, makeFileRow, out, depth = []) {
  for (const item of await children(folderId)) {
    if (item.mimeType === FOLDER) {
      const rowId = randomUUID()
      out.folders.push({ driveId: item.id, rowId, parentRowId, row: makeFolderRow(item, rowId, parentRowId) })
      await walk(item.id, rowId, makeFolderRow, makeFileRow, out, [...depth, item.name])
    } else {
      out.files.push({ driveId: item.id, row: makeFileRow(item, parentRowId), path: [...depth, item.name].join('/'), size: Number(item.size ?? 0) })
    }
  }
}

// Een map die al bestaat (zelfde Drive-id) wordt niet opnieuw aangemaakt; zijn
// bestaande rij-id wordt dan de ouder van wat eronder hangt.
async function dedupe(table, out) {
  const folderIds = out.folders.map(f => f.driveId)
  const { data: existingFolders } = folderIds.length
    ? await db.from(table.folders).select('id, drive_folder_id').in('drive_folder_id', folderIds)
    : { data: [] }
  const remap = new Map((existingFolders ?? []).map(r => [r.drive_folder_id, r.id]))
  const idSwap = new Map()
  for (const f of out.folders) if (remap.has(f.driveId)) idSwap.set(f.rowId, remap.get(f.driveId))
  const fix = id => idSwap.get(id) ?? id

  const newFolders = out.folders
    .filter(f => !remap.has(f.driveId))
    .map(f => ({ ...f.row, parent_id: f.row.parent_id ? fix(f.row.parent_id) : null }))

  const haveFiles = await existingIds(table.files, 'drive_file_id', out.files.map(f => f.driveId))
  const newFiles = out.files
    .filter(f => !haveFiles.has(f.driveId))
    .map(f => ({ ...f, row: { ...f.row, folder_id: f.row.folder_id ? fix(f.row.folder_id) : null } }))

  return { newFolders, newFiles, skippedFolders: remap.size, skippedFiles: haveFiles.size }
}

function report(label, { newFolders, newFiles, skippedFolders, skippedFiles }) {
  const bytes = newFiles.reduce((n, f) => n + f.size, 0)
  console.log(`  ${label}: ${newFolders.length} mappen en ${newFiles.length} bestanden (${mb(bytes)}) toe te voegen` +
    (skippedFolders || skippedFiles ? ` — ${skippedFolders} mappen en ${skippedFiles} bestanden staan er al` : ''))
  for (const f of newFiles.slice(0, 8)) console.log(`      ${f.path}`)
  if (newFiles.length > 8) console.log(`      … en nog ${newFiles.length - 8}`)
}

const { data: clients, error: clientsError } = await db.from('clients').select('id, name')
if (clientsError) throw new Error(clientsError.message)
const clientByName = new Map(clients.map(c => [norm(c.name), c]))

const plan = []
const missingClients = []

// ── 1. Klantbestanden ────────────────────────────────────────────────────────
console.log(`\n${WRITE ? 'UITVOEREN' : 'PROEFDRAAI — er wordt niets geschreven'}\n\n1. Klantbestanden (Klant-documenten)`)
const klantDocs = await childFolder(ROOT, 'Klant-documenten')
for (const clientFolder of klantDocs ? (await children(klantDocs.id)).filter(f => f.mimeType === FOLDER) : []) {
  const client = clientByName.get(norm(clientFolder.name))
  if (!client) { missingClients.push(clientFolder.name); continue }
  const out = { folders: [], files: [] }
  await walk(
    clientFolder.id, null,
    (item, rowId, parentRowId) => ({ id: rowId, client_id: client.id, name: item.name, parent_id: parentRowId, drive_folder_id: item.id, created_by: RESTORED_BY, created_at: item.createdTime }),
    (item, parentRowId) => ({
      client_id: client.id, filename: item.name, file_type: ext(item.name), file_size: Number(item.size ?? 0),
      uploaded_by: RESTORED_BY, folder_id: parentRowId, storage_provider: 'drive', drive_file_id: item.id,
      web_view_link: item.webViewLink ?? null, web_content_link: item.webContentLink ?? null, thumbnail_link: item.thumbnailLink ?? null,
      created_at: item.createdTime,
    }),
    out,
  )
  const result = await dedupe({ folders: 'file_folders', files: 'files' }, out)
  report(client.name, result)
  plan.push({ folders: 'file_folders', files: 'files', ...result })
}
if (missingClients.length) {
  console.log(`  OVERGESLAGEN — geen klant met deze naam: ${missingClients.map(n => `"${n}"`).join(', ')}`)
  console.log('  Maak de klant aan met exact die naam en draai het script opnieuw.')
}

// ── 2. Financiën en Administratie ────────────────────────────────────────────
console.log('\n2. Financiën en Administratie')
if (!SPORTHOUSE_ROOT) {
  console.log('  Overgeslagen: GOOGLE_DRIVE_SPORTHOUSE_ROOT_FOLDER_ID ontbreekt in .env.local')
} else {
  for (const section of ['finance', 'administration']) {
    const sectionFolder = await childFolder(SPORTHOUSE_ROOT, section)
    if (!sectionFolder) { console.log(`  ${section}: geen map in Drive`); continue }
    const out = { folders: [], files: [] }
    await walk(
      sectionFolder.id, null,
      (item, rowId, parentRowId) => ({ id: rowId, section, name: item.name, parent_id: parentRowId, drive_folder_id: item.id, created_by: RESTORED_BY, created_at: item.createdTime }),
      (item, parentRowId) => ({
        section, filename: item.name, file_type: ext(item.name), file_size: Number(item.size ?? 0),
        uploaded_by: RESTORED_BY, folder_id: parentRowId, storage_provider: 'drive', drive_file_id: item.id, created_at: item.createdTime,
      }),
      out,
    )
    const result = await dedupe({ folders: 'sporthouse_document_folders', files: 'sporthouse_documents' }, out)
    report(section === 'finance' ? 'Financiën' : 'Administratie', result)
    plan.push({ folders: 'sporthouse_document_folders', files: 'sporthouse_documents', ...result })
  }
}

// ── 3. Pré-assist ────────────────────────────────────────────────────────────
// Content/<klant>/<project>/<inzender — bestand> en Inspiratie/<inzender — bestand>,
// zoals src/lib/preassist-upload.ts ze aanmaakt.
console.log('\n3. Pré-assist')
const preassistRoot = await childFolder(ROOT, 'Pré-Assist')
const editionPlans = []
const { data: existingEditions } = await db.from('preassist_editions').select('id, title, drive_folder_id')
for (const editionFolder of preassistRoot ? (await children(preassistRoot.id)).filter(f => f.mimeType === FOLDER) : []) {
  const known = (existingEditions ?? []).find(e => e.drive_folder_id === editionFolder.id || norm(e.title) === norm(editionFolder.name))
  const editionId = known?.id ?? randomUUID()
  const files = []
  for (const sectionFolder of (await children(editionFolder.id)).filter(f => f.mimeType === FOLDER)) {
    const section = sectionFolder.name === 'Content' ? 'content' : sectionFolder.name === 'Inspiratie' ? 'inspiratie' : null
    if (!section) continue
    const collect = async (folderId, trail) => {
      for (const item of await children(folderId)) {
        if (item.mimeType === FOLDER) { await collect(item.id, [...trail, item.name]); continue }
        // Bij Content is de eerste laag de klant, de rest het project.
        const clientName = section === 'content' ? (trail[0] ?? null) : null
        const project = section === 'content' ? (trail.slice(1).join(' / ') || null) : (trail.join(' / ') || null)
        const split = item.name.indexOf(' — ')
        const submitter = split > 0 ? item.name.slice(0, split) : null
        const fileName = split > 0 ? item.name.slice(split + 3) : item.name
        files.push({
          driveId: item.id, size: Number(item.size ?? 0), path: [sectionFolder.name, ...trail, item.name].join('/'),
          row: {
            edition_id: editionId, section, kind: 'file', title: project, file_name: fileName,
            file_type: item.mimeType || 'application/octet-stream', file_size: Number(item.size ?? 0),
            submitted_by_name: submitter ?? RESTORED_BY,
            client_id: clientName ? (clientByName.get(norm(clientName))?.id ?? null) : null,
            client_name: clientName, storage_provider: 'drive', drive_file_id: item.id,
            web_view_link: item.webViewLink ?? null, web_content_link: item.webContentLink ?? null, thumbnail_link: item.thumbnailLink ?? null,
            created_at: item.createdTime,
          },
        })
      }
    }
    await collect(sectionFolder.id, [])
  }
  const have = await existingIds('preassist_submissions', 'drive_file_id', files.map(f => f.driveId))
  const newFiles = files.filter(f => !have.has(f.driveId))
  console.log(`  ${editionFolder.name}: ${known ? 'editie bestaat al' : 'editie aan te maken (niet actief)'}, ${newFiles.length} inzendingen toe te voegen` +
    (have.size ? ` — ${have.size} staan er al` : ''))
  for (const f of newFiles.slice(0, 8)) console.log(`      ${f.path}`)
  editionPlans.push({
    edition: known ? null : { id: editionId, title: editionFolder.name, active: false, drive_folder_id: editionFolder.id, created_at: editionFolder.createdTime },
    newFiles,
  })
}
if (!editionPlans.length) console.log('  Geen edities gevonden in Drive.')

// ── Uitvoeren ────────────────────────────────────────────────────────────────
if (!WRITE) {
  console.log('\nNiets geschreven. Draai met --write om dit uit te voeren.\n')
  process.exit(0)
}

let folders = 0, files = 0
for (const p of plan) {
  await insertAll(p.folders, p.newFolders)
  await insertAll(p.files, p.newFiles.map(f => f.row))
  folders += p.newFolders.length
  files += p.newFiles.length
}
for (const p of editionPlans) {
  if (p.edition) await insertAll('preassist_editions', [p.edition])
  await insertAll('preassist_submissions', p.newFiles.map(f => f.row))
  files += p.newFiles.length
}
console.log(`\nKlaar: ${folders} mappen en ${files} bestanden toegevoegd.\n`)
