import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets — and except the two routes that stream
    // whole files. A response that passes through the proxy on its way out can
    // be billed twice for the same bytes, which on a 1 GB download is the
    // difference between one gigabyte of transfer and two. Those routes do
    // their own authentication, their own per-client access check, and their
    // own freelancer lockout; see the comment in each.
    '/((?!_next/static|_next/image|favicon.ico|api/files/download|api/sporthouse/documents/download|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
