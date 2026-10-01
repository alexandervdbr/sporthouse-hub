import type { SupabaseClient } from '@supabase/supabase-js'
import type { JWK } from '@supabase/auth-js'

// Everything the permission helpers and routes actually read off a user:
// the address we attribute writes to, and the metadata the roles live in.
// Deliberately narrow, so it's obvious what a claims-based identity has to
// carry and what it can't stand in for.
export interface SessionUser {
  id: string
  email?: string | null
  app_metadata?: {
    permissions?: { sections?: string[]; clients?: string[] }
  } & Record<string, unknown>
}

// Identifies the caller from the session token without a network round trip.
//
// getUser() asks the Auth server on every call. That's one request each in
// the proxy and again in the route it guards, so a single folder click — two
// API calls — spent four of them waiting on Supabase purely to confirm what
// the token already says. getClaims() verifies the signature locally against
// the project's published JWKS (this project signs with ES256, so there's a
// key set to verify against and no fallback round trip).
//
// The trade: a token is believed until it expires, typically an hour. Revoke
// someone's access, or flip them to a freelancer account, and that takes
// effect at their next token refresh rather than instantly. That's why this
// is for reads only — anything that writes, deletes or moves still calls
// getUser(), so the actions where stale access actually costs something are
// still checked against the server.
// The signing keys, kept at module scope on purpose.
//
// supabase-js caches them too, but on the client instance — and this app
// builds a fresh client per request, so that cache is always empty and it
// would fetch the key set every single time. That trades one network call
// for another and wins nothing. Held here, the keys survive for as long as
// the function instance stays warm, and getClaims is handed them directly so
// it never reaches for the network at all.
//
// Keys rotate rarely; an hour of staleness is well inside that. A kid we
// don't recognise falls through to a refetch below.
const JWKS_TTL_MS = 60 * 60 * 1000
let cachedJwks: { keys: JWK[] } | null = null
let cachedAt = 0

async function getJwks(): Promise<{ keys: JWK[] } | null> {
  if (cachedJwks && Date.now() - cachedAt < JWKS_TTL_MS) return cachedJwks

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }
    )
    if (!res.ok) return null
    const body = await res.json()
    if (!Array.isArray(body?.keys) || body.keys.length === 0) return null
    cachedJwks = body
    cachedAt = Date.now()
    return cachedJwks
  } catch {
    // Without keys getClaims falls back to asking the Auth server, which is
    // slower but still correct — so a failure here costs speed, not access.
    return null
  }
}

export async function getSessionUser(
  supabase: SupabaseClient
): Promise<SessionUser | null> {
  const jwks = await getJwks()
  const { data, error } = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined)
  if (error || !data?.claims) return null

  const claims = data.claims as Record<string, unknown>
  const sub = typeof claims.sub === 'string' ? claims.sub : null
  if (!sub) return null

  return {
    id: sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    app_metadata: (claims.app_metadata ?? {}) as SessionUser['app_metadata'],
  }
}
