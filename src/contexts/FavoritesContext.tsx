'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface FavoritesState {
  favorites: Set<string>
  isFavorite: (clientId: string) => boolean
  toggleFavorite: (clientId: string) => void
  loaded: boolean
}

const FavoritesContext = createContext<FavoritesState | null>(null)

// Shared by the sidebar and the star on the client header, so pinning from
// either place updates both immediately without a refetch or a page refresh.
//
// Rows are read and written straight from the browser client: client_favorites
// is protected by RLS on auth.uid(), so a user can only ever see or change
// their own. That saves an API route on both sides.
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const userIdRef = useRef<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoaded(true); return }
      userIdRef.current = user.id

      const { data, error } = await supabase
        .from('client_favorites')
        .select('client_id')

      if (cancelled) return
      // A missing table (migration not run yet) must not break the sidebar —
      // it just means nobody has favourites.
      if (!error && data) setFavorites(new Set(data.map(r => r.client_id as string)))
      setLoaded(true)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isFavorite = useCallback((clientId: string) => favorites.has(clientId), [favorites])

  const toggleFavorite = useCallback((clientId: string) => {
    const userId = userIdRef.current
    if (!userId) return

    const wasFavorite = favorites.has(clientId)

    // Optimistic: a pin should feel instant, so flip first and reconcile after.
    setFavorites(prev => {
      const next = new Set(prev)
      if (wasFavorite) next.delete(clientId); else next.add(clientId)
      return next
    })

    const write = wasFavorite
      ? supabase.from('client_favorites').delete().eq('client_id', clientId).eq('user_id', userId)
      : supabase.from('client_favorites').insert({ client_id: clientId, user_id: userId })

    write.then(({ error }) => {
      if (!error) return
      console.error('Favoriet opslaan mislukt:', error)
      // Put it back the way it was rather than leaving a pin that didn't save.
      setFavorites(prev => {
        const next = new Set(prev)
        if (wasFavorite) next.add(clientId); else next.delete(clientId)
        return next
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites])

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite, loaded }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider')
  return ctx
}
