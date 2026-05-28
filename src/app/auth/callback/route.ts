import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()
  const { error: exchError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchError) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Check authorization for the main app
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const isAllowed = isAdmin || user.user_metadata?.allowed === true

  if (isAllowed) {
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  // Check if user is a freelancer (via metadata or DB)
  const admin = createAdminClient()
  const isFreelancer = user.user_metadata?.freelancer === true
  if (!isFreelancer) {
    const { data: freelancerRow } = await admin
      .from('freelancers')
      .select('id')
      .eq('email', user.email ?? '')
      .maybeSingle()
    if (freelancerRow) {
      return NextResponse.redirect(`${origin}/portal`)
    }
  } else {
    return NextResponse.redirect(`${origin}/portal`)
  }

  // Not authorized — immediately delete via REST API and sign out
  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`,
    {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  )
  await supabase.auth.signOut()

  return NextResponse.redirect(`${origin}/login?error=unauthorized`)
}
