import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, isUuid } from '@/features/freelancers/lib/server'
import { createLink, linkStatus, revokeLink } from '@/features/freelancers/lib/links-server'
import { LinkSecretError } from '@/features/freelancers/lib/link-crypto'

// De persoonlijke link van een freelancer. Alles vraagt "beheren".
//   GET    — status: geen / actief (laatst geopend) / geblokkeerd (tot …).
//            Nooit het token of de pincode.
//   POST   — nieuwe link + pincode. Een bestaande link wordt ingetrokken.
//            De pincode staat ALLEEN in dit antwoord; daarna kan hij
//            enkel vervangen worden.
//   DELETE — intrekken: de link werkt meteen niet meer.
// freelancer_links heeft geen policies; na de rechtencheck de service-role.
type Ctx = { params: Promise<{ id: string }> }
const noStore = { 'Cache-Control': 'no-store' }

function secretProblem(err: unknown) {
  if (err instanceof LinkSecretError) {
    console.error('Freelancers:', err.message)
    return new Response('De persoonlijke links zijn niet ingesteld op deze omgeving (FREELANCER_LINK_SECRET).', { status: 503 })
  }
  return null
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  try {
    return Response.json(await linkStatus(createAdminClient(), id), { headers: noStore })
  } catch {
    return new Response('Kon de link niet lezen.', { status: 500 })
  }
}

export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  try {
    const r = await createLink(createAdminClient(), id, auth.user.id)
    if (!r.ok) return new Response(r.error, { status: r.status })
    return Response.json({ url: r.url, pin: r.pin }, { status: 201, headers: noStore })
  } catch (err) {
    return secretProblem(err) ?? new Response('Kon de link niet aanmaken.', { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  try {
    const revoked = await revokeLink(createAdminClient(), id)
    return revoked ? new Response(null, { status: 204 }) : new Response('Er is geen actieve link.', { status: 404 })
  } catch {
    return new Response('Kon de link niet intrekken.', { status: 500 })
  }
}
