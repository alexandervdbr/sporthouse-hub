import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { hasClientAccess } from '@/lib/auth-permissions'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Client ID ontbreekt.' }, { status: 400 })
  if (!hasClientAccess(user, clientId)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const body = await request.json()
  const { clientId, title, transcription, summary } = body

  if (!clientId || !title || !transcription) {
    return NextResponse.json({ error: 'Verplichte velden ontbreken.' }, { status: 400 })
  }
  if (!hasClientAccess(user, clientId)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { data, error } = await admin()
    .from('meetings')
    .insert({ client_id: clientId, title, transcription, summary, created_by: user.email })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Meeting ID ontbreekt.' }, { status: 400 })

  const { data: meeting } = await admin()
    .from('meetings')
    .select('created_by')
    .eq('id', id)
    .single()

  if (meeting?.created_by !== user.email) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  await admin().from('meetings').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
