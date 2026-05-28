import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const isAllowed =
          ADMIN_EMAILS.includes(user.email ?? '') ||
          user.user_metadata?.allowed === true

        if (isAllowed) return NextResponse.redirect(`${origin}/dashboard`)

        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=not_allowed`)
      }
    }
  }

  // Fall back to login page — the login page handles ?code= itself
  if (code) return NextResponse.redirect(`${origin}/login?code=${code}`)

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
