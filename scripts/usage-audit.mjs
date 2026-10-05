// Waar gaat ons Supabase-verbruik heen, en kan het nog een keer ontsporen?
//
// Twee vaten liepen in oktober 2026 over: egress (data die Supabase uitgaat)
// en log ingestion (het aantal verzoeken, want elk verzoek wordt gelogd). De
// oorzaak was één pagina die elke twintig seconden de hele maand ophaalde —
// 217 kB per keer, 39 MB per uur per openstaand tabblad.
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
const { data: month } = await db.from('planning_entries').select('*')
  .eq('year', now.getFullYear()).eq('month', now.getMonth() + 1)
const monthBytes = JSON.stringify(month ?? []).length
console.log(`  planning, één maand:        ${month?.length ?? 0} rijen, ${kb(monthBytes)}`)
console.log(`     → elke 20s zou ${(monthBytes * 180 / 1048576).toFixed(0)} MB per uur per tabblad zijn`)
console.log(`     → elke 60s, alleen wijzigingen: vrijwel nul`)

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
