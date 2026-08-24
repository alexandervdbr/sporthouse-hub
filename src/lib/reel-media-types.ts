// Fixed "what kind of thing is this" grouping — the only fixed classification
// axis (everything else is free-form tags). Meant to be the primary sort
// when brainstorming ("we need video ideas" vs "we need static visual
// ideas"). Kept editable via a one-line array edit, not a DB enum.
export const REEL_MEDIA_TYPES = ['Video', 'Motion', 'Grafisch', 'Foto'] as const

export type ReelMediaType = typeof REEL_MEDIA_TYPES[number]

export function isReelMediaType(value: unknown): value is ReelMediaType {
  return typeof value === 'string' && (REEL_MEDIA_TYPES as readonly string[]).includes(value)
}
