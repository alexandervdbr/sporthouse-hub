import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { hasOpenSection } from '@/lib/auth-permissions'
import { getSessionUser } from '@/lib/supabase/claims'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  // Leespad, net als de download-route ernaast: het token lokaal nagerekend
  // in plaats van per aanroep bij de Auth-server bevestigd.
  const user = await getSessionUser(supabase)
  if (!user) return new Response('Unauthorized', { status: 401 })
  // Keek alleen of je ingelogd was, terwijl de download- en thumbnail-route
  // ernaast de sectie wel controleren.
  if (!hasOpenSection(user, 'preassist')) return new Response('Geen toegang.', { status: 403 })

  const { searchParams } = new URL(req.url)
  const editionId = searchParams.get('edition_id')
  const section   = searchParams.get('section')   // 'content' | 'inspiratie' | 'all'
  const userId    = searchParams.get('user_id')   // optional filter

  if (!editionId) return new Response('Missing edition_id', { status: 400 })

  let query = supabase
    .from('preassist_submissions')
    .select('id, file_url, file_name, file_type, submitted_by_name, section, title, client_name, storage_provider')
    .eq('edition_id', editionId)
    .order('created_at', { ascending: true })

  if (section && section !== 'all') query = query.eq('section', section)
  if (userId) query = query.eq('submitted_by_id', userId)

  const { data: submissions, error } = await query
  if (error) return new Response(error.message, { status: 500 })

  const origin = req.nextUrl.origin

  // Generate a downloadable URL for each file — a Supabase signed URL (1h
  // expiry) for legacy rows, or our own Drive download proxy for Drive rows.
  const results = await Promise.all(
    (submissions ?? []).map(async (s) => {
      let signedUrl: string | null = null
      if (s.storage_provider === 'drive') {
        signedUrl = `${origin}/api/preassist/download?id=${s.id}`
      } else {
        const { data } = await supabase.storage
          .from('preassist')
          .createSignedUrl(s.file_url, 3600)
        signedUrl = data?.signedUrl ?? null
      }
      return {
        id:         s.id,
        signedUrl,
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
