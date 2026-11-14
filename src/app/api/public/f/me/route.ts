import { json, requireLinkSession } from '@/features/freelancers/lib/public-server'
import { listForFreelancer, profileFor } from '@/features/freelancers/lib/public-select'

// GET — de startpagina: voornaam, beschikbaarheid en de zichtbare opdrachten.
export async function GET(req: Request) {
  const auth = await requireLinkSession(req, 'read')
  if ('error' in auth) return auth.error
  const [profile, assignments] = await Promise.all([
    profileFor(auth.db, auth.link.freelancer_id),
    listForFreelancer(auth.db, auth.link.freelancer_id),
  ])
  return json({ ...profile, assignments })
}
