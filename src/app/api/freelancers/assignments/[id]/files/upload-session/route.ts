import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { uploadSessionSchema } from '@/features/freelancers/lib/schemas'
import { openUploadSessions } from '@/features/freelancers/lib/files-server'

// POST (beheren) {files:[{name,size,mimeType}]} — opent per bestand een
// resumable Drive-sessie in de map van de opdracht. De browser stuurt de
// bytes daarna rechtstreeks naar Google; deze route raakt geen bestandsinhoud.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, uploadSessionSchema)
  if ('error' in body) return body.error

  const { data: a } = await auth.supabase.from('freelancer_assignments').select('id, freelancer_id').eq('id', id).maybeSingle()
  if (!a) return new Response('Niet gevonden', { status: 404 })

  const r = await openUploadSessions(auth.supabase, a, body.data.files, 'team')
  if (!r.ok) return new Response(r.error, { status: r.status })
  return Response.json({ uploadUrls: r.uploadUrls }, { headers: { 'Cache-Control': 'no-store' } })
}
