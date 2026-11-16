import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { canReadPlanning } from '@/lib/planning-access'
import { likeEscape, statusFilter } from '@/lib/planning-like'
import { THUIS_SUFFIX } from '@/lib/planning-status'

// Vaste kleur-presets voor de planning (SHG, FOS, …). Iedereen mag ze lezen om
// de knopjes te tonen; enkel beheerders mogen de lijst aanpassen.
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const isAdmin = isAdminUser(user)
  return isAdmin ? user : null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!canReadPlanning(user)) return new Response('Forbidden', { status: 403 })

  const { data, error } = await supabase
    .from('planning_presets')
    .select('*')
    .order('name')

  // Tabel bestaat nog niet (migratie niet uitgevoerd): geen presets, geen fout.
  if (error) return Response.json([])
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { name, color, category } = await req.json()
  if (!name?.trim()) return new Response('Naam is verplicht', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planning_presets')
    .insert({
      name: name.trim(),
      color: color?.trim() || '#3A913F',
      category: category === 'afwezig' ? 'afwezig' : 'werk',
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { id, ...fields } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof fields.name === 'string' && fields.name.trim()) update.name = fields.name.trim()
  if (typeof fields.color === 'string') update.color = fields.color
  // Onbekende waarde stil negeren: de check-constraint zou hem toch weigeren,
  // en een 500 uit de database is een slechter antwoord dan niets doen.
  if (fields.category === 'werk' || fields.category === 'afwezig') update.category = fields.category
  // Archiveren is een tijdstip, geen vlag: zo weet je achteraf wanneer een
  // status uit roulatie ging. De client stuurt een boolean, want dat is de
  // knop die hij heeft.
  if (typeof fields.archived === 'boolean') {
    update.archived_at = fields.archived ? new Date().toISOString() : null
  }
  if (typeof fields.in_stats === 'boolean') update.in_stats = fields.in_stats

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planning_presets')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })

  // Een cel bewaart zijn eigen kleur. Zonder dit bleven bestaande dagen in de
  // oude kleur staan en kregen alleen nieuwe dagen de nieuwe — twee kleuren
  // voor dezelfde status in hetzelfde raster.
  if (typeof update.color === 'string') {
    const fout = await herkleurCellen(admin, data.name, update.color)
    if (fout) {
      console.error('planning/presets herkleuren', fout)
      return new Response(`Kleur bewaard, maar bestaande dagen niet bijgewerkt: ${fout}`, { status: 500 })
    }
  }

  return Response.json(data)
}

// De cellen met deze status, in de voormiddag/hele dag en in de namiddag.
//
// De THUIS-variant ("PS - THUIS") hoort erbij zolang er geen eigen preset
// voor bestaat: dan neemt hij de kleur van zijn basis over (zie thuisColor),
// dus moet hij ook mee veranderen. Heeft hij een eigen preset, dan heeft hij
// ook een eigen kleur, en blijft hij staan.
async function herkleurCellen(
  admin: ReturnType<typeof createAdminClient>, naam: string, kleur: string,
): Promise<string | null> {
  const namen = [naam]
  if (!naam.toUpperCase().endsWith(THUIS_SUFFIX)) {
    const thuis = naam + THUIS_SUFFIX
    const { data: eigen, error } = await admin.from('planning_presets').select('id').ilike('name', likeEscape(thuis)).limit(1)
    if (error) return error.message
    if (!eigen?.length) namen.push(thuis)
  }

  const [vm, nm] = await Promise.all([
    admin.from('planning_entries').update({ bg_color: kleur }).or(statusFilter('value', namen)),
    admin.from('planning_entries').update({ bg_color_pm: kleur }).or(statusFilter('value_pm', namen)),
  ])
  return vm.error?.message ?? nm.error?.message ?? null
}

export async function DELETE(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { id } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  // Cellen die al met deze preset gestempeld zijn houden hun tekst en kleur —
  // die zijn losse waarden op de cel, geen verwijzing naar de preset-rij. Wat
  // ze wél verliezen is herkenbaarheid: de dageditor ziet er "geen bestaande
  // status" in en de statistieken schuiven ze naar Overig. Daarom telt de
  // beheer-tab eerst (zie ./gebruik) en staat archiveren ernaast.
  const admin = createAdminClient()
  const { error } = await admin.from('planning_presets').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
