// Fixed category list for reel inspiration — placeholder set, meant to be
// edited to match how content is actually organized before shipping. Kept
// simple like `clients.category` rather than a DB enum, so changing it is a
// one-line edit. Anything the fixed list doesn't capture goes in `tags`
// instead, which is open-ended.
export const REEL_CATEGORIES = [
  'Interview',
  'Behind the scenes',
  'Wedstrijdmoment',
  'Community & fans',
  'Sfeerbeeld',
  'Grafisch / design',
  'Format-idee',
  'Overig',
] as const

export type ReelCategory = typeof REEL_CATEGORIES[number]

export function isReelCategory(value: unknown): value is ReelCategory {
  return typeof value === 'string' && (REEL_CATEGORIES as readonly string[]).includes(value)
}
