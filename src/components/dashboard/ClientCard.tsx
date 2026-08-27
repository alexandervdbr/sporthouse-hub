import Link from 'next/link'
import Image from 'next/image'
import { Client } from '@/types/database'
import { ArrowRight } from 'lucide-react'
import { getLogo } from '@/lib/logos'

// Lives in its own file (no server-only imports) so it can be shared by the
// dashboard's Server Component sections and DashboardFavorites (a Client
// Component) alike — importing it from the page file directly would pull
// that page's server-only Supabase client into the client bundle.
export type ClientWithDocs = Client & { files: [{ count: number }] }

export function ClientCard({ client }: { client: ClientWithDocs }) {
  const logo  = getLogo(client.name, client.logo_url)
  const color = client.color || '#52525b'

  return (
    <Link
      href={`/clients/${client.id}`}
      data-tour="client-card"
      className="group relative flex items-center gap-3 p-3.5 rounded-xl transition-all duration-200 overflow-hidden"
      style={{
        background: 'rgba(24,24,24,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }}
    >
      {/* Top shine */}
      <div
        className="absolute top-0 left-[15%] right-[15%] h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)' }}
      />

      {/* Hover color glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${color}14 0%, transparent 70%)` }}
      />

      {/* Left color accent bar */}
      <div
        className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: color }}
      />

      {/* Logo or fallback */}
      {logo ? (
        <Image
          src={logo}
          alt={client.name}
          width={28}
          height={28}
          className="rounded-lg object-cover flex-shrink-0 relative"
          style={{ width: 28, height: 28 }}
        />
      ) : (
        <div
          className="w-7 h-7 rounded-lg flex-shrink-0 relative"
          style={{ backgroundColor: `${color}20`, border: `1px solid ${color}30` }}
        />
      )}

      <span className="relative text-sm font-medium text-zinc-200 group-hover:text-white transition-colors truncate flex-1 leading-tight">
        {client.name}
      </span>

      <ArrowRight
        size={12}
        className="text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 relative"
      />
    </Link>
  )
}
