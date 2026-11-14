import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, isUuid } from '@/features/freelancers/lib/server'
import { currentLinkUrl } from '@/features/freelancers/lib/links-server'
import { LinkSecretError } from '@/features/freelancers/lib/link-crypto'

// GET (beheren) — de bestaande link, om opnieuw te kopiëren. Zonder pincode
// is hij waardeloos; de pincode zelf is nergens meer op te vragen.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  try {
    const url = await currentLinkUrl(createAdminClient(), id)
    if (!url) return new Response('Er is geen actieve link.', { status: 404 })
    return Response.json({ url }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof LinkSecretError) {
      return new Response('De persoonlijke links zijn niet ingesteld op deze omgeving (FREELANCER_LINK_SECRET).', { status: 503 })
    }
    return new Response('Kon de link niet ophalen.', { status: 500 })
  }
}
