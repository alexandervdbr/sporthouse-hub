'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Star } from 'lucide-react'
import type { Availability, PAssignment, PFreelancer } from './data'
import { ratingOf } from './data'

// Kleine bouwstenen van het prototype.

export const fmt = {
  date: (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }),
  long: (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' }),
  ago(iso: string) {
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86400_000)
    return days <= 0 ? 'vandaag' : days === 1 ? 'gisteren' : days < 30 ? `${days} dagen geleden` : fmt.date(iso)
  },
  /** "nog 3 dagen", "morgen", "1 dag te laat" */
  deadline(d: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const diff = Math.round((Date.parse(`${d}T00:00:00`) - today.getTime()) / 86400_000)
    if (diff < 0) return { text: diff === -1 ? '1 dag te laat' : `${-diff} dagen te laat`, late: true }
    return { text: diff === 0 ? 'vandaag' : diff === 1 ? 'morgen' : `nog ${diff} dagen`, late: false }
  },
  score: (n: number) => n.toFixed(1).replace('.', ','),
}

export const first = (name: string) => name.split(' ')[0]

const AV: Record<Availability, { label: string; dot: string }> = {
  beschikbaar: { label: 'Beschikbaar', dot: 'bg-emerald-500' },
  beperkt: { label: 'Beperkt', dot: 'bg-amber-400' },
  niet_beschikbaar: { label: 'Niet beschikbaar', dot: 'bg-red-500' },
}
export function Avail({ f, short }: { f: PFreelancer; short?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm text-zinc-300">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${AV[f.availability].dot}`} aria-hidden />
      {AV[f.availability].label}
      {f.availableFrom && f.availability !== 'beschikbaar' && <span className="text-zinc-500">{short ? '· ' : '· weer vanaf '}{fmt.date(f.availableFrom)}</span>}
    </span>
  )
}
export const AV_LABEL = AV

/** "★ 4,5" met daaronder "7 opdrachten" of "teamoordeel". */
export function Rating({ f, all, inline }: { f: PFreelancer; all: PAssignment[]; inline?: boolean }) {
  const r = ratingOf(f, all)
  if (r.value == null) return <span className="text-sm text-zinc-600">—</span>
  const sub = r.team ? 'teamoordeel' : `${r.count} ${r.count === 1 ? 'opdracht' : 'opdrachten'}`
  return (
    <span className={inline ? 'inline-flex items-baseline gap-1.5' : 'block'}>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-100"><Star size={13} className="fill-amber-400 text-amber-400" aria-hidden />{fmt.score(r.value)}</span>
      <span className={`text-xs text-zinc-500 ${inline ? '' : 'block'}`}>{sub}</span>
    </span>
  )
}

export function StarsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span role="radiogroup" aria-label="Score" className="inline-flex">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} van 5`} onClick={() => onChange(n)}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-zinc-800">
          <Star size={26} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'} aria-hidden />
        </button>
      ))}
    </span>
  )
}

export function Initials({ name, size = 32 }: { name: string; size?: number }) {
  const t = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
  return <span className="flex flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 font-semibold text-zinc-200" style={{ width: size, height: size, fontSize: size / 2.8 }}>{t}</span>
}

/** Knop met een uitklapmenu van vinkjes (meerdere keuzes). */
export function MultiSelect({ label, options, value, onChange, summary }: {
  label: string; options: { key: string; label: string; count?: number }[]; value: string[]; onChange: (v: string[]) => void; summary?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const text = summary ?? (value.length === 0 ? label : value.length === 1 ? options.find(o => o.key === value[0])?.label ?? label : `${label} · ${value.length}`)
  const active = summary ? false : value.length > 0
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap sm:h-9 ${active ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'}`}>
        {text}<ChevronDown size={14} className="text-zinc-500" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-[13rem] rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl">
          {options.map(o => {
            const on = value.includes(o.key)
            return (
              <button key={o.key} type="button" role="menuitemcheckbox" aria-checked={on}
                onClick={() => onChange(on ? value.filter(x => x !== o.key) : [...value, o.key])}
                className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800">
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-[#3A913F] bg-[#3A913F]' : 'border-zinc-600'}`}>{on && <Check size={12} className="text-white" />}</span>
                <span className="flex-1">{o.label}</span>
                {o.count != null && <span className="text-xs text-zinc-500">{o.count}</span>}
              </button>
            )
          })}
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-800">Alles tonen</button>}
        </div>
      )}
    </div>
  )
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap sm:h-9 ${on ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'}`}>
      <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? 'bg-[#3A913F]' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {children}
    </button>
  )
}

/** Gestippelde strook voor knoppen die alleen in het prototype bestaan. */
export function ProtoOnly({ children, label = 'Alleen in het prototype' }: { children: ReactNode; label?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-violet-300">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
