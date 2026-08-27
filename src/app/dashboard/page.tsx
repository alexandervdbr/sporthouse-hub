import { createClient } from '@/lib/supabase/server'
import { Users, Mic2, Building2, FileText } from 'lucide-react'
import { filterClientsForUser } from '@/lib/filter-clients'
import { isAdminUser, hasSection } from '@/lib/auth-permissions'
import DashboardFavorites from '@/components/dashboard/DashboardFavorites'
import { ClientCard, type ClientWithDocs } from '@/components/dashboard/ClientCard'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <div
      className="relative rounded-xl p-5 overflow-hidden"
      style={{
        background: 'rgba(24,24,24,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${color}60 40%, ${color}60 60%, transparent 100%)` }}
      />
      <div
        className="absolute top-0 left-0 w-24 h-24 pointer-events-none"
        style={{ background: `radial-gradient(circle at 0% 0%, ${color}10 0%, transparent 70%)` }}
      />

      <div className="flex items-start justify-between mb-4">
        <p className="section-label">{label}</p>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}12`, border: `1px solid ${color}22` }}
        >
          <Icon size={14} style={{ color }} />
        </div>
      </div>

      <p
        className="text-4xl font-bold tracking-tight leading-none"
        style={{
          fontFamily: 'var(--font-kurdis)',
          background: 'linear-gradient(180deg, #ffffff 30%, #9ca3af 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title, clients, color = '#52525b',
}: {
  title: string
  clients: ClientWithDocs[]
  color?: string
}) {
  if (clients.length === 0) return null
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-[3px] h-4 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">{title}</h2>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${color}12`,
            border: `1px solid ${color}22`,
            color,
          }}
        >
          {clients.length}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
        {clients.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('*, files(count)').order('name'),
    supabase.auth.getUser(),
  ])

  const allRaw = (clients as ClientWithDocs[]) || []
  const all = filterClientsForUser(allRaw, user) as ClientWithDocs[]

  // Same tool-availability inputs as the client's own Tools grid
  // (src/app/clients/[id]/page.tsx) — needed here too so a favorited tool
  // can be re-validated (still available for this client/user) via the
  // shared getAvailableTools().
  const isAdmin = isAdminUser(user)
  const permsObj = user?.app_metadata?.permissions ?? null
  const canSeeWelkom = permsObj === null || hasSection(user, 'welkom_stagiair')
  const canSeeFinancien = hasSection(user, 'financien_bekijken') || hasSection(user, 'financien_beheren')
  const canSeeAdministratie = hasSection(user, 'administratie_bekijken') || hasSection(user, 'administratie_beheren')

  const INTERN_ORDER = ['Sporthouse', 'Friends of Sports']
  const intern   = all
    .filter(c => c.category === 'intern')
    .sort((a, b) => {
      const ai = INTERN_ORDER.indexOf(a.name)
      const bi = INTERN_ORDER.indexOf(b.name)
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  const klanten  = all.filter(c => c.category === 'klant')
  const atleten  = all.filter(c => c.category === 'atleet')
  const podcasts = all.filter(c => c.category === 'podcast')
  const totalDocs = all.reduce((sum, c) => sum + (c.files?.[0]?.count || 0), 0)

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1
          className="text-3xl font-bold tracking-tight mb-1"
          style={{
            fontFamily: 'var(--font-kurdis)',
            background: 'linear-gradient(180deg, #ffffff 30%, #9ca3af 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Dashboard
        </h1>
        <p className="text-sm text-zinc-400">Overzicht van alle klanten, atleten en podcasts</p>
      </div>

      <DashboardFavorites
        clients={all}
        isAdmin={isAdmin}
        canSeeWelkom={canSeeWelkom}
        canSeeFinancien={canSeeFinancien}
        canSeeAdministratie={canSeeAdministratie}
      />

      <div data-tour="stat-cards" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
        <StatCard label="Klanten"    value={klanten.length}  icon={Building2} color="#3A913F" />
        <StatCard label="Atleten"    value={atleten.length}  icon={Users}     color="#3b82f6" />
        <StatCard label="Podcasts"   value={podcasts.length} icon={Mic2}      color="#a855f7" />
        <StatCard label="Documenten" value={totalDocs}       icon={FileText}  color="#f59e0b" />
      </div>

      <div data-tour="client-grid">
        <Section title="Intern"                        clients={intern}   color="#f59e0b" />
        <Section title="Klanten"                      clients={klanten}  color="#3A913F" />
        <Section title="Atleten"                      clients={atleten}  color="#3b82f6" />
        <Section title="Friends Of Sports — Podcasts" clients={podcasts} color="#a855f7" />
      </div>
    </div>
  )
}
