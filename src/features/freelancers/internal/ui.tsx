'use client'

import { useEffect, type ReactNode } from 'react'
import { Star, X } from 'lucide-react'
import { ASSIGNMENT_STATUS, AVAILABILITY } from './format'
import type { Freelancer } from './types'

// Kleine bouwstenen van de freelancertool. De rest (knoppen, velden,
// modals, toasts) komt uit de gedeelde componenten van de app.

export function StatusPill({ status }: { status: string }) {
  const s = ASSIGNMENT_STATUS[status] ?? { label: status, cls: 'text-zinc-300 border-zinc-600' }
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

export function AvailabilityDot({ value, title }: { value: Freelancer['availability']; title?: string | null }) {
  const a = AVAILABILITY[value]
  return (
    <span className="inline-flex items-center gap-1.5" title={title ?? undefined}>
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${a.dot}`} aria-hidden />
      <span>{a.label}</span>
    </span>
  )
}

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
  return url
    // eslint-disable-next-line @next/next/no-img-element -- publieke avatar, klein
    ? <img src={url} alt="" width={size} height={size} className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="flex flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-200" style={{ width: size, height: size }}>{initials}</span>
}

export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  const cls = `inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${active ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 text-zinc-300'}`
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={!!active} className={`${cls} min-h-[32px] hover:border-zinc-500`}>{children}</button>
    : <span className={cls}>{children}</span>
}

/** Sterren 1–5; klikbaar met onChange (doelen van minstens 44px), anders alleen tonen. */
export function Stars({ value, onChange, size = 16, label = 'Beoordeling' }: { value: number | null; onChange?: (v: number) => void; size?: number; label?: string }) {
  return (
    <span role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${label}: ${value ?? 'geen'} van 5`} className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map(n => {
        const on = value != null && n <= value
        const icon = <Star size={size} className={on ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'} aria-hidden />
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} van 5`} onClick={() => onChange(n)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50">{icon}</button>
          : <span key={n}>{icon}</span>
      })}
    </span>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {children && <p className="mt-1 text-sm text-zinc-500">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** Paneel van onderen (gsm): filters en dergelijke. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-900 px-4 pt-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Tabbladen die als segmented control werken (ook op de gsm). */
export function TabBar<T extends string>({ value, tabs, onChange }: { value: T; tabs: { key: T; label: string }[]; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
      {tabs.map(t => (
        <button key={t.key} role="tab" type="button" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={`min-h-[36px] flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium ${value === t.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
