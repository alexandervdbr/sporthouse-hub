import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

// Only the public pages are meant for crawlers — the homepage, the privacy
// policy and the terms, which Google checks for OAuth verification. Everything
// else sits behind a login anyway. The middleware lets this file through
// without a session (see the matcher in src/middleware.ts).
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/privacy', '/terms', '/login'],
      disallow: '/',
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
