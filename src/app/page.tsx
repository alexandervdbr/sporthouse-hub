import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2, FolderOpen, CalendarDays, Package, Users, Mic, ShieldCheck, ArrowRight,
} from 'lucide-react'
import { PublicShell, LogoMark } from '@/components/public/PublicShell'
import { LEGAL } from '@/lib/legal'

// Public homepage. Anyone can open it — it is the homepage URL registered on
// the Google OAuth consent screen. A signed-in user never sees it: the
// middleware sends staff to /dashboard and freelancers to /portal first.

export const metadata: Metadata = {
  title: 'Sporthouse Hub — the internal platform of SporthouseGroup',
  description:
    'Sporthouse Hub is the internal workspace where SporthouseGroup staff and freelancers manage clients, projects, files, planning and equipment. Sign in with Google.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Sporthouse Hub',
    description: 'The internal platform of SporthouseGroup.',
    type: 'website',
  },
}

const FEATURES = [
  { icon: Building2,    title: 'Clients & projects',  text: 'One place for every client, its projects, contacts and history.' },
  { icon: FolderOpen,   title: 'Files',               text: 'Project files stored in the company Google Drive, shared with a link when needed.' },
  { icon: CalendarDays, title: 'Planning',            text: 'Shoots, events and staffing planned together, with personal schedules for the team.' },
  { icon: Package,      title: 'Equipment',           text: 'Book equipment, with pick-up and return times and calendar invites.' },
  { icon: Users,        title: 'Team & freelancers',  text: 'A dedicated portal where freelancers see the work assigned to them.' },
  { icon: Mic,          title: 'Meeting notes',       text: 'Record meetings and turn the transcript into a structured summary.' },
]

export default function HomePage() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pt-20 pb-16 sm:pt-28">
        <div className="max-w-2xl">
          <LogoMark size={56} />
          <h1 className="mt-6 text-4xl sm:text-5xl font-semibold text-white tracking-tight">
            {LEGAL.appName}
          </h1>
          <p className="mt-4 text-lg text-zinc-400 leading-relaxed">
            The internal platform of {LEGAL.operator}. Our staff and freelancers use it to manage
            clients, projects, files, planning and equipment — together, in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-100 transition-colors"
            >
              Sign in with Google <ArrowRight size={15} />
            </Link>
            <Link href="/privacy" className="px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors">
              Privacy Policy
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Access is by invitation only. There is no public sign-up — accounts are created by an administrator.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-5">What it does</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sh-green/15 border border-sh-green/25">
                <Icon size={16} className="text-sh-green" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-zinc-100">{title}</h3>
              <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Google sign-in disclosure — what Google's reviewers look for */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 flex flex-col sm:flex-row gap-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 flex-shrink-0">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
            <h2 className="text-base font-semibold text-white">How we use Google sign-in</h2>
            <p>
              {LEGAL.appName} uses Google Sign-In only to confirm who you are. When you sign in, Google shares
              your <strong className="text-zinc-200">name, email address and profile picture</strong> with us
              (the <code className="text-zinc-300">openid</code>, <code className="text-zinc-300">email</code> and{' '}
              <code className="text-zinc-300">profile</code> scopes). We use your email address to match you to the
              account an administrator created for you, and your name to show who did what inside the platform.
            </p>
            <p>
              Signing in does not give {LEGAL.appName} access to your Gmail, Google Drive, Calendar or contacts. We do
              not sell this data, use it for advertising, or share it outside the service providers that run the
              platform. Read the full details in our <Link href="/privacy" className="text-white underline underline-offset-2">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
