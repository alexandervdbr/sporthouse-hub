'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Client } from '@/types/database'
import { LayoutDashboard, KanbanSquare, CalendarDays, CalendarRange, Users, LogOut, Camera, UserCheck, MessageSquare, ShieldCheck, Lock, Layers, X, Star, Bookmark } from 'lucide-react'
import { useSidebar } from '@/contexts/SidebarContext'
import { useFavorites } from '@/contexts/FavoritesContext'
import { cn } from '@/lib/utils'
import { getLogo } from '@/lib/logos'
import { usePreview } from '@/lib/preview-context'
import { ADMIN_EMAILS } from '@/lib/auth-permissions'

interface SidebarProps {
  clients: Client[]
}

function NavGroup({ title, clients, pathname, collapsed, icon: Icon }: {
  title: string
  clients: Client[]
  pathname: string
  collapsed: boolean
  icon?: React.ElementType
}) {
  if (clients.length === 0) return null
  return (
    <div className="mb-5">
      {/* In the collapsed rail the group heading has no room; a hairline keeps
          the visual grouping without the text. */}
      {collapsed ? (
        <div className="mx-2 mb-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
      ) : (
        <p className="px-3 mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
          {Icon && <Icon size={10} className="text-amber-400/70" fill="currentColor" />}
          {title}
        </p>
      )}
      {clients.map((client) => {
        const logo = getLogo(client.name, client.logo_url)
        const isActive = pathname.startsWith(`/clients/${client.id}`)
        return (
          <Link
            key={client.id}
            href={`/clients/${client.id}`}
            title={collapsed ? client.name : undefined}
            className={cn(
              'group flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-all duration-150 mb-0.5 relative',
              collapsed && 'justify-center',
              isActive
                ? 'text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            style={collapsed
              ? { paddingLeft: 0, paddingRight: 0 }
              : isActive ? { paddingLeft: 10, paddingRight: 12 } : { paddingLeft: 12, paddingRight: 12 }}
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
              {!collapsed && <span className="truncate">{client.name}</span>}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

interface Permissions { sections: string[]; clients: string[] }

export default function Sidebar({ clients }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { collapsed, mobileOpen, closeMobile } = useSidebar()
  const { favorites } = useFavorites()
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
      const sections: string[] = user.app_metadata?.permissions?.sections ?? []
      const admin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
      setRealIsAdmin(admin)
      if (!admin) setRealPermissions(user.app_metadata?.permissions ?? null)
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
  const INTERN_ORDER = ['Sporthouse', 'Friends of Sports']
  const intern = allowed
    .filter(c => c.category === 'intern' && !favorites.has(c.id))
    .sort((a, b) => {
      const ai = INTERN_ORDER.indexOf(a.name)
      const bi = INTERN_ORDER.indexOf(b.name)
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  // Favourites are lifted out of their category rather than duplicated: seeing
  // the same client twice is confusing, and removing it from the list below is
  // the entire point — a shorter scroll.
  const isFav = (c: Client) => favorites.has(c.id)
  const favorited = allowed.filter(isFav).sort((a, b) => a.name.localeCompare(b.name))

  const klanten  = allowed.filter(c => c.category === 'klant'   && !isFav(c))
  const atleten  = allowed.filter(c => c.category === 'atleet'  && !isFav(c))
  const podcasts = allowed.filter(c => c.category === 'podcast' && !isFav(c))

  return (
    <>
      {/* Scrim behind the mobile drawer. Desktop never sees it. */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

    <aside data-tour="sidebar"
      className={cn(
        'flex flex-col h-[100dvh] z-50',
        // Below lg the sidebar is an overlay drawer that slides in from the left.
        'fixed inset-y-0 left-0 w-64 transform transition-transform duration-200 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // From lg it returns to being a normal column in the flex row, and the
        // only thing that animates is its width.
        'lg:static lg:translate-x-0 lg:flex-shrink-0 lg:transition-[width] lg:duration-200',
        collapsed ? 'lg:w-16' : 'lg:w-60'
      )}
      style={{
        background: 'linear-gradient(180deg, #181818 0%, #141414 100%)',
        borderRight: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      {/* Brand */}
      <div data-tour="sidebar-brand"
        className={cn('relative py-5 flex justify-center', collapsed ? 'px-2' : 'px-5')}
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
        {/* Drawer close button — mobile only, the desktop rail has the TopBar toggle. */}
        <button
          onClick={closeMobile}
          aria-label="Menu sluiten"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors lg:hidden"
        >
          <X size={18} />
        </button>
        <Link href="/dashboard" className="relative">
          <Image
            src="/logo.png"
            alt="Sporthouse"
            width={collapsed ? 32 : 120}
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
        <div data-tour="nav-items" className="mb-5 space-y-0.5">
          {([
            { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',      section: 'dashboard',      external: false },
            { href: '/projects',    icon: KanbanSquare,    label: 'Projecten',      section: 'projecten',      external: false },
            { href: '/planning',    icon: CalendarDays,    label: 'Planning',       section: 'planning',       external: false },
            { href: '/events',      icon: CalendarRange,   label: 'Projectkalender', section: 'projectkalender', external: false },
            { href: '/equipment',   icon: Camera,          label: 'Materiaal',      section: 'materiaal',      external: false },
            { href: '/team',        icon: Users,           label: 'Team',           section: 'team',           external: false },
            { href: '/freelancers', icon: UserCheck,       label: 'Freelancers',    section: 'freelancers',    external: false },
            { href: '/chat',        icon: MessageSquare,   label: 'Chat',           section: 'chat',           external: false },
            { href: '/passwords',   icon: Lock,            label: 'Wachtwoorden',    section: 'wachtwoorden_bekijken', external: false },
            { href: '/preassist',   icon: Layers,          label: 'Pré-assist',      section: 'preassist',             external: false },
            { href: '/mijn-gedacht', icon: Bookmark,       label: 'Mijn gedacht!',   section: 'mijn-gedacht',          external: false },
            { href: 'https://photos.google.com', icon: Camera, label: "Google Photos", section: 'googlephotos', external: true },
            ...(isAdmin ? [{ href: '/admin', icon: ShieldCheck, label: 'Beheer', section: 'admin', external: false }] : []),
          ] as { href: string; icon: React.ElementType; label: string; section: string; external: boolean }[])
          .filter(item => item.section === 'admin' || item.external || canSeeSection(item.section))
          .map(({ href, icon: Icon, label, external }) => {
            const isActive = !external && pathname === href
            const commonClass = cn(
              "group flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-all duration-150 relative",
              collapsed && "lg:justify-center"
            )
            const commonStyle = collapsed
              ? { paddingLeft: 0, paddingRight: 0, color: isActive ? '#e4e4e2' : '#a1a1aa', fontWeight: isActive ? 500 : undefined }
              : isActive
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
                  <Icon size={15} className="flex-shrink-0" />
                  {!collapsed && <span>{label}</span>}
                  {label === 'Chat' && unreadChat > 0 && (
                    <span
                      className={cn(
                        'flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white',
                        // Collapsed there's no room beside the icon, so the count
                        // becomes a small badge pinned to its top-right corner.
                        collapsed
                          ? 'absolute -top-1 -right-1 min-w-[16px] h-[16px]'
                          : 'ml-auto min-w-[18px] h-[18px]'
                      )}
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
                title={collapsed ? label : undefined}
                className={commonClass}
                style={commonStyle}
              >
                {inner}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
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

        <div data-tour="sidebar-clients">
          <NavGroup title="Favorieten"     clients={favorited} pathname={pathname} collapsed={collapsed} icon={Star} />
          <NavGroup title="Intern"         clients={intern}   pathname={pathname} collapsed={collapsed} />
          <NavGroup title="Klanten"        clients={klanten}  pathname={pathname} collapsed={collapsed} />
          <NavGroup title="Atleten"        clients={atleten}  pathname={pathname} collapsed={collapsed} />
          <NavGroup title="FOS — Podcasts" clients={podcasts} pathname={pathname} collapsed={collapsed} />
        </div>
      </nav>

      {/* Bottom actions */}
      <div className="p-3 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.09)' }}>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Uitloggen' : undefined}
          className={cn(
            'w-full flex items-center gap-2.5 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all duration-150',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
        >
          <LogOut size={14} className="flex-shrink-0" />
          {!collapsed && <span>Uitloggen</span>}
        </button>
      </div>
    </aside>
    </>
  )
}
