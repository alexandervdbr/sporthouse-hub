'use client'

import Link from 'next/link'
import { Star, ArrowRight } from 'lucide-react'
import { useFavorites } from '@/contexts/FavoritesContext'
import { getAvailableTools, type ToolPermissions } from '@/lib/client-tools'
import ToolFavoriteToggle from '@/components/clients/ToolFavoriteToggle'
import { ClientCard, type ClientWithDocs } from '@/components/dashboard/ClientCard'

function FavoriteToolCard({ client, toolId, ...perms }: { client: ClientWithDocs; toolId: string } & ToolPermissions) {
  const tool = getAvailableTools(client, perms).find(t => t.id === toolId)
  if (!tool) return null

  const Icon = tool.icon
  return (
    <Link
      href={tool.href(client.id)}
      className="group relative flex items-center gap-3 p-3.5 rounded-xl transition-all duration-200 overflow-hidden"
      style={{
        background: 'rgba(24,24,24,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${tool.color}20`, border: `1px solid ${tool.color}30` }}
      >
        <Icon size={14} style={{ color: tool.color }} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors truncate leading-tight">
          {tool.label}
        </p>
        <p className="text-[11px] text-zinc-500 truncate">{client.name}</p>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ToolFavoriteToggle clientId={client.id} tool={tool.id} label={tool.label} />
        <ArrowRight size={12} className="text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  )
}

// Sits between the dashboard header and the stat-card row so favorites are
// the first thing visible. Renders nothing at all if there are no favorites
// (same empty-hiding convention as the category Sections below it).
export default function DashboardFavorites({
  clients, isAdmin, canSeeWelkom, canSeeFinancien, canSeeAdministratie,
}: {
  clients: ClientWithDocs[]
  isAdmin: boolean
  canSeeWelkom: boolean
  canSeeFinancien: boolean
  canSeeAdministratie: boolean
}) {
  const { favorites, toolFavorites, loaded } = useFavorites()
  const perms: ToolPermissions = { isAdmin, canSeeWelkom, canSeeFinancien, canSeeAdministratie }

  if (!loaded) return null

  const favoriteClients = clients.filter(c => favorites.has(c.id))

  // A stale favorite (client no longer accessible, or its tool no longer
  // available — e.g. a permission was revoked) simply resolves to nothing
  // and is skipped, rather than showing a broken tile.
  const favoriteTools = Array.from(toolFavorites)
    .map(key => {
      const [clientId, toolId] = key.split(':')
      const client = clients.find(c => c.id === clientId)
      return client ? { client, toolId } : null
    })
    .filter((v): v is { client: ClientWithDocs; toolId: string } => v !== null)

  if (favoriteClients.length === 0 && favoriteTools.length === 0) return null

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <Star size={12} className="text-amber-400/70" fill="currentColor" />
        <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">Favorieten</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
        {favoriteClients.map(client => <ClientCard key={client.id} client={client} />)}
        {favoriteTools.map(({ client, toolId }) => (
          <FavoriteToolCard key={`${client.id}:${toolId}`} client={client} toolId={toolId} {...perms} />
        ))}
      </div>
    </div>
  )
}
