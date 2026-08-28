import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId vereist' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!hasClientAccess(user, clientId)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { data, error } = await supabase
    .from('giveaways')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await request.json()
  const { clientId, title, question, correctAnswer, winnerUsername, totalComments, eligibleCount } = body
  if (!hasClientAccess(user, clientId)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const { data, error } = await supabase
    .from('giveaways')
    .insert({
      client_id: clientId,
      title,
      question,
      correct_answer: correctAnswer,
      winner_username: winnerUsername,
      total_comments: totalComments,
      eligible_count: eligibleCount,
      created_by: user.email,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { error } = await supabase.from('giveaways').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
