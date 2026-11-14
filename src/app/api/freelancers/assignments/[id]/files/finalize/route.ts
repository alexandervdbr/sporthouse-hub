import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { finalizeSchema } from '@/features/freelancers/lib/schemas'
import { finalizeUploads } from '@/features/freelancers/lib/files-server'
import { recordEvent } from '@/features/freelancers/lib/assignments-server'

// POST (beheren) {uploads:[{uploadUrl,size}]} — na de uploads: per bestand bij
// Drive navragen wat er aankwam (niet de browser geloven), controleren dat
// het in de map van deze opdracht staat, en de metadata registreren. Antwoord
// per bestand, in dezelfde volgorde; één mislukking houdt de rest niet tegen.
// Bijlagen van het team zijn altijd briefingbestanden.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, finalizeSchema)
  if ('error' in body) return body.error

  const { data: a } = await auth.supabase.from('freelancer_assignments').select('id, freelancer_id').eq('id', id).maybeSingle()
  if (!a) return new Response('Niet gevonden', { status: 404 })

  try {
    const results = await finalizeUploads(auth.supabase, a, body.data.uploads, { uploader: 'team', kind: 'briefing', createdBy: auth.user.id })
    const names = results.flatMap(r => (r.ok ? [r.name] : []))
    if (names.length) {
      await recordEvent(auth.supabase, {
        assignmentId: id, actorType: 'team', actorId: auth.user.id, kind: 'bestand',
        message: `Bijlage toegevoegd: ${names.join(', ')}`, visibleToFreelancer: false,
      })
    }
    return Response.json({ results })
  } catch (err) {
    console.error('Freelancers: afronden mislukt:', (err as Error).message)
    return new Response('Kon de bestanden niet verifiëren.', { status: 502 })
  }
}
