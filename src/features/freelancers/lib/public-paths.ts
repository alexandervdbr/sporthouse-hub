// De ENIGE paden van de freelancerlink die zonder medewerker-login
// bereikbaar zijn. Alles daarbuiten blijft een login vragen.
export function isFreelancerLinkPath(pathname: string): boolean {
  return pathname === '/f' || pathname.startsWith('/f/') || pathname.startsWith('/api/public/f/')
}

// Headers voor die paden: niet indexeren, geen referrer (het token staat in
// de URL-hash, maar zekerheid is goedkoop), niets cachen, en een CSP zonder
// scripts van derden. 'unsafe-eval' alleen in development (React/Next dev).
export function linkSecurityHeaders(dev = process.env.NODE_ENV === 'development'): Record<string, string> {
  const script = `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`
  return {
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': [
      "default-src 'self'", script, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      "font-src 'self' data:", "connect-src 'self' https://www.googleapis.com", "frame-ancestors 'none'",
      "base-uri 'none'", "form-action 'self'",
    ].join('; '),
  }
}
