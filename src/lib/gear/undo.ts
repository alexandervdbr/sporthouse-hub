// Ongedaan maken met Ctrl+Z / Cmd+Z: een stapel per sessie (per pagina) van
// ordeningsacties — verplaatsen, volgorde, categorie verwijderen, kit
// opheffen, status. Boekingen komen er nooit op. Elke actie weet zelf hoe ze
// teruggaat en hoe ze opnieuw gaat; de stapel houdt alleen de volgorde bij.

export interface UndoEntry {
  /** Korte omschrijving voor de melding ("Verplaatst naar FX3 A"). */
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export const UNDO_LIMIT = 50

export interface UndoStacks {
  done: UndoEntry[]
  undone: UndoEntry[]
}

export const emptyStacks = (): UndoStacks => ({ done: [], undone: [] })

/** Een nieuwe actie: bovenop de stapel; wat ongedaan was, kan niet meer opnieuw. */
export function pushEntry(s: UndoStacks, e: UndoEntry, limit = UNDO_LIMIT): UndoStacks {
  return { done: [...s.done, e].slice(-limit), undone: [] }
}

/** De laatste actie eraf (om ongedaan te maken), en klaar om opnieuw te doen. */
export function takeUndo(s: UndoStacks): { entry: UndoEntry; next: UndoStacks } | null {
  const entry = s.done[s.done.length - 1]
  if (!entry) return null
  return { entry, next: { done: s.done.slice(0, -1), undone: [...s.undone, entry] } }
}

export function takeRedo(s: UndoStacks): { entry: UndoEntry; next: UndoStacks } | null {
  const entry = s.undone[s.undone.length - 1]
  if (!entry) return null
  return { entry, next: { done: [...s.done, entry], undone: s.undone.slice(0, -1) } }
}

/** Een actie die via de knop in de melding ongedaan gemaakt werd: van "gedaan" naar "ongedaan". */
export function markUndone(s: UndoStacks, e: UndoEntry): UndoStacks {
  if (!s.done.includes(e)) return s
  return { done: s.done.filter(x => x !== e), undone: [...s.undone, e] }
}

/** Mislukt ongedaan maken of opnieuw doen, dan verdwijnt de actie (de toestand is onzeker). */
export function dropEntry(s: UndoStacks, e: UndoEntry): UndoStacks {
  return { done: s.done.filter(x => x !== e), undone: s.undone.filter(x => x !== e) }
}

/**
 * Hoort Ctrl+Z bij ons? Niet in een tekstveld, keuzelijst of bewerkbare
 * tekst (daar is het de eigen undo van de browser), en niet als er een
 * venster open staat.
 */
export function isUndoShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const k = e.key.toLowerCase()
  if (k === 'z') return (e as { shiftKey?: boolean }).shiftKey ? 'redo' : 'undo'
  return null
}

export function isTextTarget(t: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!t) return false
  const tag = (t.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable
}
