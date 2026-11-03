'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Slepen over de dagen van één rij om een periode te kiezen; loslaten geeft
// (rij, van, tot). Een klik zonder slepen is één dag. Werkt met indexen, niet
// met datums: welke dag bij welke kolom hoort, weet de aanroeper.

export interface GridSelection {
  rowId: string
  from: number
  to: number
}

export function useGridSelection(onSelect: (rowId: string, from: number, to: number) => void) {
  const [selection, setSelection] = useState<GridSelection | null>(null)
  const ref = useRef<GridSelection | null>(null)

  const finish = useCallback(() => {
    const s = ref.current
    ref.current = null
    setSelection(null)
    if (s) onSelect(s.rowId, Math.min(s.from, s.to), Math.max(s.from, s.to))
  }, [onSelect])

  useEffect(() => {
    // Loslaten buiten het raster telt ook; Escape breekt af.
    const up = () => { if (ref.current) finish() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { ref.current = null; setSelection(null) } }
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('keydown', key) }
  }, [finish])

  const start = useCallback((rowId: string, index: number) => {
    ref.current = { rowId, from: index, to: index }
    setSelection(ref.current)
  }, [])

  const extend = useCallback((rowId: string, index: number) => {
    const s = ref.current
    if (!s || s.rowId !== rowId || s.to === index) return
    ref.current = { ...s, to: index }
    setSelection(ref.current)
  }, [])

  const isSelected = useCallback((rowId: string, index: number) => {
    const s = selection
    return !!s && s.rowId === rowId && index >= Math.min(s.from, s.to) && index <= Math.max(s.from, s.to)
  }, [selection])

  return { start, extend, isSelected, selecting: !!selection }
}
