import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
import { canViewSection, type SporthouseSection } from '@/lib/sporthouse-docs'
import { asShareTab } from '@/lib/share-target'

export const maxDuration = 30

// Registers a short code for a shared link.
//
// The code is made in the browser and sent here, rather than handed out by
// this route. That's not for cleverness: Safari only honours a clipboard
// write that happens inside the click that triggered it, so putting a server
// round trip in front of the copy would break copying on that browser
// entirely. Generating it locally keeps the copy instant and moves the
// registration out of the way.
//
// A code is a signpost, not a key. Whoever holds one still has to be signed
// in and still has to have access; that's checked when the link is opened,
// not here. What is checked here is that the person creating it can see what
// they're pointing at — so a code can't be minted for someone else's folder.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const code = body?.code as string | undefined
  const clientId = body?.clientId as string | undefined
  const tab = asShareTab(body?.tab)
  const folderId = (body?.folderId as string | null | undefined) || null
  const fileId = (body?.fileId as string | null | undefined) || null

  // Url-safe characters only, and long enough that guessing one is pointless.
  if (!code || !/^[A-Za-z0-9_-]{8,64}$/.test(code)) {
    return NextResponse.json({ error: 'Ongeldige code.' }, { status: 400 })
  }
  if (!clientId || !tab) {
    return NextResponse.json({ error: 'Ongeldig doel.' }, { status: 400 })
  }

  // Finance and administration are sections with their own permission; the
  // files tab follows the client's own access.
  const allowed = tab === 'files'
    ? hasClientAccess(user, clientId)
    : hasClientAccess(user, clientId) && canViewSection(user, tab as SporthouseSection)

  if (!allowed) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.from('share_links').insert({
    code,
    client_id: clientId,
    tab,
    folder_id: folderId,
    file_id: fileId,
    created_by: user.email,
  })

  if (error) {
    // A collision is astronomically unlikely at this length, but if one
    // happens the browser has a link on the clipboard that points somewhere
    // else — worth saying so rather than shrugging.
    console.error('Kon deellink niet registreren:', error.message)
    return NextResponse.json({ error: 'Kon de korte link niet registreren.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
