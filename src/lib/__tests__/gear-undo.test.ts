import { describe, it, expect } from 'vitest'
import { dropEntry, emptyStacks, isTextTarget, isUndoShortcut, markUndone, pushEntry, takeRedo, takeUndo, type UndoEntry } from '@/lib/gear/undo'

const entry = (label: string): UndoEntry => ({ label, undo: async () => {}, redo: async () => {} })
const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

describe('undo-stapel', () => {
  it('maakt de laatste actie eerst ongedaan, en zo verder terug', () => {
    let s = pushEntry(pushEntry(emptyStacks(), entry('a')), entry('b'))
    const first = takeUndo(s)!; s = first.next
    const second = takeUndo(s)!; s = second.next
    expect([first.entry.label, second.entry.label]).toEqual(['b', 'a'])
    expect(takeUndo(s)).toBeNull()
  })
  it('opnieuw doen in omgekeerde volgorde van ongedaan maken', () => {
    let s = pushEntry(pushEntry(emptyStacks(), entry('a')), entry('b'))
    s = takeUndo(s)!.next; s = takeUndo(s)!.next
    const r = takeRedo(s)!
    expect(r.entry.label).toBe('a')
    expect(r.next.done.map(e => e.label)).toEqual(['a'])
  })
  it('een nieuwe actie wist wat opnieuw gedaan kon worden', () => {
    let s = pushEntry(emptyStacks(), entry('a'))
    s = takeUndo(s)!.next
    s = pushEntry(s, entry('c'))
    expect(takeRedo(s)).toBeNull()
  })
  it('ongedaan via de melding: die actie gaat naar "ongedaan", de rest blijft', () => {
    const a = entry('a'), b = entry('b')
    const s = markUndone(pushEntry(pushEntry(emptyStacks(), a), b), a)
    expect(s.done).toEqual([b])
    expect(s.undone).toEqual([a])
  })
  it('een mislukte actie verdwijnt van de stapel', () => {
    const a = entry('a')
    expect(dropEntry(pushEntry(emptyStacks(), a), a)).toEqual(emptyStacks())
  })
  it('houdt hooguit de laatste N acties', () => {
    let s = emptyStacks()
    for (let i = 0; i < 5; i++) s = pushEntry(s, entry(String(i)), 3)
    expect(s.done.map(e => e.label)).toEqual(['2', '3', '4'])
  })
})

describe('sneltoets', () => {
  it('Ctrl+Z en Cmd+Z: ongedaan; met Shift: opnieuw', () => {
    expect(isUndoShortcut(key('z', { ctrlKey: true }))).toBe('undo')
    expect(isUndoShortcut(key('z', { metaKey: true }))).toBe('undo')
    expect(isUndoShortcut(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo')
  })
  it('zonder Ctrl/Cmd, met Alt, of een andere toets: niets', () => {
    expect(isUndoShortcut(key('z'))).toBeNull()
    expect(isUndoShortcut(key('z', { ctrlKey: true, altKey: true }))).toBeNull()
    expect(isUndoShortcut(key('y', { ctrlKey: true }))).toBeNull()
  })
  it('in tekstvelden en bewerkbare tekst blijft het de undo van de browser', () => {
    expect(isTextTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTextTarget({ tagName: 'textarea' })).toBe(true)
    expect(isTextTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTextTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTextTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextTarget(null)).toBe(false)
  })
})
