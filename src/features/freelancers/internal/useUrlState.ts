'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Filters, zoekterm, tabblad en de geopende opdracht staan in de URL: de
// terugknop en een gedeelde link werken dan zoals verwacht. Een nieuw
// tabblad of een geopende opdracht is een stap terug (push); typen in het
// zoekveld of een filter wijzigen vervangt de huidige stap (replace).
export function useUrlState() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const set = useCallback((patch: Record<string, string | null>, mode: 'push' | 'replace' = 'replace') => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    const qs = next.toString()
    router[mode](`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [params, pathname, router])
  return { params, set }
}
