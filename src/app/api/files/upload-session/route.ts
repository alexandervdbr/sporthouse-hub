import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isDriveStorageConfigured, createResumableUploadSession } from '@/lib/drive-storage'
import { resolveDriveFolderId } from '@/lib/client-files-drive'
import { hasClientAccess } from '@/lib/auth-permissions'

const MAX_SIZE = 500 * 1024 * 1024 // 500 MB, matches proxyClientMaxBodySize in next.config.mjs

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Opens a Drive resumable-upload session and hands the browser the session
// URL so it can PUT the file bytes straight to Google, bypassing our server
// entirely for the actual transfer — this route only ever handles the small,
// fast bookkeeping (folder resolution + session init), never file content.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!isDriveStorageConfigured()) {
    return NextResponse.json({ error: 'Google Drive is niet geconfigureerd.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const clientId = body?.clientId as string | undefined
  const folderId = (body?.folderId as string | null | undefined) ?? null
  const filename = body?.filename as string | undefined
  const mimeType = (body?.mimeType as string | undefined) || 'application/octet-stream'
  const fileSize = body?.fileSize as number | undefined

  if (!clientId || !filename || typeof fileSize !== 'number' || fileSize <= 0) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  if (!hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: `Bestand mag niet groter zijn dan ${MAX_SIZE / 1024 / 1024} MB.` }, { status: 400 })
  }

  const admin = adminClient()
  const { data: client } = await admin.from('clients').select('id, name').eq('id', clientId).single()
  if (!client) return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })

  try {
    const driveFolderId = await resolveDriveFolderId(admin, client.id, client.name, folderId)
    const uploadUrl = await createResumableUploadSession(filename, mimeType, driveFolderId, fileSize)
    return NextResponse.json({ uploadUrl })
  } catch (err) {
    console.error('Upload-sessie starten mislukt:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Kon upload niet starten: ${msg}` }, { status: 500 })
  }
}
