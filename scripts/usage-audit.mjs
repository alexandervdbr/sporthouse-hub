// Waar gaat ons Supabase-verbruik heen, en kan het nog een keer ontsporen?
//
// Twee vaten liepen in oktober 2026 over: egress (data die Supabase uitgaat)
// en log ingestion (het aantal verzoeken, want elk verzoek wordt gelogd). De
// oorzaak was één pagina die elke twintig seconden de hele maand ophaalde.
//
// Dit script rapporteerde die omvang eerst als de lengte van de JSON, en dat
// is misleidend: Supabase pakt zijn antwoorden in. Een maand die er als
// 194 kB uitziet gaat als 10 kB over de lijn, een factor twintig. Egress
// wordt op de lijn gemeten, dus wordt hier nu de ingepakte omvang getoond —
// en daarnaast het aantal verzoeken, want dat is wat log ingestion telt en
// dat was het vat dat het verst overliep.
//
// Dat soort dingen is niet zichtbaar in de code zelf: een timer van vier
// regels ziet er onschuldig uit. Dit script maakt het zichtbaar, zodat de
// vraag "houden we het laag" een getal oplevert in plaats van een gevoel.
//
//   node scripts/usage-audit.mjs
//
// Wat het niet kan: zien wat gebruikers werkelijk doen. De dashboards van
// Supabase en Vercel blijven de waarheid; dit vertelt je waar je moet kijken
// als daar iets oploopt, en of een nieuwe wijziging het erger maakt.

import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const kb = n => `${(n / 1024).toFixed(1)} kB`

// ── 1. Wat draait er op een klok ────────────────────────────────────────────
// Terugkerend werk is bijna altijd de oorzaak: één gebruiker met een open
// tabblad vermenigvuldigt alles met honderden per dag.

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

console.log('\n── Terugkerende timers in src/ ─────────────────────────────')
let timers = 0
for (const file of walk('src')) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const m = line.match(/setInterval\s*\(/)
    if (!m) return
    // De interval staat vaak op dezelfde regel of een paar regels verderop.
    const nearby = lines.slice(i, i + 8).join(' ')
    const ms = nearby.match(/,\s*(\d{3,})\s*\)/)
    const every = ms ? Number(ms[1]) : null
    timers++
    const perHour = every ? Math.round(3600000 / every) : null
    console.log(`  ${file}:${i + 1}`)
    console.log(`     elke ${every ? `${every / 1000}s` : '?'}${perHour ? ` → ${perHour}× per uur per open tabblad` : ''}`)
  })
}
if (timers === 0) console.log('  geen gevonden')
console.log('\n  Let op: een timer die niets ophaalt is onschuldig. Kijk bij elke')
console.log('  hit of er een fetch of een supabase-aanroep in zit.')

// ── 2. Hoe zwaar zijn de lijsten die we ophalen ─────────────────────────────

console.log('\n── Omvang van de grote queries ─────────────────────────────')

const now = new Date()
// Dezelfde kolommen die PlanningApp opvraagt (SELECT_COLS), niet '*'. Dat
// scheelt werkelijk: de uuid-sleutel pakt slecht in, en de app vraagt hem
// helemaal niet op — met '*' erbij lijkt een maand twee keer zo duur als hij is.
const APP_COLS = 'year, month, day, department, employee, value, bold, text_color, bg_color, note, updated_by, updated_at'
const { data: month } = await db.from('planning_entries').select(APP_COLS)
  .eq('year', now.getFullYear()).eq('month', now.getMonth() + 1)
const monthRaw = JSON.stringify(month ?? []).length
const monthWire = gzipSync(JSON.stringify(month ?? [])).length
console.log(`  planning, één maand:        ${month?.length ?? 0} rijen`)
// Lokaal inpakken geeft een ondergrens: Supabase pakt minder agressief in
// dan node's standaardinstelling. Nagemeten over HTTP kwam een maand van 741
// rijen op 10,1 kB uit waar dit 4,8 kB zei, dus ongeveer het dubbele. Goed
// genoeg om een ontsporing te zien, niet om een factuur mee na te rekenen.
console.log(`     ruw ${kb(monthRaw)}, over de lijn ~${kb(monthWire)}–${kb(monthWire * 2)} (ingepakt)`)
console.log(`     → elke 20s ophalen zou ~${(monthWire * 2 * 180 / 1048576).toFixed(1)} MB per uur per tabblad zijn`)

// Wat de planning werkelijk doet sinds de maandcache: niet de maand ophalen,
// maar per minuut twee kleine vragen stellen per zichtbare maand — wat is er
// gewijzigd, en hoeveel rijen staan er nu. Beide antwoorden zijn vrijwel leeg;
// de kosten zitten in de verzoeken zelf, niet in de bytes.
const POLL_PER_HOUR = 60          // de timer in PlanningApp
const REQ_PER_SYNC = 2            // gewijzigde rijen + telling
const BYTES_PER_SYNC = 2200       // gemeten: ~1.1 kB headers per antwoord, lege body
console.log(`  planning, stilstaand tabblad:`)
console.log(`     ${POLL_PER_HOUR * REQ_PER_SYNC} verzoeken/uur en ${kb(POLL_PER_HOUR * BYTES_PER_SYNC)}/uur per zichtbare maand`)
console.log(`     → navigeren naar een pas gesynchroniseerde maand kost niets (cache)`)

const { data: clients } = await db.from('clients').select('id, name').limit(1)
if (clients?.[0]) {
  const { data: files } = await db.from('files').select('*').eq('client_id', clients[0].id).is('deleted_at', null)
  console.log(`  bestanden, één klant:       ${files?.length ?? 0} rijen, ${kb(JSON.stringify(files ?? []).length)}`)
}

// ── 3. Hoe hard groeit de data ──────────────────────────────────────────────
// Een query die vandaag klein is, is dat over een jaar misschien niet meer.

console.log('\n── Rijen per tabel ─────────────────────────────────────────')
for (const table of ['planning_entries', 'files', 'file_folders', 'share_links', 'sporthouse_documents']) {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  console.log(`  ${table.padEnd(24)} ${error ? error.message : count}`)
}

console.log('\n── Waar de waarheid staat ──────────────────────────────────')
console.log('  Supabase → Settings → Usage      (egress en log ingestion)')
console.log('  Vercel   → Usage → Fast Origin Transfer')
console.log('  Beide lopen een paar uur achter; dit script meet de oorzaak,')
console.log('  niet het gevolg.\n')
