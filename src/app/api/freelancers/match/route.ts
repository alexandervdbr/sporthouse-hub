import { createClient, createAdminClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { description, freelancers } = await req.json()
  if (!description?.trim()) return new Response('description required', { status: 400 })
  if (!freelancers?.length) return Response.json([])

  // ── Fetch full project history for all freelancers ──────────────────────────
  const admin = createAdminClient()
  const freelancerIds = freelancers.map((f: { id: string }) => f.id)

  const { data: allProjects } = await admin
    .from('freelancer_projects')
    .select('freelancer_id, project_name, client_name, date, score, notes')
    .in('freelancer_id', freelancerIds)
    .order('date', { ascending: false })

  const projectsByFreelancer = (allProjects ?? []).reduce<Record<string, typeof allProjects>>((acc, p) => {
    if (!acc[p.freelancer_id]) acc[p.freelancer_id] = []
    acc[p.freelancer_id]!.push(p)
    return acc
  }, {})

  // ── Build rich profiles ─────────────────────────────────────────────────────
  const profiles = freelancers.map((f: {
    id: string
    name: string
    types: string[]
    tested: string | null
    price_info: string | null
    rating: number | null
    portfolio_url: string | null
    notes: string | null
    email: string | null
    phone: string | null
    // legacy
    specialties: string[]
    hourly_rate: number | null
    bio: string | null
  }) => {
    const projects = projectsByFreelancer[f.id] ?? []
    const scores = projects.map(p => p.score).filter((s): s is number => s != null)
    const avgScore = scores.length
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : null

    const types = [...(f.types ?? []), ...(f.specialties ?? [])].filter(Boolean)
    const testedLabel = f.tested === 'ja' ? 'Vaste freelancer (getest)' : f.tested === 'weinig' ? 'Weinig getest' : 'Nog niet getest'

    const projectLines = projects.slice(0, 5).map(p => {
      const parts = [`  • ${p.project_name}`]
      if (p.client_name) parts.push(`(${p.client_name})`)
      if (p.score != null) parts.push(`score ${p.score}/10`)
      if (p.notes) parts.push(`— "${p.notes}"`)
      return parts.join(' ')
    })

    return [
      `ID: ${f.id}`,
      `Naam: ${f.name}`,
      `Types/specialiteiten: ${types.length ? types.join(', ') : 'niet opgegeven'}`,
      `Status: ${testedLabel}`,
      `Beoordeling: ${f.rating ? `${f.rating}/5 sterren` : 'geen beoordeling'}`,
      `Prijs: ${f.price_info || f.hourly_rate ? (f.price_info || `€${f.hourly_rate}/uur`) : 'onbekend'}`,
      `Notities: ${f.notes || f.bio || '—'}`,
      `Portfolio: ${f.portfolio_url || 'niet opgegeven'}`,
      `Projectgeschiedenis (${projects.length} projecten, gem. score: ${avgScore ? `${avgScore}/10` : 'n/a'}):`,
      ...(projectLines.length ? projectLines : ['  (geen projecten)']),
    ].join('\n')
  }).join('\n\n---\n\n')

  // ── Prompt ──────────────────────────────────────────────────────────────────
  const prompt = `Je bent een slimme matchmaker voor Sporthouse Group, een sportmediabedrijf. Je taak is de TOP 3 beste freelancers vinden voor een specifiek project of vraag.

PROJECT/VRAAG VAN DE KLANT:
"${description}"

BESCHIKBARE FREELANCERS:
${profiles}

INSTRUCTIES:
- Geef ALTIJD exact 3 freelancers terug (of minder als er minder dan 3 beschikbaar zijn).
- Rangschik van beste naar minder goede match — nummer 1 is de absolute topkeuze.
- Een perfecte match op type is niet vereist: iemand die "Allround" is kan soms beter passen dan een specialist.
- Weeg deze factoren mee:
  1. Types/specialiteiten: hoe goed sluit het type werk aan bij de vraag?
  2. Projectervaring: heeft de freelancer vergelijkbare projecten gedaan? Hoe waren de scores en notities?
  3. Status: een vaste freelancer is bewezen; "te testen" kan risico meebrengen.
  4. Beoordeling (1-5 sterren) en gemiddelde projectscore: hoge scores = betrouwbare kwaliteit.
  5. Prijs: relevant als de klant budget noemt.
  6. Notities: bevatten vaak cruciale info over stijl, sterktes of beperkingen.
- De "reason" moet concreet en informatief zijn (2-3 zinnen). Verwijs naar specifieke projecten, scores, of notities als die relevant zijn.
- De "concern" is een eerlijk aandachtspunt (bijv. weinig ervaring, hogere prijs, niet eerder getest). Null als er geen bezwaar is.
- Gebruik de exacte ID uit het profiel.

Antwoord ALLEEN in geldig JSON (geen uitleg erbuiten):
[
  {
    "id": "<exacte freelancer UUID>",
    "rank": 1,
    "reason": "<waarom dit de beste keuze is, 2-3 zinnen, concreet>",
    "concern": "<eerlijk aandachtspunt of null>"
  },
  ...
]`

  // ── Call Claude ─────────────────────────────────────────────────────────────
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return Response.json([])

  let ranked: { id: string; rank: number; reason: string; concern: string | null }[] = []
  try {
    ranked = JSON.parse(jsonMatch[0])
  } catch {
    return Response.json([])
  }

  // Sort by rank just in case, cap at 3
  ranked = ranked.sort((a, b) => a.rank - b.rank).slice(0, 3)

  // Attach full freelancer data, match by UUID
  const result = ranked
    .map(r => {
      const f = freelancers.find((fl: { id: string }) => fl.id === r.id)
      if (!f) return null
      return { ...f, match_reason: r.reason, match_concern: r.concern, match_rank: r.rank }
    })
    .filter(Boolean)

  return Response.json(result)
}
