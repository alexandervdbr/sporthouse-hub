import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { CalendarDays, ArrowRight } from 'lucide-react'
import { getLogo } from '@/lib/logos'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

const PLATFORMS: Record<string, { label: string; color: string }> = {
  facebook:  { label: 'FB', color: '#1877F2' },
  instagram: { label: 'IG', color: '#E1306C' },
  twitter:   { label: 'X',  color: '#1D9BF0' },
  tiktok:    { label: 'TT', color: '#69C9D0' },
  youtube:   { label: 'YT', color: '#FF4444' },
}

const STATUSES: Record<string, { label: string; color: string }> = {
  to_shoot:     { label: 'To shoot',     color: '#f59e0b' },
  in_productie: { label: 'In productie', color: '#3b82f6' },
  afgewerkt:    { label: 'Afgewerkt',    color: '#22c55e' },
}

function formatDutchDate(dateStr: string): string {
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const d = new Date(dateStr)
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function getPostColor(platform: string | null, status: string): string {
  const firstPlatform = platform?.split(',')[0]
  if (firstPlatform && PLATFORMS[firstPlatform]) return PLATFORMS[firstPlatform].color
  return STATUSES[status]?.color ?? '#71717a'
}

export const metadata = { title: 'Content Kalender — Sporthouse' }

export default async function CalendarOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permsObj = user.user_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const allowedClientIds: string[] | null = (!isAdmin && permsObj?.clients?.length > 0) ? permsObj.clients : null

  // Fetch all relevant clients
  let clientQuery = supabase
    .from('clients')
    .select('id, name, category, logo_url, color')
    .in('category', ['klant', 'atleet', 'podcast', 'intern'])
    .order('name')

  if (allowedClientIds) clientQuery = clientQuery.in('id', allowedClientIds)
  const { data: allClients } = await clientQuery

  const clients = allClients ?? []
  const clientIds = clients.map(c => c.id)

  // Date range: today → 30 days ahead
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)
  const in30 = new Date(today)
  in30.setDate(today.getDate() + 30)
  const in30Str = in30.toISOString().slice(0, 10)

  // This week (Mon–Sun)
  const weekStart = new Date(today)
  const dow = today.getDay()
  weekStart.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekEndStr   = weekEnd.toISOString().slice(0, 10)

  // Fetch upcoming posts (next 30 days)
  const { data: upcomingPosts } = clientIds.length > 0
    ? await supabase
        .from('content_posts')
        .select('id, client_id, title, platform, status, scheduled_date, scheduled_time, format')
        .in('client_id', clientIds)
        .gte('scheduled_date', todayStr)
        .lte('scheduled_date', in30Str)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true })
    : { data: [] }

  const posts = upcomingPosts ?? []

  // This week's posts
  const weekPosts = posts.filter(p => p.scheduled_date >= weekStartStr && p.scheduled_date <= weekEndStr)

  // Map client id → client
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  // Group clients by category
  const byCategory: Record<string, typeof clients> = { klant: [], atleet: [], podcast: [], intern: [] }
  for (const c of clients) {
    if (byCategory[c.category]) byCategory[c.category].push(c)
  }

  const groups = [
    { key: 'klant',   label: 'Klanten'  },
    { key: 'atleet',  label: 'Atleten'  },
    { key: 'podcast', label: 'Podcasts' },
    { key: 'intern',  label: 'Intern'   },
  ].filter(g => byCategory[g.key].length > 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-base font-semibold text-white mb-1">Content Kalender</h2>
          <p className="text-sm text-zinc-500">Overzicht van alle geplande content per klant, atleet en podcast.</p>
        </div>

        {/* This week */}
        {weekPosts.length > 0 && (
          <div className="mb-8">
            <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">Deze week</h3>
            <div className="flex flex-col gap-2">
              {weekPosts.slice(0, 8).map(post => {
                const client    = clientMap[post.client_id]
                const color     = getPostColor(post.platform, post.status)
                const platforms = post.platform?.split(',').filter(Boolean) ?? []
                const sts       = STATUSES[post.status]
                const logo      = client ? getLogo(client.name, client.logo_url) : null
                return (
                  <Link key={post.id} href={`/clients/${post.client_id}/calendar`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/20 hover:bg-zinc-900/50 transition-all group">
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <div className="w-5 h-5 shrink-0">
                      {logo ? (
                        <Image src={logo} alt={client?.name ?? ''} width={20} height={20} className="rounded object-cover w-5 h-5" />
                      ) : (
                        <div className="w-5 h-5 rounded bg-zinc-800" />
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-500 shrink-0 w-10">{formatDutchDate(post.scheduled_date)}</span>
                    {post.scheduled_time && <span className="text-[11px] text-zinc-600 shrink-0">{post.scheduled_time.slice(0, 5)}</span>}
                    {platforms.length > 0 && (
                      <div className="flex gap-1 shrink-0">
                        {platforms.map((pid: string) => PLATFORMS[pid] ? (
                          <span key={pid} className="text-[10px] font-bold" style={{ color: PLATFORMS[pid].color }}>{PLATFORMS[pid].label}</span>
                        ) : null)}
                      </div>
                    )}
                    <span className="text-sm text-zinc-300 truncate flex-1">{post.title}</span>
                    {client && <span className="text-[11px] text-zinc-600 shrink-0 hidden sm:block">{client.name}</span>}
                    {sts && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${sts.color}20`, color: sts.color }}>
                        {sts.label}
                      </span>
                    )}
                  </Link>
                )
              })}
              {weekPosts.length > 8 && (
                <p className="text-xs text-zinc-600 px-1">+{weekPosts.length - 8} meer posts deze week</p>
              )}
            </div>
          </div>
        )}

        {/* Client groups */}
        {groups.map(({ key, label }) => {
          const groupClients = byCategory[key]
          return (
            <div key={key} className="mb-8">
              <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">{label}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupClients.map(client => {
                  const clientPosts  = posts.filter(p => p.client_id === client.id)
                  const weekClientPosts = clientPosts.filter(p => p.scheduled_date >= weekStartStr && p.scheduled_date <= weekEndStr)
                  const next         = clientPosts[0]
                  const logo         = getLogo(client.name, client.logo_url)
                  return (
                    <Link key={client.id} href={`/clients/${client.id}/calendar`}
                      className="group flex flex-col gap-3 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/20 hover:bg-zinc-900/40 transition-all">
                      {/* Client header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {logo ? (
                            <Image src={logo} alt={client.name} width={22} height={22} className="rounded object-cover w-5 h-5 flex-shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: client.color ?? '#3f3f46' }} />
                          )}
                          <span className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors truncate">{client.name}</span>
                        </div>
                        <ArrowRight size={13} className="text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays size={11} className="text-zinc-600" />
                          <span className="text-[11px] text-zinc-500">
                            <span className="text-zinc-300 font-medium">{weekClientPosts.length}</span> deze week
                          </span>
                        </div>
                        <div className="w-px h-3 bg-zinc-800" />
                        <span className="text-[11px] text-zinc-500">
                          <span className="text-zinc-300 font-medium">{clientPosts.length}</span> komende 30 dagen
                        </span>
                      </div>

                      {/* Next post preview */}
                      {next ? (
                        <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                          <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: getPostColor(next.platform, next.status) }} />
                          <span className="text-[10px] text-zinc-600 shrink-0">{formatDutchDate(next.scheduled_date)}</span>
                          <span className="text-[11px] text-zinc-500 truncate">{next.title}</span>
                        </div>
                      ) : (
                        <div className="pt-1 border-t border-zinc-800/60">
                          <span className="text-[11px] text-zinc-700">Geen posts gepland</span>
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}

        {clients.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-zinc-600">Geen klanten gevonden.</p>
          </div>
        )}
      </div>
    </div>
  )
}
