import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const editionId = searchParams.get('edition_id')
  const section   = searchParams.get('section')   // 'content' | 'inspiratie' | 'all'
  const userId    = searchParams.get('user_id')   // optional filter

  if (!editionId) return new Response('Missing edition_id', { status: 400 })

  let query = supabase
    .from('preassist_submissions')
    .select('id, file_url, file_name, file_type, submitted_by_name, section, title, client_name')
    .eq('edition_id', editionId)
    .order('created_at', { ascending: true })

  if (section && section !== 'all') query = query.eq('section', section)
  if (userId) query = query.eq('submitted_by_id', userId)

  const { data: submissions, error } = await query
  if (error) return new Response(error.message, { status: 500 })

  // Generate signed URLs for each file (1 hour expiry)
  const results = await Promise.all(
    (submissions ?? []).map(async (s) => {
      const path = s.file_url
      const { data } = await supabase.storage
        .from('preassist')
        .createSignedUrl(path, 3600)
      return {
        id:         s.id,
        signedUrl:  data?.signedUrl ?? null,
        fileName:   s.file_name,
        fileType:   s.file_type,
        section:    s.section,
        person:     s.submitted_by_name,
        title:      s.title,
        clientName: s.client_name,
      }
    })
  )

  return Response.json(results)
}
