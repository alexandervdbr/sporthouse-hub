import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user && isAdminUser(user) ? user : null
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += ch
  }
  result.push(cur)
  return result.map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  // req.json() is `any`, which made `csv` — and everything derived from it —
  // untyped further down. Naming the shape here types the whole CSV parse.
  const { clientId, csv } = await req.json() as { clientId?: string; csv?: string }
  if (!clientId || !csv) return new Response('clientId en csv zijn verplicht', { status: 400 })

  const text = csv.replace(/^﻿/, '')
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return new Response('Leeg CSV bestand', { status: 400 })

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())
  const idx = {
    full: headers.indexOf('full_name'),
    short: headers.indexOf('short_name'),
    competition: headers.indexOf('competition'),
    level: headers.indexOf('level'),
    country: headers.indexOf('country'),
    sofascore_id: headers.indexOf('sofascore_id'),
  }

  if (idx.full === -1 || idx.short === -1) {
    return new Response('Kolommen "full_name" en "short_name" zijn verplicht', { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch existing clubs to preserve short_names
  const { data: existing } = await admin
    .from('club_lookup_clubs')
    .select('id, full_name, sofascore_id')
    .eq('client_id', clientId)

  const existingByFullName = new Map((existing ?? []).map(c => [c.full_name.toLowerCase(), c]))
  const existingBySofaId = new Map((existing ?? []).map(c => [c.sofascore_id, c]))

  const rows = lines.slice(1).filter(l => l.trim())
  const now = new Date().toISOString()
  let inserted = 0, updated = 0, skipped = 0

  for (const line of rows) {
    const cols = parseCSVLine(line)
    const full_name = (cols[idx.full] ?? '').trim()
    const short_name = (cols[idx.short] ?? '').trim()
    if (!full_name || !short_name) { skipped++; continue }

    const sofascore_id = idx.sofascore_id >= 0 ? (cols[idx.sofascore_id] ?? '').trim() : ''
    const competition = idx.competition >= 0 ? (cols[idx.competition] ?? '').trim() : ''
    const level = idx.level >= 0 ? (cols[idx.level] ?? '').trim() : ''
    const country = idx.country >= 0 ? (cols[idx.country] ?? '').trim() : ''

    const existingMatch =
      (sofascore_id && existingBySofaId.get(sofascore_id)) ||
      existingByFullName.get(full_name.toLowerCase())

    if (existingMatch) {
      // Update everything except short_name (preserve internal name)
      await admin.from('club_lookup_clubs').update({
        full_name, competition, level, country, sofascore_id, updated_at: now,
      }).eq('id', existingMatch.id)
      updated++
    } else {
      await admin.from('club_lookup_clubs').insert({
        client_id: clientId, full_name, short_name, competition, level, country, sofascore_id,
        needs_name: false, updated_at: now,
      })
      inserted++
    }
  }

  // Auto-detect competitions and create them if they don't exist yet
  const competitionNames = new Set<string>()
  const competitionCountries = new Map<string, string>()
  for (const line of rows) {
    const cols = parseCSVLine(line)
    const competition = idx.competition >= 0 ? (cols[idx.competition] ?? '').trim() : ''
    const country = idx.country >= 0 ? (cols[idx.country] ?? '').trim() : ''
    if (competition) {
      competitionNames.add(competition)
      if (country && !competitionCountries.has(competition)) competitionCountries.set(competition, country)
    }
  }

  const { data: existingComps } = await admin
    .from('club_lookup_competitions')
    .select('name')
    .eq('client_id', clientId)

  const existingCompNames = new Set((existingComps ?? []).map((c: { name: string }) => c.name.toLowerCase()))
  let competitionsAdded = 0

  for (const name of competitionNames) {
    if (!existingCompNames.has(name.toLowerCase())) {
      await admin.from('club_lookup_competitions').insert({
        client_id: clientId,
        name,
        country: competitionCountries.get(name) ?? '',
        sofascore_tournament_id: '',
        sofascore_season_id: '',
      })
      competitionsAdded++
    }
  }

  return Response.json({ inserted, updated, skipped, competitionsAdded })
}
