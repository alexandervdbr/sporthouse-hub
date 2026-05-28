import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Client } from '@/types/database'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

const LOGO_MAP: Record<string, string> = {
  'Pro League':               '/logos/proleague.jpg',
  'RBFA':                     '/logos/rbfa.jpg',
  'Unibet Experts':           '/logos/unibet-experts.jpg',
  'Sporza':                   '/logos/sporza.jpg',
  'KRC Genk':                 '/logos/krc-genk.jpg',
  'Club Brugge':              '/logos/club-brugge.png',
  'RSC Anderlecht':           '/logos/rsc-anderlecht.jpg',
  'Flanders Classics':        '/logos/flanders-classics.jpg',
  'Lotto Super League':       '/logos/lotto-super-league.jpg',
  'AG':                       '/logos/ag.png',
  'i-fitness':                '/logos/i-fitness.jpg',
  'PLAY':                     '/logos/play.jpg',
  'Play Sports':              '/logos/play-sports.jpg',
  'Sport Vlaanderen':         '/logos/sport-vlaanderen.jpg',
  'Move To Cure':             '/logos/move-to-cure.jpeg',
  'Jan Vertonghen Foundation':'/logos/jan-vertonghen-foundation.jpg',
  'Verstappen.com':           '/logos/verstappen-com.jpg',
  'Sporthouse':               '/logos/sporthouse.jpg',
  'Shirtlist':                '/logos/shirtlist.jpg',
  'Friends of Sports':        '/logos/friends-of-sports.jpeg',
  'Kevin De Bruyne':          '/logos/kevin-de-bruyne.webp',
  'Kos Karetsas':             '/logos/karetsas.webp',
  'Max Verstappen':           '/logos/verstappen.jpg',
  'Maxim De Cuyper':          '/logos/de-cuyper.webp',
  'Arthur Vermeeren':         '/logos/vermeeren.webp',
  'Dries Mertens':            '/logos/mertens.webp',
  'Charles De Ketelaere':     '/logos/de-ketelaere.webp',
  'MIDMID':                   '/logos/midmid.jpg',
  '90 MINUTES':               '/logos/90minutes.webp',
  "OEP Z'N BAKKES":           '/logos/oepznbakkes.jpg',
  'VALS PLAT':                '/logos/valsplat.jpeg',
  'KICK&RUSH':                '/logos/kickandrush.jpg',
  'BUITEN DE LIJNEN':         '/logos/buitendelijnen.jpg',
  'CROQUETA':                 '/logos/croqueta.jpg',
  "X&O'S":                    '/logos/xandos.jpg',
  'BALLIEMAN':                '/logos/ballieman.jpg',
  'Kartel':                   '/logos/kartel.jpg',
}

interface Props {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function ClientLayout({ children, params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

  // Check client access permissions
  if (user) {
    const sections: string[] = user.user_metadata?.permissions?.sections ?? []
    const perms: { sections: string[]; clients: string[] } | null = user.user_metadata?.permissions ?? null
    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
    if (!isAdmin && perms !== null) {
      const allowedClients: string[] = perms.clients ?? []
      // If a non-empty clients restriction is configured and this client isn't in it, block
      if (allowedClients.length > 0 && !allowedClients.includes(id)) {
        redirect('/dashboard')
      }
    }
  }

  const c = client as Client

  const categoryLabel: Record<string, string> = {
    klant: 'Klant',
    atleet: 'Atleet',
    podcast: 'Friends Of Sports',
    intern: 'Intern',
  }

  const logo = LOGO_MAP[c.name] || null

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(14,14,14,0.8)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-4">
          <Link href={`/clients/${id}`} className="flex items-center gap-4 group">
            {logo ? (
              <Image
                src={logo}
                alt={c.name}
                width={40}
                height={40}
                className="rounded-xl object-cover flex-shrink-0 ring-1 ring-zinc-700 group-hover:ring-zinc-500 transition-all"
                style={{ width: 40, height: 40 }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex-shrink-0 ring-1 ring-zinc-700 group-hover:ring-zinc-500 transition-all"
                style={{ backgroundColor: c.color ? `${c.color}22` : '#1a1a1a' }}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color || '#71717a' }} />
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight group-hover:text-white transition-colors">{c.name}</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                  {categoryLabel[c.category] || c.category}
                </span>
              </div>
              {c.description && (
                <p className="text-sm text-zinc-500 mt-0.5 leading-relaxed">{c.description}</p>
              )}
            </div>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
