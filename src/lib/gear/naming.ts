// Identieke voorwerpen krijgen een nummer per model: "Sony batterij #1",
// "#2", … Het nummer loopt verder over alle kits heen en wordt fysiek op
// het voorwerp geplakt.

export interface NumberingPlan {
  /** Nieuwe namen met hun nummer. */
  names: { name: string; number: string | null }[]
  /** Een bestaand item heet nog kaal "Model": dat wordt "Model #1". */
  renameUnnumbered: boolean
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function planNumbering(model: string, existingNames: string[], count: number): NumberingPlan {
  const m = model.trim()
  if (!m || count < 1) return { names: [], renameUnnumbered: false }
  const re = new RegExp(`^${escape(m)} #(\\d+)$`, 'i')
  let max = 0
  for (const n of existingNames) {
    const hit = re.exec(n.trim())
    if (hit) max = Math.max(max, Number(hit[1]))
  }
  const bare = existingNames.some(n => n.trim().toLowerCase() === m.toLowerCase())

  // Eén nieuw voorwerp van een model dat nog niet bestaat: geen nummer.
  if (max === 0 && !bare && count === 1) return { names: [{ name: m, number: null }], renameUnnumbered: false }

  const start = Math.max(max, bare ? 1 : 0) + 1
  return {
    names: Array.from({ length: count }, (_, i) => ({ name: `${m} #${start + i}`, number: `#${start + i}` })),
    renameUnnumbered: bare,
  }
}
