import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'


// Where to land after signing in, when the login was started from a shared
// link. Treated as hostile: an unchecked value here would let someone hand
// out a login link on our domain that lands on theirs. Only a plain same-site
// path is accepted — no scheme, no host, and no leading double slash, which
// browsers read as protocol-relative.
function safeNext(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (!/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(raw)) return null
  return raw
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

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

  // Freelancers go to /portal
  const isFreelancer = user.app_metadata?.freelancer === true
  if (isFreelancer) {
    return NextResponse.redirect(`${origin}/portal`)
  }

  const admin = createAdminClient()
  const { data: freelancerRow } = await admin
    .from('freelancers')
    .select('id')
    .eq('email', user.email ?? '')
    .maybeSingle()

  if (freelancerRow) {
    return NextResponse.redirect(`${origin}/portal`)
  }

  // Everyone else goes where they were headed, or to the dashboard —
  // Supabase's "disable signups" ensures only pre-created accounts reach here
  return NextResponse.redirect(`${origin}${next ?? '/dashboard'}`)
}
