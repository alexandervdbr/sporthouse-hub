'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Client } from '@/types/database'
import { LayoutDashboard, KanbanSquare, CalendarDays, CalendarRange, Users, LogOut, Camera, UserCheck, MessageSquare, ShieldCheck, Sparkles, Lock, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLogo } from '@/lib/logos'
import { usePreview } from '@/lib/preview-context'

interface SidebarProps {
  clients: Client[]
}

function NavGroup({ title, clients, pathname }: {
  title: string
  clients: Client[]
  pathname: string
}) {
  if (clients.length === 0) return null
  return (
    <div className="mb-5">
      <p className="px-3 mb-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
        {title}
      </p>
      {clients.map((client) => {
        const logo = getLogo(client.name, client.logo_url)
        const isActive = pathname.startsWith(`/clients/${client.id}`)
        return (
          <Link
            key={client.id}
            href={`/clients/${client.id}`}
            className={cn(
              'group flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-all duration-150 mb-0.5 relative',
              isActive
                ? 'text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            style={isActive ? { paddingLeft: 10, paddingRight: 12 } : { paddingLeft: 12, paddingRight: 12 }}
          >
            {/* Active indicator bar */}
            {isActive && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                style={{ backgroundColor: '#3A913F' }}
              />
            )}

            {/* Hover + active bg */}
            <span className={cn(
              'absolute inset-0 rounded-lg transition-all duration-150',
              isActive
                ? 'bg-zinc-800/70'
                : 'bg-transparent group-hover:bg-zinc-800/40'
            )} />

            {/* Content */}
            <span className="relative flex items-center gap-2.5 min-w-0">
              {logo ? (
                <Image
                  src={logo}
                  alt={client.name}
                  width={16}
                  height={16}
                  className="rounded object-cover flex-shrink-0"
                  style={{ width: 16, height: 16 }}
                />
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 ml-0.5 transition-all duration-150"
                  style={{ backgroundColor: isActive ? (client.color || '#3A913F') : '#52525b' }}
                />
              )}
              <span className="truncate">{client.name}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

interface Permissions { sections: string[]; clients: string[] }

export default function Sidebar({ clients }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { preview } = usePreview()
  const [realIsAdmin,     setRealIsAdmin]     = useState(false)
  const [realPermissions, setRealPermissions] = useState<Permissions | null>(null)
  const [unreadChat,  setUnreadChat]  = useState(0)
  const userEmailRef = React.useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      userEmailRef.current = user.email ?? null
      const sections: string[] = user.user_metadata?.permissions?.sections ?? []
      const admin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
      setRealIsAdmin(admin)
      if (!admin) setRealPermissions(user.user_metadata?.permissions ?? null)
    })
  }, [])

  // When in preview mode, override permissions with the previewed user's data
  const isAdmin     = preview ? false : realIsAdmin
  const permissions = preview ? preview.permissions : realPermissions

  // Fetch unread count + subscribe to new messages
  useEffect(() => {
    async function fetchUnread() {
      const res = await fetch('/api/chat/unread')
      if (res.ok) {
        const { total } = await res.json()
        setUnreadChat(total)
      }
    }
    fetchUnread()

    const channel = supabase
      .channel('sidebar-chat-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          // Don't count own messages
          if (payload.new && (payload.new as { created_by: string }).created_by === userEmailRef.current) return
          // If currently on chat page and that channel is visible, skip (ChatPage marks it read)
          if (pathname === '/chat') {
            fetchUnread()
          } else {
            setUnreadChat(prev => prev + 1)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [pathname])

  function canSeeSection(key: string) {
    if (isAdmin) return true
    if (!permissions) return true  // no restrictions configured → show everything
    return permissions.sections.includes(key)
  }

  function visibleClients() {
    if (!preview) return clients // already filtered server-side
    // In preview mode (real user is admin, so all clients were passed): filter by preview permissions
    if (!preview.permissions || preview.permissions.clients.length === 0) return clients
    return clients.filter(c => preview.permissions!.clients.includes(c.id))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const allowed = visibleClients()
  const INTERN_ORDER = ['Sporthouse', 'Friends of Sports', 'Shirtlist']
  const intern = allowed
    .filter(c => c.category === 'intern')
    .sort((a, b) => {
      const ai = INTERN_ORDER.indexOf(a.name)
      const bi = INTERN_ORDER.indexOf(b.name)
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  const klanten  = allowed.filter(c => c.category === 'klant')
  const atleten  = allowed.filter(c => c.category === 'atleet')
  const podcasts = allowed.filter(c => c.category === 'podcast')

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: 'linear-gradient(180deg, #181818 0%, #141414 100%)',
        borderRight: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      {/* Brand */}
      <div className="relative px-5 py-5 flex justify-center"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }}
      >
        {/* Subtle green glow behind logo */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <div
            className="w-28 h-10 rounded-full blur-3xl opacity-25"
            style={{ backgroundColor: '#3A913F' }}
          />
        </div>
        <Link href="/dashboard" className="relative">
          <Image
            src="/logo.png"
            alt="Sporthouse"
            width={120}
            height={32}
            className="object-contain opacity-90 hover:opacity-100 transition-opacity duration-200"
            style={{ filter: 'invert(1)' }}
            priority
          />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {/* Main nav items */}
        <div className="mb-5 space-y-0.5">
          {([
            { href: '/dashboard',   icon: LayoutDashboard, label: 'DASHBOARD',      section: 'dashboard',      external: false },
            { href: '/projects',    icon: KanbanSquare,    label: 'Projecten',      section: 'projecten',      external: false },
            { href: '/planning',    icon: CalendarDays,    label: 'Planning',       section: 'planning',       external: false },
            { href: '/events',      icon: CalendarRange,   label: 'Projectkalender', section: 'projectkalender', external: false },
            { href: '/equipment',   icon: Camera,          label: 'Materiaal',      section: 'materiaal',      external: false },
            { href: '/team',        icon: Users,           label: 'Team',           section: 'team',           external: false },
            { href: '/freelancers', icon: UserCheck,       label: 'Freelancers',    section: 'freelancers',    external: false },
            { href: '/chat',        icon: MessageSquare,   label: 'Chat',           section: 'chat',           external: false },
            { href: '/passwords',   icon: Lock,            label: 'Wachtwoorden',    section: 'wachtwoorden_bekijken', external: false },
            { href: '/preassist',   icon: Layers,          label: 'Pré-assist',      section: 'preassist',             external: false },
            { href: 'https://kinopio.club/start-to-kinopio--EeWqKmLYUOfwLTNfwQyS', icon: Sparkles, label: 'Inspiratiebord', section: 'inspiratiebord', external: true },
            { href: 'https://photos.google.com', icon: Camera, label: "Google Photos", section: 'googlephotos', external: true },
            ...(isAdmin ? [{ href: '/admin', icon: ShieldCheck, label: 'Beheer', section: 'admin', external: false }] : []),
          ] as { href: string; icon: React.ElementType; label: string; section: string; external: boolean }[])
          .filter(item => item.section === 'admin' || item.external || canSeeSection(item.section))
          .map(({ href, icon: Icon, label, external }) => {
            const isActive = !external && pathname === href
            const commonClass = "group flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-all duration-150 relative"
            const commonStyle = isActive
              ? { paddingLeft: 10, paddingRight: 12, color: '#e4e4e2', fontWeight: 500 }
              : { paddingLeft: 12, paddingRight: 12, color: '#a1a1aa' }
            const inner = (
              <>
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                    style={{ backgroundColor: '#3A913F' }}
                  />
                )}
                <span className={cn(
                  'absolute inset-0 rounded-lg transition-all duration-150',
                  isActive ? 'bg-zinc-800/70' : 'bg-transparent group-hover:bg-zinc-800/40'
                )} />
                <span className="relative flex items-center gap-2.5">
                  <Icon size={15} />
                  <span>{label}</span>
                  {label === 'Chat' && unreadChat > 0 && (
                    <span
                      className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: '#ef4444', padding: '0 4px' }}
                    >
                      {unreadChat > 99 ? '99+' : unreadChat}
                    </span>
                  )}
                </span>
              </>
            )
            return external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={commonClass}
                style={commonStyle}
              >
                {inner}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                className={commonClass}
                style={commonStyle}
              >
                {inner}
              </Link>
            )
          })}
        </div>

        {/* Divider */}
        <div className="mx-3 mb-5" style={{ borderTop: '1px solid rgba(255,255,255,0.09)' }} />

        <NavGroup title="Intern"         clients={intern}   pathname={pathname} />
        <NavGroup title="Klanten"        clients={klanten}  pathname={pathname} />
        <NavGroup title="Atleten"        clients={atleten}  pathname={pathname} />
        <NavGroup title="FOS — Podcasts" clients={podcasts} pathname={pathname} />
      </nav>

      {/* Bottom actions */}
      <div className="p-3 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.09)' }}>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all duration-150"
        >
          <LogOut size={14} />
          <span>Uitloggen</span>
        </button>
      </div>
    </aside>
  )
}
