import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/supabase/claims'
import { isFreelancerUser } from '@/lib/auth-permissions'
import { GOOGLE_SITE_VERIFICATION_FILE } from '@/lib/site-url'

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

  // Verified locally against the project's JWKS rather than asked of the Auth
  // server. This runs on every single request — the matcher covers the whole
  // app — so a round trip here was being paid twice per folder click before
  // the routes themselves had even started. See lib/supabase/claims for what
  // that costs in exchange: a revoked session stays valid until its token
  // expires. The checks below are all gates on reading; every route that
  // writes still confirms with getUser().
  const user = await getSessionUser(supabase)

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
  // The public pages: homepage, privacy policy and terms. Must be reachable
  // without signing in — these are the URLs registered on the Google OAuth
  // consent screen (and /privacy also in Meta App Review), and Google's
  // verification rejects a homepage that sits behind a login.
  const isHomePage = pathname === '/'
  const isLegalPage =
    pathname === '/privacy' || pathname.startsWith('/privacy/') ||
    pathname === '/terms' || pathname.startsWith('/terms/')
  // The Search Console ownership file. The matcher in src/middleware.ts
  // already keeps it away from here; this is the second line of defence.
  const isSiteVerificationFile = pathname === `/${GOOGLE_SITE_VERIFICATION_FILE}`
  const isPublicPage = isHomePage || isLegalPage || isSiteVerificationFile
  // Also public, and on purpose: the link-preview bots of WhatsApp, Slack and
  // Discord never sign in, so a shared link's card can only say what it opens
  // if this page answers them. It carries one folder or file name and the
  // client it belongs to, nothing more — see src/app/share/page.tsx.
  const isSharePage = pathname.startsWith('/share') || pathname.startsWith('/s/')
  // Persoonlijke planningslink voor weekendstudenten, die geen account hebben.
  // Anders dan /s/ is het token hier wél de sleutel: de route controleert hem
  // zelf en leidt eruit af om wiens rij het gaat. Zie
  // supabase/migrations/0052_planning_links.sql.
  const isPlanningLinkPage = pathname.startsWith('/p/') || pathname.startsWith('/api/planning/mine')
  // De dagelijkse herinneringen van de materiaalplanner: aangeroepen door een
  // Apps Script-trigger zonder login; de route controleert zelf het gedeelde geheim.
  const isMaterialMailPage = pathname === '/api/materiaal/mail/due'

  // Unauthenticated → login (API routes get a 401 instead of a redirect)
  if (!user && !isLoginPage && !isCallbackPage && !isSaveReelApiPage && !isPublicPage && !isSharePage && !isPlanningLinkPage && !isMaterialMailPage) {
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
    const isFreelancer = isFreelancerUser(user)

    // Freelancers only get /api/portal/* and /api/auth/* — every other API
    // route serves staff-only business data and must never be reachable by
    // a freelancer account, regardless of what any individual route checks.
    if (isFreelancer && isApiPage && !isPortalApiPage && !isAuthApiPage && !isPlanningLinkPage) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Freelancer on login page or main app → portal (the policy pages stay readable)
    if (isFreelancer && !isPortalPage && !isApiPage && !isCallbackPage && !isPlanningLinkPage && !isLegalPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/portal'
      return NextResponse.redirect(url)
    }

    // Logged-in non-freelancer on login page → dashboard
    // (Supabase "disable signups" ensures only pre-created users reach here)
    // Same for the public homepage: staff open the app on / out of habit, and
    // it used to redirect them straight to the dashboard.
    if (!isFreelancer && (isLoginPage || isHomePage)) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
