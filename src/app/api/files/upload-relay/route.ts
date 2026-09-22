import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

const GOOGLE_UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files?'

// Relays one upload chunk to a Drive resumable-upload session server-to-server.
// Exists purely because the browser can't PUT to googleapis.com directly —
// Google's upload endpoint doesn't return CORS headers, so the browser always
// blocks reading the response even though Google fully processes the request
// (confirmed via a HAR capture: every chunk showed status 200 + net::ERR_FAILED).
// Server-to-server calls aren't subject to CORS, so this relay sidesteps it
// entirely while keeping the chunking/progress/resume logic on the client.
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const uploadUrl = request.headers.get('x-upload-url')
  if (!uploadUrl || !uploadUrl.startsWith(GOOGLE_UPLOAD_PREFIX)) {
    return NextResponse.json({ error: 'Ongeldige upload-URL.' }, { status: 400 })
  }

  const contentRange = request.headers.get('content-range')
  const chunk = await request.arrayBuffer()

  let googleRes: Response
  try {
    googleRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: contentRange ? { 'Content-Range': contentRange } : {},
      body: chunk,
    })
  } catch (err) {
    console.error('Upload-relay: kon Drive niet bereiken:', err)
    return NextResponse.json({ error: 'Kon Drive niet bereiken.' }, { status: 502 })
  }

  const body = await googleRes.text()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const range = googleRes.headers.get('range')
  if (range) headers['Range'] = range

  return new NextResponse(body, { status: googleRes.status, headers })
}
