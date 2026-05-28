import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { DEPARTMENTS, DUTCH_DAYS, DUTCH_MONTHS } from '@/lib/planning-config'

const TEXT_TYPES = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'rtf']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }
function toISO(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate() }

function monthRange(year: number, month: number) {
  return {
    start: toISO(year, month, 1),
    end:   toISO(year, month, daysInMonth(year, month)),
  }
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

// ─── Planning formatter ───────────────────────────────────────────────────────

function formatPlanning(
  entries: { day: number; year: number; month: number; department: string; employee: string; value: string }[],
  dayProjects: { date: string; project_name: string }[],
  year: number,
  month: number,
): string {
  if (entries.length === 0) return '(Geen planningsinvoeren voor deze periode.)'

  const projectMap: Record<string, string> = {}
  for (const dp of dayProjects) projectMap[dp.date] = dp.project_name

  // Group by day
  const byDay: Record<number, Record<string, Record<string, string>>> = {}
  for (const e of entries) {
    if (!e.value?.trim()) continue
    if (!byDay[e.day]) byDay[e.day] = {}
    if (!byDay[e.day][e.department]) byDay[e.day][e.department] = {}
    byDay[e.day][e.department][e.employee] = e.value
  }

  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)
  if (days.length === 0) return '(Geen planningsinvoeren voor deze periode.)'

  const lines: string[] = [`### ${DUTCH_MONTHS[month - 1]} ${year}`]
  for (const day of days) {
    const date = new Date(year, month - 1, day)
    const dayName = DUTCH_DAYS[date.getDay()]
    const iso = toISO(year, month, day)
    const project = projectMap[iso]
    const header = `**${dayName} ${day} ${DUTCH_MONTHS[month - 1]}**${project ? ` — ${project}` : ''}`
    lines.push(header)

    for (const dept of DEPARTMENTS) {
      const deptEntries = byDay[day][dept.name]
      if (!deptEntries) continue
      const parts = Object.entries(deptEntries).map(([emp, val]) => `${emp}: ${val}`)
      lines.push(`  ${dept.name}: ${parts.join(', ')}`)
    }
  }
  return lines.join('\n')
}

// ─── Equipment formatter ──────────────────────────────────────────────────────

