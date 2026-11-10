import Link from 'next/link'
import { LEGAL } from '@/lib/legal'

// Shared frame for the pages anyone can open without signing in: the
// homepage, /privacy and /terms. No Supabase call and no client JS here —
// these pages are what Google's verification crawler sees, and they should
// cost nothing to serve.

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-white flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static file, skips the image optimizer */}
      <img src="/logo.png" alt="" width={size * 0.72} height={size * 0.72} />
    </span>
  )
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-white font-semibold tracking-tight">{LEGAL.appName}</span>
          </Link>
          <Link
            href="/login"
            className="px-3.5 py-1.5 rounded-lg bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-100 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-sm">
          <p className="text-zinc-500">
            © {new Date().getFullYear()} {LEGAL.legalEntity ?? LEGAL.operator}. {LEGAL.appName} is the internal platform of {LEGAL.operator}.
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className="text-zinc-400 hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-zinc-400 hover:text-white transition-colors">Terms of Service</Link>
            <a href={`mailto:${LEGAL.contactEmail}`} className="text-zinc-400 hover:text-white transition-colors">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

/** Visibly marks information that still has to be filled in (see src/lib/legal.ts). */
export function Missing({ children }: { children: React.ReactNode }) {
  return (
    <mark className="rounded px-1 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30">
      [To be completed: {children}]
    </mark>
  )
}

/** A value from src/lib/legal.ts, or a visible placeholder when it is still empty. */
export function Fill({ value, missing }: { value: string | null; missing: string }) {
  return value ? <>{value}</> : <Missing>{missing}</Missing>
}

export function LegalPage({ title, updated, intro, children }: {
  title: string
  updated: string
  intro: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-2xl px-4 py-14 space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold text-white tracking-tight">{title}</h1>
          <p className="text-sm text-zinc-500">Last updated {updated}</p>
          <div className="text-sm leading-relaxed text-zinc-400">{intro}</div>
        </header>
        {children}
      </article>
    </PublicShell>
  )
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="text-sm leading-relaxed text-zinc-400 space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-zinc-200 [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </section>
  )
}
