// The public address of Sporthouse Hub. This is the domain registered with
// Google (Search Console and the OAuth consent screen), so canonical links,
// robots.txt and the sitemap always point here — also on preview deployments,
// which should never present themselves as the real site.
//
// NEXT_PUBLIC_SITE_URL overrides it, for the day the platform moves domains.
export const PRODUCTION_URL = 'https://sporthouse-hub-ten.vercel.app'

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_URL).replace(/\/$/, '')

/** The Google Search Console HTML verification file in public/. */
export const GOOGLE_SITE_VERIFICATION_FILE = 'google3bff64dd6bd354bb.html'
