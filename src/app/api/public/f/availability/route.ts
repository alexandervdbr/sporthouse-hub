import { json, requireLinkSession } from '@/features/freelancers/lib/public-server'
import { availabilitySchema, readBody } from '@/features/freelancers/lib/public-schemas'

// PUT {availability, available_from?} — de freelancer zet zelf zijn
// beschikbaarheid. De bron ('freelancer') en het tijdstip worden bewaard en
// zijn intern zichtbaar ("door freelancer, 3 dagen geleden").
export async function PUT(req: Request) {
  const auth = await requireLinkSession(req, 'write')
  if ('error' in auth) return auth.error
  const body = await readBody(req, availabilitySchema)
  if (!body) return json({ error: 'Ongeldig verzoek.' }, 400)

  const from = body.availability === 'beschikbaar' ? null : body.available_from ?? null
  const { error } = await auth.db.from('freelancers').update({
    availability: body.availability,
    available_from: from,
    availability_updated_at: new Date().toISOString(),
    availability_updated_by: 'freelancer',
  }).eq('id', auth.link.freelancer_id)
  if (error) return json({ error: 'Kon je beschikbaarheid niet opslaan.' }, 500)
  return json({ availability: body.availability, availableFrom: from })
}
