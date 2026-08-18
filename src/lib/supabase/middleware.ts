import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  const isPortalApiPage = pathname.startsWith('/api/portal')
  const isAuthApiPage   = pathname.startsWith('/api/auth')
  const isCallbackPage = pathname.startsWith('/auth')
  // Called by the iOS shortcut with its own per-user bearer token instead of
  // a session cookie — see /api/save-reel's own auth check.
  const isSaveReelApiPage = pathname.startsWith('/api/save-reel')
  // Must be publicly reachable — this is the URL submitted to Meta App Review.
  const isPrivacyPage = pathname.startsWith('/privacy')

  // Unauthenticated → login (API routes get a 401 instead of a redirect)
  if (!user && !isLoginPage && !isCallbackPage && !isSaveReelApiPage && !isPrivacyPage) {
    if (isApiPage) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    const isFreelancer = user.app_metadata?.freelancer === true

    // Freelancers only get /api/portal/* and /api/auth/* — every other API
    // route serves staff-only business data and must never be reachable by
    // a freelancer account, regardless of what any individual route checks.
    if (isFreelancer && isApiPage && !isPortalApiPage && !isAuthApiPage) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Freelancer on login page or main app → portal
    if (isFreelancer && !isPortalPage && !isApiPage && !isCallbackPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/portal'
      return NextResponse.redirect(url)
    }

    // Logged-in non-freelancer on login page → dashboard
    // (Supabase "disable signups" ensures only pre-created users reach here)
    if (!isFreelancer && isLoginPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
