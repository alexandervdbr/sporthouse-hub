// Fixed "what kind of thing is this" grouping — separate from `category`
// (which captures the content's purpose/topic). Meant to be the primary
// sort when brainstorming ("we need video ideas" vs "we need static visual
// ideas"). Same one-line-edit philosophy as reel-categories.ts.
export const REEL_MEDIA_TYPES = ['Video', 'Motion', 'Grafisch', 'Foto'] as const

export type ReelMediaType = typeof REEL_MEDIA_TYPES[number]

export function isReelMediaType(value: unknown): value is ReelMediaType {
  return typeof value === 'string' && (REEL_MEDIA_TYPES as readonly string[]).includes(value)
}
