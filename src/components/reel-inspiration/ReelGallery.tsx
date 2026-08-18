'use client'

import { useState } from 'react'
import { ExternalLink, Clock, AlertCircle } from 'lucide-react'
import { ReelInspiration } from '@/types/database'
import { REEL_CATEGORIES } from '@/lib/reel-categories'

function ReelCard({ reel }: { reel: ReelInspiration }) {
  return (
    <a
      href={reel.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl overflow-hidden transition-colors"
      style={{ background: 'rgba(24,24,24,0.97)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <div className="relative aspect-square bg-zinc-900">
        {reel.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reel.thumbnail_url}
            alt={reel.caption ?? 'Instagram reel'}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
            Geen thumbnail
          </div>
        )}
        <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink size={13} className="text-white" />
        </div>
        {reel.status === 'pending' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/70 text-[11px] text-zinc-300">
            <Clock size={11} className="animate-pulse" /> Classificeren…
          </div>
        )}
        {reel.status === 'error' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-950/80 text-[11px] text-red-300">
            <AlertCircle size={11} /> Fout
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {reel.caption && (
          <p className="text-xs text-zinc-300 line-clamp-2 leading-snug">{reel.caption}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-500 truncate">
            {reel.author ? `@${reel.author}` : 'Onbekend account'}
          </span>
          <span className="text-[11px] text-zinc-600 flex-shrink-0">
            {new Date(reel.saved_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        {reel.category && (
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-zinc-300">
              {reel.category}
            </span>
            {reel.tags.slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] text-zinc-500" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  )
}

export default function ReelGallery({ reels }: { reels: ReelInspiration[] }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categoriesInUse = REEL_CATEGORIES.filter(c => reels.some(r => r.category === c))
  const filtered = activeCategory ? reels.filter(r => r.category === activeCategory) : reels

  if (reels.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nog geen reels bewaard. Deel een Instagram Reel via de snelkoppeling om hem hier te zien verschijnen.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {categoriesInUse.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: activeCategory === null ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: activeCategory === null ? '#fff' : '#a1a1aa',
            }}
          >
            Alles ({reels.length})
          </button>
          {categoriesInUse.map(category => {
            const count = reels.filter(r => r.category === category).length
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: activeCategory === category ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: activeCategory === category ? '#fff' : '#a1a1aa',
                }}
              >
                {category} ({count})
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(reel => (
          <ReelCard key={reel.id} reel={reel} />
        ))}
      </div>
    </div>
  )
}
