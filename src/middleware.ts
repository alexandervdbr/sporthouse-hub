import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { isLegacyEquipmentWrite, LEGACY_CLOSED_TEXT } from '@/lib/legacy-equipment'

export async function middleware(request: NextRequest) {
  // De oude materiaalplanner neemt geen wijzigingen meer aan (zie src/lib/legacy-equipment.ts).
  if (isLegacyEquipmentWrite(request.method, request.nextUrl.pathname)) {
    return new NextResponse(LEGACY_CLOSED_TEXT, { status: 410 })
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets, and except four routes that must not
    // pass through here at all.
    //
    // The three download routes stream whole files, and a response that passes
    // through the proxy on its way out can be billed twice for the same
    // bytes — on a 1 GB download, the difference between one gigabyte of
    // transfer and two. All three do their own authentication, their own
    // access check and their own freelancer lockout; see the comment in each.
    //
    // manifest.webmanifest is excluded because the browser fetches a manifest
    // without cookies unless the link tag says otherwise. This middleware
    // then saw an anonymous visitor, answered with a redirect to /login, and
    // the browser tried to parse that HTML as JSON — "Manifest: Line: 1,
    // column: 1, Syntax error" in the console. It carries the app name, the
    // theme colour and the icon, so there is nothing in it to protect.
    //
    // robots.txt and sitemap.xml are for crawlers, which never sign in — Google's
    // OAuth verification reads them. The font files in public/fonts are excluded
    // for the same reason as images: the public homepage, /privacy and /terms
    // need them for anonymous visitors, and without this they were answered
    // with a redirect to /login.
    //
    // google3bff64dd6bd354bb.html is the Google Search Console ownership file
    // (public/). Google fetches it without signing in and must get the file
    // itself, not a redirect. Exact name only — no other .html is excluded.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|google3bff64dd6bd354bb\\.html$|api/files/download|api/sporthouse/documents/download|api/preassist/download|.*\\.(?:svg|png|jpg|jpeg|gif|webp|otf|ttf|woff|woff2)$).*)',
  ],
}
