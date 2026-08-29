import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { isAdminUser } from '@/lib/auth-permissions'
import { getAvailableTools } from '@/lib/client-tools'
import ToolFavoriteToggle from '@/components/clients/ToolFavoriteToggle'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientToolsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

  const permsObj = user?.app_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const isAdmin = isAdminUser(user)
  const canSeeWelkom = isAdmin || permsObj === null || sections.includes('welkom_stagiair')
  const canSeeFinancien = isAdmin || sections.includes('financien_bekijken') || sections.includes('financien_beheren')
  const canSeeAdministratie = isAdmin || sections.includes('administratie_bekijken') || sections.includes('administratie_beheren')

  const available = getAvailableTools(client, { isAdmin, canSeeWelkom, canSeeFinancien, canSeeAdministratie })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <div data-tour="tools-header" className="mb-8">
          <h2 className="text-base font-semibold text-white mb-1">Tools</h2>
          <p className="text-sm text-zinc-300">Kies een tool om te openen voor {client.name}.</p>
        </div>

        {/* Available tools */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {available.map((tool) => {
            const Icon = tool.icon
            return (
              <Link
                key={tool.id}
                href={tool.href(id)}
                data-tour={`tool-${tool.id}`}
                className="group flex flex-col gap-4 p-5 rounded-xl tool-card"
                style={{
                  '--tool-color': tool.color,
                  background: 'rgba(26,26,26,0.97)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                } as React.CSSProperties}
              >
                <div className="flex items-start justify-between">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${tool.color}20`, border: `1px solid ${tool.color}30` }}
                  >
                    <Icon size={18} style={{ color: tool.color }} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <ToolFavoriteToggle clientId={id} tool={tool.id} label={tool.label} />
                    <ArrowRight
                      size={14}
                      className="text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{tool.label}</p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{tool.description}</p>
                </div>
              </Link>
            )
          })}

          {/* Coming soon placeholder */}
          <div className="flex flex-col gap-4 p-5 bg-zinc-900/40 border border-zinc-800/50 rounded-xl opacity-50">
            <div className="w-10 h-10 rounded-xl bg-zinc-800/50 border border-zinc-700/30" />
            <div>
              <p className="text-sm font-semibold text-zinc-500">Binnenkort</p>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">Nieuwe tools worden hier toegevoegd.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
