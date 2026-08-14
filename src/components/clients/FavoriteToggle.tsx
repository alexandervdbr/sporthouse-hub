'use client'

import { Star } from 'lucide-react'
import { useFavorites } from '@/contexts/FavoritesContext'

// Always visible, never hover-only: on a touch screen a hover-revealed control
// can't be reached at all, and this is the main way to pin a client.
export default function FavoriteToggle({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { isFavorite, toggleFavorite, loaded } = useFavorites()
  const active = isFavorite(clientId)

  return (
    <button
      onClick={() => toggleFavorite(clientId)}
      disabled={!loaded}
      aria-pressed={active}
      title={active ? `${clientName} uit favorieten halen` : `${clientName} bij favorieten zetten`}
      aria-label={active ? `${clientName} uit favorieten halen` : `${clientName} bij favorieten zetten`}
      className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40 ${
        active
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
          : 'border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/60'
      }`}
    >
      <Star size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}
