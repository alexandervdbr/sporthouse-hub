import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets, and except three routes that must not
    // pass through here at all.
    //
    // The two download routes stream whole files, and a response that passes
    // through the proxy on its way out can be billed twice for the same
    // bytes — on a 1 GB download, the difference between one gigabyte of
    // transfer and two. Both do their own authentication, their own
    // per-client access check and their own freelancer lockout; see the
    // comment in each.
    //
    // manifest.webmanifest is excluded because the browser fetches a manifest
    // without cookies unless the link tag says otherwise. This middleware
    // then saw an anonymous visitor, answered with a redirect to /login, and
    // the browser tried to parse that HTML as JSON — "Manifest: Line: 1,
    // column: 1, Syntax error" in the console. It carries the app name, the
    // theme colour and the icon, so there is nothing in it to protect.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/files/download|api/sporthouse/documents/download|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
