import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { LEGAL } from '@/lib/legal'
import { GOOGLE_SITE_VERIFICATION_FILE, SITE_URL } from '@/lib/site-url'

// The public pages are what Google reviews for OAuth verification. A field
// left empty in src/lib/legal.ts shows up there as "[To be completed: …]" —
// this keeps that from ever reaching production.
describe('public legal pages', () => {
  it.each(Object.entries(LEGAL))('legal.ts: %s is filled in', (_key, value) => {
    expect(value).not.toBeNull()
    expect(String(value).trim()).not.toBe('')
  })

  it('pages contain no hand-written placeholders', () => {
    for (const page of ['src/app/page.tsx', 'src/app/privacy/page.tsx', 'src/app/terms/page.tsx']) {
      const src = readFileSync(resolve(__dirname, '../../..', page), 'utf8')
      expect(src, page).not.toMatch(/<Missing>|To be completed|TODO|TBD|lorem/i)
    }
  })

  it('points at the production domain', () => {
    expect(SITE_URL).toBe('https://sporthouse-hub-ten.vercel.app')
  })
})

// Google Search Console checks this file byte for byte. It must stay in
// public/ under its exact name, with exactly the content Google issued.
describe('Google Search Console verification file', () => {
  it('is in public/ with the content Google issued', () => {
    const body = readFileSync(resolve(__dirname, '../../../public', GOOGLE_SITE_VERIFICATION_FILE), 'utf8')
    expect(body).toBe('google-site-verification: google3bff64dd6bd354bb.html')
  })
})
