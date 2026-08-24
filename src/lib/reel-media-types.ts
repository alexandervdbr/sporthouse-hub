import type { SupabaseClient } from '@supabase/supabase-js'

// The "what kind of thing is this" grouping — no longer a hardcoded list.
// Permitted staff can add new ones (see /api/reel-media-types), so the
// current set always comes from the DB rather than a fixed TS union.
export async function getReelMediaTypes(client: SupabaseClient): Promise<string[]> {
  const { data } = await client.from('reel_media_types').select('name').order('created_at', { ascending: true })
  return (data ?? []).map(r => r.name)
}

// Trimmed + case-insensitive match against the current list, mapped back to
// the stored casing — the model occasionally drifts on exact casing.
export function normalizeMediaType(value: unknown, validTypes: string[]): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return validTypes.find(t => t.toLowerCase() === trimmed) ?? null
}

export function isReelMediaType(value: unknown, validTypes: string[]): boolean {
  return typeof value === 'string' && validTypes.some(t => t === value)
}
