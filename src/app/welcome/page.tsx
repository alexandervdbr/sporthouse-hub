import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import { Client } from '@/types/database'
import { getLogo } from '@/lib/logos'
import {
  Sparkles, Users, Building2, Mic2, Dumbbell,
  Wrench, Clock, MessageCircle, ArrowRight, BookOpen,
} from 'lucide-react'

// ─── Client pill ─────────────────────────────────────────────────────────────

function ClientPill({ client }: { client: Client }) {
  const logo = getLogo(client.name, client.logo_url)
  const color = client.color || '#52525b'
  return (
    <Link
      href={`/clients/${client.id}`}
      className="group flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 overflow-hidden relative"
      style={{
        background: 'rgba(24,24,24,0.97)',
        border: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 80% at 0% 50%, ${color}12 0%, transparent 70%)` }}
      />
      <div
        className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: color }}
      />
      {logo ? (
        <Image src={logo} alt={client.name} width={18} height={18}
          className="rounded object-cover flex-shrink-0 relative" style={{ width: 18, height: 18 }} />
      ) : (
        <div className="w-[18px] h-[18px] rounded flex-shrink-0 relative"
          style={{ backgroundColor: `${color}20`, border: `1px solid ${color}30` }} />
      )}
      <span className="relative text-sm text-zinc-300 group-hover:text-white transition-colors truncate">{client.name}</span>
      <ArrowRight size={11} className="ml-auto text-zinc-700 group-hover:text-zinc-400 transition-colors flex-shrink-0 relative" />
    </Link>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
        <Icon size={15} style={{ color }} />
      </div>
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
    </div>
  )
}

// ─── Info card ────────────────────────────────────────────────────────────────

function Card({ children, color = 'rgba(255,255,255,0.06)' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="relative rounded-2xl p-6 overflow-hidden"
      style={{ background: 'rgba(22,22,22,0.98)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      {children}
    </div>
  )
}

// ─── Tool pill ────────────────────────────────────────────────────────────────

function ToolTag({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: '#3A913F' }} />
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WelcomePage() {
  const supabase = await createClient()
  const { data: clients } = await supabase.from('clients').select('*').order('name')
  const all = (clients as Client[]) || []

  const klanten  = all.filter(c => c.category === 'klant')
  const atleten  = all.filter(c => c.category === 'atleet')
  const podcasts = all.filter(c => c.category === 'podcast')

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Hero */}
      <div className="mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5 text-xs font-medium"
          style={{ backgroundColor: '#3A913F18', border: '1px solid #3A913F30', color: '#3A913F' }}>
          <Sparkles size={12} />
          Welkom bij Sporthouse
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3"
          style={{
            fontFamily: 'var(--font-kurdis)',
            background: 'linear-gradient(180deg, #ffffff 30%, #6b7280 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
          Welkom stagiair!
        </h1>
        <p className="text-zinc-400 text-base leading-relaxed max-w-xl">
          Fijn dat je er bent. Deze pagina vertelt je alles wat je moet weten om vlot van start te gaan bij Sporthouse.
          Neem er rustig de tijd voor.
        </p>
      </div>

      <div className="space-y-6">

        {/* Over Sporthouse */}
        <Card color="rgba(58,145,63,0.3)">
          <SectionHeader icon={BookOpen} title="Over Sporthouse" color="#3A913F" />
          <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
            <p>
              <span className="text-zinc-200 font-medium">SporthouseGroup</span> is een sportmarketingbureau
              dat merken en sporters verbindt. We werken voor een brede waaier aan klanten — van grote merken
              en professionele sportclubs tot individuele atleten en podcastproducties.
            </p>
            <p>
              Ons team combineert creativiteit met strategie: van contentcreatie en social media tot
              evenementen, communicatie en branding. Geen dag is hetzelfde.
            </p>
            <p>
              Sporthouse Hub — de tool die je nu gebruikt — is ons intern platform waar alles samenkomt:
              klantendossiers, planning, materiaal, projectopvolging en meer.
            </p>
          </div>
        </Card>

        {/* Wat we doen */}
        <Card>
          <SectionHeader icon={Dumbbell} title="Wat we doen" color="#3b82f6" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { title: 'Contentcreatie', desc: 'Foto, video, graphics en social media content voor klanten en atleten.' },
              { title: 'Sportmarketing', desc: 'Strategische communicatie en branding rond sport en sporters.' },
              { title: 'Evenementen', desc: 'Opmaak en coördinatie van sportevenementen en activaties.' },
              { title: 'Podcast & media', desc: 'Productie van sportpodcasts via het Friends of Sports netwerk.' },
            ].map(({ title, desc }) => (
              <div key={title} className="p-3.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-medium text-zinc-200 mb-1">{title}</p>
                <p className="text-zinc-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Klanten */}
        {klanten.length > 0 && (
          <Card>
            <SectionHeader icon={Building2} title={`Onze klanten (${klanten.length})`} color="#3A913F" />
            <p className="text-xs text-zinc-500 mb-4">
              Klik op een klant om het dossier te bekijken met bestanden, documenten en meer.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {klanten.map(c => <ClientPill key={c.id} client={c} />)}
            </div>
          </Card>
        )}

        {/* Atleten */}
        {atleten.length > 0 && (
          <Card>
            <SectionHeader icon={Users} title={`Atleten (${atleten.length})`} color="#3b82f6" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {atleten.map(c => <ClientPill key={c.id} client={c} />)}
            </div>
          </Card>
        )}

        {/* Podcasts */}
        {podcasts.length > 0 && (
          <Card>
            <SectionHeader icon={Mic2} title={`Friends of Sports — Podcasts (${podcasts.length})`} color="#a855f7" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {podcasts.map(c => <ClientPill key={c.id} client={c} />)}
            </div>
          </Card>
        )}

        {/* Tools */}
        <Card>
          <SectionHeader icon={Wrench} title="Tools die we gebruiken" color="#f59e0b" />
          <div className="grid grid-cols-2 gap-2.5">
            <ToolTag label="Sporthouse Hub" sub="Dit platform — planning, klanten, materiaal, chat." />
            <ToolTag label="Kinopio" sub="Ons visueel inspiratiebord voor ideeën en moodboards." />
            <ToolTag label="Google Workspace" sub="Mail, Drive, Docs en Sheets voor dagelijkse communicatie." />
            <ToolTag label="WhatsApp" sub="Snel intern overleg en updates met het team." />
          </div>
        </Card>

        {/* Praktisch */}
        <Card>
          <SectionHeader icon={Clock} title="Praktische info" color="#ec4899" />
          <div className="space-y-4 text-sm text-zinc-400 leading-relaxed">
            <div>
              <p className="text-zinc-200 font-medium mb-1">Werkuren</p>
              <p>Standaard kantooruren, maar flexibiliteit is de norm bij ons. Bespreek je uren met je begeleider.</p>
            </div>
            <div>
              <p className="text-zinc-200 font-medium mb-1">Vragen?</p>
              <p>Wacht niet te lang. Stel je vraag aan je begeleider of gooi een berichtje in de chat van Sporthouse Hub.</p>
            </div>
            <div>
              <p className="text-zinc-200 font-medium mb-1">Initiatief</p>
              <p>We waarderen mensen die zelf nadenken en ideeën aandragen. Kom gerust met voorstellen — niets is te gek.</p>
            </div>
          </div>
        </Card>

        {/* CTA */}
        <div className="flex items-center gap-3 p-5 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #3A913F12 0%, transparent 100%)', border: '1px solid #3A913F25' }}>
          <MessageCircle size={18} style={{ color: '#3A913F' }} className="flex-shrink-0" />
          <p className="text-sm text-zinc-400">
            Nog vragen of iets onduidelijk?{' '}
            <Link href="/chat" className="font-medium hover:underline" style={{ color: '#3A913F' }}>
              Open de chat
            </Link>{' '}
            of spreek je begeleider aan.
          </p>
        </div>

      </div>
    </div>
  )
}
