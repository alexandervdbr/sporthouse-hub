import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = 'https://cyhburjidtoudltqabfo.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5aGJ1cmppZHRvdWRsdHFhYmZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIxNzY2MiwiZXhwIjoyMDkxNzkzNjYyfQ.9zC3h-zIANJ9nxkfnOLXPyDWCAVd4Ir-UKQfqnlbbw8'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Column → (department, employee) mapping ──────────────────────────────────
// Index 0 = day name, Index 1 = date, then employees from index 2
// Index 8 is a spacer column

const COLUMNS = [
  null, null, // day name, date
  { dept: 'Studenten PS',    emp: 'Emile' },
  { dept: 'Studenten PS',    emp: 'Elias' },
  { dept: 'Studenten PS',    emp: 'Wolf' },
  { dept: 'Stags PS',        emp: 'Mike' },
  { dept: 'Stags PS',        emp: 'Thibault' },
  { dept: 'Stags PS',        emp: 'Sasha' },
  null, // spacer
  { dept: 'Team PS',         emp: 'Leroy' },
  { dept: 'Team PS',         emp: 'Jelle' },
  { dept: 'Team PS',         emp: 'Tim' },
  { dept: 'Team PS',         emp: 'Michiel' },
  { dept: 'Team PS',         emp: 'Bert' },
  { dept: 'Team PS',         emp: 'Benno' },
  { dept: 'Team PS',         emp: 'Jef' },
  { dept: 'Projectkant SHG', emp: 'Kenny' },
  { dept: 'Projectkant SHG', emp: 'Nick' },
  { dept: 'Projectkant SHG', emp: 'Luther' },
  { dept: 'Projectkant SHG', emp: 'Arne' },
  { dept: 'Projectkant SHG', emp: 'Thijs M' },
  { dept: 'Projectkant SHG', emp: 'Bram' },
  { dept: 'Projectkant SHG', emp: 'Robin Bieber' },
  { dept: 'Projectkant SHG', emp: 'Alexander' },
  { dept: 'Projectkant SHG', emp: 'Yaro' },
  { dept: 'Projectkant SHG', emp: 'Jorn' },
  { dept: 'Projectkant SHG', emp: 'Emilie' },
  { dept: 'Projectkant SHG', emp: 'Torken' },
  { dept: 'STAGS Projectkant', emp: 'Deryan' },
  { dept: 'STAGS Projectkant', emp: 'Robin' },
  { dept: 'STAGS Projectkant', emp: 'Thibault' },
  { dept: 'STAGS Projectkant', emp: 'Clara' },
  { dept: 'Sport Vl',        emp: 'Arnor' },
  { dept: 'FOS',             emp: 'Thijs' },
  { dept: 'FOS',             emp: 'Rune' },
  { dept: 'FOS',             emp: 'Jarne' },
  { dept: 'FOS',             emp: 'Rane' },
  { dept: 'FOS STAGS',       emp: 'Nathan' },
  { dept: 'FOS STAGS',       emp: 'Noa' },
  { dept: 'FOS STAGS',       emp: 'Mathieu' },
  { dept: 'Flanders Classics', emp: 'Zias' },
  { dept: 'Flanders Classics', emp: 'Nino' },
  { dept: 'De Spor',         emp: 'Daan' },
  { dept: 'De Spor',         emp: 'Max' },
]

// ─── Color coding ─────────────────────────────────────────────────────────────

function getBgColor(value) {
  const v = value.toUpperCase()
  if (!v.trim()) return null

  if (v.includes('VERLOF'))               return '#4a0020' // roze
  if (v.includes('FEESTDAG'))             return '#422006' // geel
  if (v.includes('ZIEK'))                 return '#450a0a' // rood
  if (v.includes('RECUP'))                return '#2e1065' // paars
  if (v.includes('SCHOOL'))               return '#1c1c1c' // grijs
  if (v === 'NB')                         return '#1c1c1c' // grijs
  if (v.includes('HALF'))                 return '#422006' // geel

  if (v.includes('PLAY SPORTS') || (v.includes('PS') && !v.includes('FOS') && !v.includes('SHG'))) return '#0c1a3a' // blauw
  if (v.includes('SHG'))                  return '#052e16' // groen
  if (v.includes('FOS'))                  return '#431407' // oranje
  if (v.includes('JPL'))                  return '#052e16' // groen
  if (v.includes('LSL'))                  return '#052e16' // groen
  if (v.includes('SPORT VL'))             return '#052e16' // groen
  if (v.includes('RBFA'))                 return '#052e16' // groen
  if (v.includes('BEKERFINALE'))          return '#052e16' // groen
  if (v.includes('HASSELT'))              return '#1c1c1c' // grijs
  if (v.includes('FLCS') || v.includes('FLANDERS')) return '#052e16' // groen
  if (v.includes('BRUGGE'))              return '#052e16' // groen
  if (v.includes('CCC'))                 return '#052e16' // groen
  if (v.includes('90 LIVE') || v.includes('90LIVE')) return '#431407' // oranje

  return '#1c1c1c' // grijs voor al de rest
}

// ─── Parse CSV ────────────────────────────────────────────────────────────────

const csv = readFileSync('./PLANNING - Mei - 2026.csv', 'utf8')
const lines = csv.split('\n').map(l => l.split(','))

const entries = []

for (let i = 2; i < lines.length; i++) {
  const row = lines[i]
  if (!row || row.length < 3) continue

  const dayName = row[0]?.trim()
  const dateStr = row[1]?.trim()
  if (!dayName || !dateStr) continue

  // Parse date: "27/04" or "01/05"
  const [dayNum, monthNum] = dateStr.split('/').map(Number)
  if (!dayNum || !monthNum) continue

  const year = 2026

  for (let col = 2; col < COLUMNS.length; col++) {
    const colDef = COLUMNS[col]
    if (!colDef) continue

    const rawValue = (row[col] || '').trim()
    if (!rawValue) continue

    entries.push({
      year,
      month: monthNum,
      day: dayNum,
      department: colDef.dept,
      employee: colDef.emp,
      value: rawValue,
      bold: true,
      text_color: null,
      bg_color: getBgColor(rawValue),
      updated_by: 'import',
    })
  }
}

// ─── Insert into Supabase ─────────────────────────────────────────────────────

console.log(`Importing ${entries.length} entries...`)

// Delete existing entries for April + May 2026 first
await supabase.from('planning_entries').delete().eq('year', 2026).eq('month', 4)
await supabase.from('planning_entries').delete().eq('year', 2026).eq('month', 5)

// Insert in batches of 100
const BATCH = 100
for (let i = 0; i < entries.length; i += BATCH) {
  const batch = entries.slice(i, i + BATCH)
  const { error } = await supabase.from('planning_entries').insert(batch)
  if (error) {
    console.error('Error at batch', i, error.message)
  } else {
    console.log(`Inserted ${Math.min(i + BATCH, entries.length)}/${entries.length}`)
  }
}

console.log('Done!')
