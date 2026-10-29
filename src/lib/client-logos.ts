import type { SupabaseClient } from '@supabase/supabase-js'

// Geüploade klantlogo's staan in een publieke bucket (migratie 0067); de
// publieke URL gaat in clients.logo_url, en getLogo() in src/lib/logos.ts
// geeft die voorrang op de vaste lijst in de code.
export const CLIENT_LOGO_BUCKET = 'client-logos'
export const CLIENT_LOGO_MAX_BYTES = 1024 * 1024
export const CLIENT_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// Het pad binnen onze eigen bucket, of null als de URL ergens anders naartoe
// wijst (een vroeger geplakte link, of het oude Supabase-project) — die laten
// we dan met rust.
export function ownLogoPath(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${CLIENT_LOGO_BUCKET}/`
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base || !url.startsWith(base) || !url.includes(marker)) return null
  return decodeURIComponent(url.slice(url.indexOf(marker) + marker.length))
}

// Best effort: een achtergebleven logo kost alleen een paar kB.
export async function removeOwnLogo(admin: SupabaseClient, url: string | null | undefined) {
  const path = ownLogoPath(url)
  if (!path) return
  try { await admin.storage.from(CLIENT_LOGO_BUCKET).remove([path]) } catch { /* zie hierboven */ }
}
