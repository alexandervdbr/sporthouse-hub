// Telt hoeveel bestanden in onze Drive-mappen een "iedereen met de link"-
// deling hebben, per map. ALLEEN LEZEN.
//
// Waarom alleen lezen gegarandeerd is: elk service-account vraagt bij Google
// een token aan met uitsluitend de scope drive.readonly. Met dat token kan de
// Drive API niets aanmaken, wijzigen, delen of verwijderen — ook niet als deze
// code dat zou proberen. Er staat hier ook geen enkele schrijfaanroep in.
//
// Gebruik (vanuit de projectmap):
//   node --env-file=.env.local scripts/audit-drive-public-shares.mjs
//   node --env-file=.env.local scripts/audit-drive-public-shares.mjs --rollen
//        (vraagt per gevonden bestand ook de rol op: lezer of BEWERKER;
//         trager, één extra leesverzoek per bestand)
//   node --env-file=.env.local scripts/audit-drive-public-shares.mjs --json > deling-rapport.json
//
// Wat het doet, per geconfigureerd service-account (algemene opslag,
// pré-assist, Google Docs per klant):
//   1. Zoekt in alle Drives die dat account ziet naar bestanden met
//      visibility = 'anyoneWithLink' of 'anyoneCanFind'.
//   2. Zoekt van elk bestand de bovenliggende mappen op tot een bekende root
//      (GOOGLE_DRIVE_ROOT_FOLDER_ID, GOOGLE_DRIVE_SPORTHOUSE_ROOT_FOLDER_ID,
//      GOOGLE_PREASSIST_DRIVE_FOLDER_ID) en telt per root + eerste submap.
//   3. Drukt een tabel af. Bestandsnamen staan niet in de tabel, wel in --json.

import { google } from 'googleapis'

const READONLY = ['https://www.googleapis.com/auth/drive.readonly']
const args = new Set(process.argv.slice(2))
const WANT_ROLES = args.has('--rollen')
const AS_JSON = args.has('--json')

const accounts = [
  { naam: 'algemene opslag', email: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY },
  { naam: 'pré-assist', email: process.env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PREASSIST_SERVICE_ACCOUNT_PRIVATE_KEY },
  { naam: 'Google Docs per klant', email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY },
].filter(a => a.email && a.key)

const roots = new Map([
  [process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID, 'Algemene root (klantbestanden, Freelancers, Videovoorbeelden, reels, pré-assist*)'],
  [process.env.GOOGLE_DRIVE_SPORTHOUSE_ROOT_FOLDER_ID, 'Sporthouse intern (Financiën/Administratie, Poolwagens)'],
  [process.env.GOOGLE_PREASSIST_DRIVE_FOLDER_ID, 'Pré-assist-root'],
].filter(([id]) => id))

if (accounts.length === 0) {
  console.error('Geen Drive-service-accounts gevonden in de omgeving. Draai met --env-file=.env.local.')
  process.exit(1)
}

function client(a) {
  const auth = new google.auth.JWT({ email: a.email, key: a.key.replace(/\\n/g, '\n'), scopes: READONLY })
  return google.drive({ version: 'v3', auth })
}

async function listPublic(drive) {
  const out = []
  let pageToken
  do {
    const res = await drive.files.list({
      q: "(visibility = 'anyoneWithLink' or visibility = 'anyoneCanFind') and trashed = false",
      corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true,
      fields: 'nextPageToken, files(id, name, mimeType, parents, driveId)',
      pageSize: 1000, pageToken,
    })
    out.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

// Pad naar boven tot een bekende root; gecachet per map.
function makeResolver(drive) {
  const cache = new Map()
  async function info(folderId) {
    if (!cache.has(folderId)) {
      cache.set(folderId, drive.files.get({ fileId: folderId, fields: 'id, name, parents', supportsAllDrives: true })
        .then(r => r.data).catch(() => ({ id: folderId, name: '(onleesbare map)', parents: [] })))
    }
    return cache.get(folderId)
  }
  return async function place(file) {
    const chain = []
    let current = file.parents?.[0]
    for (let depth = 0; current && depth < 30; depth++) {
      if (roots.has(current)) return { root: roots.get(current), sub: chain.at(-1) ?? '(direct in de root)' }
      const f = await info(current)
      chain.push(f.name)
      current = f.parents?.[0]
    }
    return { root: '(buiten de bekende roots)', sub: chain.at(-1) ?? '(onbekend)' }
  }
}

async function roleOf(drive, fileId) {
  const res = await drive.permissions.list({ fileId, supportsAllDrives: true, fields: 'permissions(type, role)' })
  const anyone = (res.data.permissions ?? []).filter(p => p.type === 'anyone').map(p => p.role)
  return anyone.includes('writer') ? 'bewerker' : anyone.includes('commenter') ? 'commentator' : anyone.length ? 'lezer' : 'geen'
}

const report = []
for (const a of accounts) {
  const drive = client(a)
  let files
  try {
    files = await listPublic(drive)
  } catch (err) {
    report.push({ account: a.naam, fout: err.message })
    continue
  }
  const place = makeResolver(drive)
  const counts = new Map()
  const details = []
  for (const f of files) {
    const p = await place(f)
    const role = WANT_ROLES ? await roleOf(drive, f.id).catch(() => '?') : undefined
    const key = `${p.root} › ${p.sub}`
    const c = counts.get(key) ?? { totaal: 0, bewerker: 0 }
    c.totaal++
    if (role === 'bewerker') c.bewerker++
    counts.set(key, c)
    details.push({ id: f.id, naam: f.name, type: f.mimeType, root: p.root, map: p.sub, rol: role })
  }
  report.push({ account: a.naam, totaal: files.length, perMap: Object.fromEntries(counts), bestanden: details })
}

if (AS_JSON) {
  console.log(JSON.stringify({ gemaakt: new Date().toISOString(), alleenLezen: true, rapport: report }, null, 2))
} else {
  for (const r of report) {
    console.log(`\n== Service-account: ${r.account}`)
    if (r.fout) { console.log(`   kon niet zoeken: ${r.fout}`); continue }
    console.log(`   publiek gedeelde bestanden: ${r.totaal}`)
    const rows = Object.entries(r.perMap).sort((x, y) => y[1].totaal - x[1].totaal)
    for (const [map, c] of rows) {
      console.log(`   ${String(c.totaal).padStart(6)}  ${map}${WANT_ROLES && c.bewerker ? `   (waarvan ${c.bewerker} als BEWERKER)` : ''}`)
    }
  }
  console.log('\nAlleen gelezen; er is niets gewijzigd.')
}
