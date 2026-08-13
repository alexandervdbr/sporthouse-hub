import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSporthouseDriveConfigured, createResumableUploadSession } from '@/lib/drive-storage'
import { resolveSporthouseDriveFolderId } from '@/lib/sporthouse-docs-drive'
import { canManageSection, isSporthouseSection } from '@/lib/sporthouse-docs'

const MAX_SIZE = 500 * 1024 * 1024 // 500 MB, matches proxyClientMaxBodySize in next.config.mjs

// Opens a Drive resumable-upload session so the browser can PUT the bytes
// straight to Google. Files created this way are never shared publicly — the
// session only sets a name and parent folder — so they stay as private as the
// rest of the Sporthouse Intern drive.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!isSporthouseDriveConfigured()) {
    return NextResponse.json({ error: 'Google Drive is niet geconfigureerd.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const section = body?.section as string | undefined
  const folderId = (body?.folderId as string | null | undefined) ?? null
  const filename = body?.filename as string | undefined
  const mimeType = (body?.mimeType as string | undefined) || 'application/octet-stream'
  const fileSize = body?.fileSize as number | undefined

  if (!isSporthouseSection(section ?? null)) return NextResponse.json({ error: 'section ontbreekt.' }, { status: 400 })
  if (!canManageSection(user, section as 'finance' | 'administration')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }
  if (!filename || typeof fileSize !== 'number' || fileSize <= 0) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: `Bestand mag niet groter zijn dan ${MAX_SIZE / 1024 / 1024} MB.` }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    const driveFolderId = await resolveSporthouseDriveFolderId(admin, section as 'finance' | 'administration', folderId)
    const uploadUrl = await createResumableUploadSession(filename, mimeType, driveFolderId, fileSize)
    return NextResponse.json({ uploadUrl })
  } catch (err) {
    console.error('Upload-sessie starten mislukt:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Kon upload niet starten: ${msg}` }, { status: 500 })
  }
}
