import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json([], { status: 200 })
  if (!hasClientAccess(user, clientId)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { data } = await supabase
    .from('liveshift_embargo_docs')
    .select('id, filename, page_count, uploaded_by, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID vereist' }, { status: 400 })

  const { data: doc } = await supabase.from('liveshift_embargo_docs').select('client_id').eq('id', id).single()
  if (!doc) return NextResponse.json({ error: 'Niet gevonden.' }, { status: 404 })
  if (!hasClientAccess(user, doc.client_id)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { error } = await supabase.from('liveshift_embargo_docs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
