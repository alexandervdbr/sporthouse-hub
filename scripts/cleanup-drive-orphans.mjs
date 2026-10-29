// Ruimt bestanden in Drive op waar de database niet meer naar verwijst.
//
// Na het verlies van de database (28 oktober 2026) bleven in Drive bestanden
// achter die bij rijen hoorden die er niet meer zijn: thumbnails van oude
// Mijn gedacht!-reels en Pré-assist-links, posters van video's, en
// freelancermappen zonder opdracht. Ze doen niets, maar staan er wel.
//
// Kijkt ALLEEN in deze vier mappen onder de Drive-root — nooit in
// Klant-documenten, Pré-Assist-edities of Financiën/Administratie:
//
//   Mijn gedacht — thumbnails  ↔ reel_inspiration.thumbnail_drive_id
//   Pré-Assist — thumbnails    ↔ preassist_submissions.thumbnail_drive_id
//   Videovoorbeelden           ↔ files.poster_drive_file_id
//   Freelancers                ↔ freelancer_assignment_files.drive_file_id
//
// Wat nergens naar verwezen wordt, gaat naar de prullenbak van Drive — niet
// definitief weg: daar staat het nog 30 dagen en kan het teruggezet worden.
// (Het serviceaccount is Content manager en mag niet definitief verwijderen.)
// Bestanden van het laatste uur blijven sowieso staan: een thumbnail wordt
// net vóór zijn databaserij geüpload, en die mag hier niet tussen vallen.
//
// Gebruik:
//   node scripts/cleanup-drive-orphans.mjs          (proefdraai: toont wat er weg zou gaan)
//   node scripts/cleanup-drive-orphans.mjs --write  (naar de prullenbak)

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envContent = readFileSync(new URL('../.env.local', import.meta.url).pathname, 'utf8')
const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => {
  const idx = l.indexOf('='); return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, '')]
}))

const email = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_EMAIL
const key = (env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY ?? env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_PRIVATE_KEY)?.replace(/\\n/g, '\n')
const ROOT = env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? env.GOOGLE_PREASSIST_DRIVE_FOLDER_ID
if (!email || !key || !ROOT) throw new Error('Google Drive-gegevens ontbreken in .env.local')

const WRITE = process.argv.includes('--write')
const FOLDER = 'application/vnd.google-apps.folder'
const GRACE_MS = 60 * 60 * 1000

const scope = WRITE ? 'https://www.googleapis.com/auth/drive' : 'https://www.googleapis.com/auth/drive.readonly'
const drive = google.drive({ version: 'v3', auth: new google.auth.JWT({ email, key, scopes: [scope] }) })
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const LIST = { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'allDrives', spaces: 'drive' }

async function children(parentId) {
  const out = []
  let pageToken
  do {
    const { data } = await drive.files.list({ ...LIST, q: `'${parentId}' in parents and trashed=false`, fields: 'nextPageToken, files(id, name, mimeType, size, createdTime)', pageSize: 1000, pageToken })
    out.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

// Alles onder een map, ook in submappen, plat.
async function allFiles(folderId) {
  const out = []
  for (const item of await children(folderId)) {
    if (item.mimeType === FOLDER) out.push(...await allFiles(item.id))
    else out.push(item)
  }
  return out
}

async function referenced(table, column) {
  const ids = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(column).not(column, 'is', null).range(from, from + 999)
    if (error) throw new Error(`${table}.${column}: ${error.message}`)
    for (const row of data) ids.add(row[column])
    if (data.length < 1000) break
  }
  return ids
}

const TARGETS = [
  { folder: 'Mijn gedacht — thumbnails', table: 'reel_inspiration', column: 'thumbnail_drive_id' },
  { folder: 'Pré-Assist — thumbnails', table: 'preassist_submissions', column: 'thumbnail_drive_id' },
  { folder: 'Videovoorbeelden', table: 'files', column: 'poster_drive_file_id' },
  { folder: 'Freelancers', table: 'freelancer_assignment_files', column: 'drive_file_id' },
]

console.log(`\n${WRITE ? 'UITVOEREN — naar de prullenbak van Drive' : 'PROEFDRAAI — er wordt niets verplaatst'}\n`)
const rootChildren = await children(ROOT)
const trash = []
for (const t of TARGETS) {
  const folder = rootChildren.find(f => f.mimeType === FOLDER && f.name === t.folder)
  if (!folder) { console.log(`${t.folder}: map niet gevonden`); continue }
  const keep = await referenced(t.table, t.column)
  const files = await allFiles(folder.id)
  const recent = files.filter(f => Date.now() - new Date(f.createdTime).getTime() < GRACE_MS)
  const orphans = files.filter(f => !keep.has(f.id) && !recent.includes(f))
  const bytes = orphans.reduce((n, f) => n + Number(f.size ?? 0), 0)
  console.log(`${t.folder}: ${files.length} bestanden, ${files.length - orphans.length} in gebruik of nieuw, ${orphans.length} weg (${(bytes / 1e6).toFixed(1)} MB)`)
  for (const f of orphans.slice(0, 5)) console.log(`    ${f.name}`)
  if (orphans.length > 5) console.log(`    … en nog ${orphans.length - 5}`)
  trash.push(...orphans)

  // Freelancers: de lege opdrachtmappen mogen mee zodra hun bestanden weg zijn.
  if (t.folder === 'Freelancers') {
    for (const sub of (await children(folder.id)).filter(f => f.mimeType === FOLDER)) {
      const inside = await allFiles(sub.id)
      if (inside.every(f => orphans.includes(f))) trash.push({ ...sub, isFolder: true })
    }
  }
}

if (!WRITE) {
  console.log(`\nNiets verplaatst. Draai met --write om ${trash.length} item(s) naar de prullenbak te zetten.\n`)
  process.exit(0)
}

let done = 0
for (const f of trash) {
  await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true })
  done++
}
console.log(`\nKlaar: ${done} item(s) in de prullenbak van Drive. Terug te zetten tot 30 dagen.\n`)
