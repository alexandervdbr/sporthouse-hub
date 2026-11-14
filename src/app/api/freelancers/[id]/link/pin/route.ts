import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, isUuid } from '@/features/freelancers/lib/server'
import { replacePin } from '@/features/freelancers/lib/links-server'
import { LinkSecretError } from '@/features/freelancers/lib/link-crypto'

// POST (beheren) — nieuwe pincode op dezelfde link. Heft ook een blokkering
// op. De pincode staat alleen in dit antwoord.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  try {
    const r = await replacePin(createAdminClient(), id)
    if (!r.ok) return new Response(r.error, { status: r.status })
    return Response.json({ pin: r.pin }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof LinkSecretError) {
      return new Response('De persoonlijke links zijn niet ingesteld op deze omgeving (FREELANCER_LINK_SECRET).', { status: 503 })
    }
    return new Response('Kon de pincode niet vervangen.', { status: 500 })
  }
}
