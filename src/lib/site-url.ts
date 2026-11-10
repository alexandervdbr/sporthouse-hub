import { headers } from 'next/headers'

/**
 * The public origin of the site, without a trailing slash: NEXT_PUBLIC_SITE_URL
 * when it is set, otherwise the host the request came in on.
 */
export async function siteUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (env) return env
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
