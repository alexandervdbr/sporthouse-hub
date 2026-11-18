import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/supabase/claims'
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
  const isApiPage    = pathname.startsWith('/api')
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
    // Remember where they were headed, so signing in lands them back there —
    // a home-screen shortcut on iPhone has its own cookies, separate from
    // Safari, so its first open always comes through here. /login and
    // /auth/callback already carry `next` through Google; the callback's
    // safeNext() rejects anything that isn't a plain same-site path.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // Signed in, on the login page or the public homepage → dashboard.
  // (Supabase "disable signups" ensures only pre-created users reach here.)
  // Staff open the app on / out of habit; it always took them straight in.
  // Freelancers have no accounts (docs/freelancers-overzicht.md), so there is
  // no second destination any more.
  if (user && (isLoginPage || isHomePage)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
