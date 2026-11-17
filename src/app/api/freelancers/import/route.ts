import { requireFreelancers, parseBody } from '@/features/freelancers/lib/server'
import { importSchema } from '@/features/freelancers/lib/schemas'
import { slugify } from '@/features/freelancers/lib/slug'

// POST (beheren) — een import uitvoeren die de gebruiker in het voorbeeld
// bevestigd heeft (docs/freelancers-overzicht.md §8.5). Eén verzoek per
// import, geen bestand: de browser leest de CSV, de server krijgt alleen de
// rijen, en valideert ze opnieuw (importSchema).
//
// Volgorde: nieuwe disciplines, dan de nieuwe freelancers in één keer, dan
// de bij te werken freelancers. Faalt de groep nieuwe freelancers (bv. een
// e-mailadres dat intussen bestaat), dan worden ze één voor één opnieuw
// geprobeerd, zodat alleen de foute rijen wegvallen — met hun rijnummer.

const message = (code?: string) =>
  code === '23505' ? 'Er bestaat al een freelancer met dit e-mailadres.'
  : code === '23503' ? 'Een van de disciplines bestaat niet.'
  : code === '23514' ? 'Bedrag en eenheid horen samen.'
  : 'Kon deze rij niet opslaan.'

export async function POST(req: Request) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const body = await parseBody(req, importSchema)
  if ('error' in body) return body.error
  const { new_disciplines, create, update } = body.data
  const db = auth.supabase

  if (new_disciplines.some(d => slugify(d.label) !== d.key)) return new Response('Ongeldige discipline.', { status: 400 })

  // 1. Disciplines die nog niet bestaan (op sleutel of label).
  let disciplinesAdded = 0
  if (new_disciplines.length) {
    const { data: known, error } = await db.from('freelancer_disciplines').select('key, label, sort')
    if (error) return new Response('Kon de disciplines niet ophalen.', { status: 500 })
    const keys = new Set((known ?? []).map(d => d.key as string))
    const labels = new Set((known ?? []).map(d => (d.label as string).trim().toLowerCase()))
    let sort = Math.max(0, ...(known ?? []).map(d => (d.sort as number) ?? 0))
    const fresh = new_disciplines.filter(d => !keys.has(d.key) && !labels.has(d.label.trim().toLowerCase()))
    if (fresh.length) {
      const { error: insErr } = await db.from('freelancer_disciplines').insert(fresh.map(d => ({ key: d.key, label: d.label, sort: (sort += 10) })))
      if (insErr) return new Response('Kon de nieuwe disciplines niet opslaan.', { status: 500 })
      disciplinesAdded = fresh.length
    }
  }

  const errors: { line: number; message: string }[] = []

  // 2. Nieuwe freelancers.
  let added = 0
  if (create.length) {
    const { data, error } = await db.from('freelancers').insert(create.map(r => r.data)).select('id')
    if (!error) added = data?.length ?? 0
    else {
      for (const r of create) {
        const { error: e } = await db.from('freelancers').insert(r.data).select('id').single()
        if (e) errors.push({ line: r.line, message: message(e.code) })
        else added++
      }
    }
  }

  // 3. Bijwerken.
  let updated = 0
  for (const r of update) {
    const { data, error } = await db.from('freelancers').update(r.data).eq('id', r.id).select('id').maybeSingle()
    if (error) errors.push({ line: r.line, message: message(error.code) })
    else if (!data) errors.push({ line: r.line, message: 'Deze freelancer bestaat niet meer.' })
    else updated++
  }

  return Response.json({ toegevoegd: added, bijgewerkt: updated, disciplines: disciplinesAdded, fouten: errors.sort((a, b) => a.line - b.line) })
}