function formatEquipment(
  equipment: { id: string; name: string; category: string }[],
  reservations: { equipment_id: string; date: string; reserved_by: string; project: string | null }[],
  year: number,
  month: number,
): string {
  if (equipment.length === 0) return '(Geen materiaal gevonden.)'

  const resByEquip: Record<string, { date: string; reserved_by: string; project: string | null }[]> = {}
  for (const r of reservations) {
    if (!resByEquip[r.equipment_id]) resByEquip[r.equipment_id] = []
    resByEquip[r.equipment_id].push(r)
  }

  const lines: string[] = [`### ${DUTCH_MONTHS[month - 1]} ${year}`]

  const byCategory: Record<string, typeof equipment> = {}
  for (const item of equipment) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`**${cat}**`)
    for (const item of items) {
      const res = resByEquip[item.id] ?? []
      if (res.length === 0) {
        lines.push(`  ${item.name}: volledig vrij`)
      } else {
        const resParts = res
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(r => {
            const d = new Date(r.date + 'T12:00')
            const label = `${d.getDate()} ${DUTCH_MONTHS[d.getMonth()]}`
            return `${label} door ${r.reserved_by}${r.project ? ` (${r.project})` : ''}`
          })
        lines.push(`  ${item.name}: bezet op ${resParts.join('; ')}`)
      }
    }
  }
  return lines.join('\n')
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Niet ingelogd.', { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key') {
    return new Response('NO_API_KEY', { status: 402 })
  }

  const { clientId, clientName, messages } = await request.json()
  if (!clientId || !messages?.length) {
    return new Response('Ongeldige aanvraag.', { status: 400 })
  }

  const now   = new Date()
  const curY  = now.getFullYear()
  const curM  = now.getMonth() + 1
  const nxt   = nextMonth(curY, curM)
  const cur   = monthRange(curY, curM)
  const next  = monthRange(nxt.year, nxt.month)

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [
    { data: files },
    { data: planningCur },
    { data: planningNxt },
    { data: equipmentList },
    { data: resCur },
    { data: resNxt },
    { data: dayProjCur },
    { data: dayProjNxt },
  ] = await Promise.all([
    supabase.from('files').select('id, filename, description, file_type, storage_path').eq('client_id', clientId).order('created_at'),
    supabase.from('planning_entries').select('day, year, month, department, employee, value').eq('year', curY).eq('month', curM),
    supabase.from('planning_entries').select('day, year, month, department, employee, value').eq('year', nxt.year).eq('month', nxt.month),
    supabase.from('equipment').select('id, name, category').order('category').order('name'),
    supabase.from('equipment_reservations').select('equipment_id, date, reserved_by, project').gte('date', cur.start).lte('date', cur.end),
    supabase.from('equipment_reservations').select('equipment_id, date, reserved_by, project').gte('date', next.start).lte('date', next.end),
    supabase.from('day_projects').select('date, project_name').gte('date', cur.start).lte('date', cur.end),
    supabase.from('day_projects').select('date, project_name').gte('date', next.start).lte('date', next.end),
  ])

  // ── Build files context ────────────────────────────────────────────────────
  let docsBlock = ''
  if (files && files.length > 0) {
    const parts = await Promise.all(files.map(async (f) => {
      const header = `### ${f.filename}${f.description ? ` — ${f.description}` : ''}`
      if (TEXT_TYPES.includes(f.file_type.toLowerCase())) {
        try {
          const { data: blob } = await supabase.storage.from('files').download(f.storage_path)
          if (blob) {
            const text = await blob.text()
            const trimmed = text.length > 20000 ? text.slice(0, 20000) + '\n...(bestand ingekort)' : text
            return `${header}\n${trimmed}`
          }
        } catch { /* fall through */ }
      }
      return `${header}\n(Bestandstype: ${f.file_type.toUpperCase()}${f.description ? ` — ${f.description}` : ''})`
    }))
    docsBlock = parts.join('\n\n---\n\n')
  } else {
    docsBlock = '(Nog geen bestanden geüpload voor deze klant.)'
  }

  // ── Build planning context ─────────────────────────────────────────────────
  const planningBlock = [
    formatPlanning(planningCur ?? [], dayProjCur ?? [], curY, curM),
    formatPlanning(planningNxt ?? [], dayProjNxt ?? [], nxt.year, nxt.month),
  ].join('\n\n')

  // ── Build materiaal context ────────────────────────────────────────────────
  const materiaalBlock = [
    formatEquipment(equipmentList ?? [], resCur ?? [], curY, curM),
    formatEquipment(equipmentList ?? [], resNxt ?? [], nxt.year, nxt.month),
  ].join('\n\n')

  // ── Build team overview ────────────────────────────────────────────────────
  const teamBlock = DEPARTMENTS.map(d => `- **${d.name}**: ${d.employees.join(', ')}`).join('\n')

  const systemPrompt = `Je bent de Expert AI voor ${clientName}, een klant van SporthouseGroup — een Belgisch sport marketing en media bedrijf.
Je hebt live toegang tot de personeelsplanning, materiaalplanning en bestanden van het platform. Vandaag is het ${now.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.

---

## TEAM STRUCTUUR

${teamBlock}

---

## PERSONEELSPLANNING (huidige & volgende maand)

${planningBlock}

---

## MATERIAALPLANNING (huidige & volgende maand)

${materiaalBlock}

---

## BESTANDEN & DOCUMENTEN voor ${clientName}

${docsBlock}

---

INSTRUCTIES:
- Beantwoord altijd in het Nederlands
- Je hebt actuele data van de planning en het materiaal — gebruik die actief bij vragen
- Bij vragen over beschikbaarheid: kijk in de planningdata en geef een concreet antwoord
- Bij vragen over materiaal: kijk welke items vrij of bezet zijn op de gevraagde datum
- Help met concepten, briefings, content, strategie en planningsvragen
- Wees specifiek en actionable — geen vage antwoorden
- Als iets niet in de data staat, zeg dat eerlijk

OPMAAK:
- Gebruik markdown: koppen (## en ###), vet voor kernpunten, lijsten voor overzichten
- Schrijf helder en direct, zonder onnodige omhaal`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const contextMessages = messages.slice(-30) as Anthropic.MessageParam[]

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: contextMessages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
