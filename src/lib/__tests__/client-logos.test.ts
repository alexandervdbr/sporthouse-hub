import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ownLogoPath } from '@/lib/client-logos'

// Alleen logo's uit onze eigen bucket mogen opgeruimd worden — nooit een
// vroeger geplakte link, en nooit iets uit het oude Supabase-project.
describe('ownLogoPath', () => {
  const before = process.env.NEXT_PUBLIC_SUPABASE_URL
  beforeEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://nieuw.supabase.co' })
  afterEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = before })

  it('herkent een logo in de eigen bucket', () => {
    expect(ownLogoPath('https://nieuw.supabase.co/storage/v1/object/public/client-logos/abc.webp')).toBe('abc.webp')
  })

  it('laat andere links en het oude project met rust', () => {
    expect(ownLogoPath('https://oud.supabase.co/storage/v1/object/public/client-logos/abc.webp')).toBeNull()
    expect(ownLogoPath('https://nieuw.supabase.co/storage/v1/object/public/contact-photos/abc.webp')).toBeNull()
    expect(ownLogoPath('https://example.com/logo.png')).toBeNull()
    expect(ownLogoPath(null)).toBeNull()
  })
})
