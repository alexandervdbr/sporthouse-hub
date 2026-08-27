'use client'

import { Star } from 'lucide-react'
import { useFavorites } from '@/contexts/FavoritesContext'

// Sits inside a tool card that's itself a <Link> (the client's Tools grid,
// and the dashboard's favorited-tools tile) — preventDefault + stopPropagation
// so starring a tool doesn't also navigate into it.
export default function ToolFavoriteToggle({ clientId, tool, label }: { clientId: string; tool: string; label: string }) {
  const { isToolFavorite, toggleToolFavorite, loaded } = useFavorites()
  const active = isToolFavorite(clientId, tool)

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleToolFavorite(clientId, tool)
      }}
      disabled={!loaded}
      aria-pressed={active}
      title={active ? `${label} uit favorieten halen` : `${label} bij favorieten zetten`}
      aria-label={active ? `${label} uit favorieten halen` : `${label} bij favorieten zetten`}
      className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40 ${
        active
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
          : 'border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/60'
      }`}
    >
      <Star size={12} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}
