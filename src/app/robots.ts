import type { MetadataRoute } from 'next'
import { SITE_URL, GOOGLE_SITE_VERIFICATION_FILE } from '@/lib/site-url'

// Only the public pages are meant for crawlers — the homepage, the privacy
// policy and the terms, which Google checks for OAuth verification — plus the
// Search Console verification file. Everything else sits behind a login
// anyway. The middleware lets this file through without a session (see the
// matcher in src/middleware.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/privacy', '/terms', '/login', `/${GOOGLE_SITE_VERIFICATION_FILE}`],
      disallow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
