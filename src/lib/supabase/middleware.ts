import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

function isAuthorized(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null): boolean {
  if (!user) return false
  const sections: string[] = (user.user_metadata?.permissions as { sections?: string[] })?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') || user.user_metadata?.allowed === true
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isLoginPage  = pathname.startsWith('/login')
  const isPortalPage = pathname.startsWith('/portal')
  const isApiPage    = pathname.startsWith('/api')

  // Unauthenticated → login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    const authorized = isAuthorized(user)

    // Authorized user on login page → dashboard
    if (authorized && isLoginPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    // Freelancer trying to access main app → redirect to portal
    const isFreelancer = user.user_metadata?.freelancer === true
    if (!authorized && isFreelancer && !isPortalPage && !isApiPage && !isLoginPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/portal'
      return NextResponse.redirect(url)
    }

    // Unauthorized non-freelancer trying to access main app
    if (!authorized && !isFreelancer && !isLoginPage && !isPortalPage && !isApiPage) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
