'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Star, X } from 'lucide-react'

// Kleine bouwstenen van het freelanceroverzicht. Knoppen, velden en de modal
// komen uit de gedeelde componenten van de app (materiaal/ui, poolwagens/ui).

export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  const cls = `inline-flex items-center rounded-full border px-3 text-xs font-medium whitespace-nowrap ${active ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 text-zinc-300'}`
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={!!active} className={`${cls} min-h-[44px] sm:min-h-[32px] hover:border-zinc-500`}>{children}</button>
    : <span className={`${cls} py-0.5`}>{children}</span>
}

/** Sterren 1–5. Met onChange klikbaar (doelen ≥ 44px); nog eens klikken op dezelfde ster wist de score. */
export function Stars({ value, onChange, label = 'Beoordeling' }: { value: number | null; onChange?: (v: number | null) => void; label?: string }) {
  return (
    <span role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${label}: ${value ?? 'geen'} van 5`} className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map(n => {
        const on = value != null && n <= value
        const icon = <Star size={onChange ? 22 : 14} className={on ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'} aria-hidden />
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} van 5`} onClick={() => onChange(value === n ? null : n)}
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50">{icon}</button>
          : <span key={n}>{icon}</span>
      })}
    </span>
  )
}

/** Knop met een uitklapmenu van vinkjes (meerdere keuzes). Extra inhoud (bv. een schakelaar) onderaan via `footer`. */
export function MultiSelect({ label, options, value, onChange, footer }: {
  label: string; options: { key: string; label: string; count?: number }[]; value: string[]; onChange: (v: string[]) => void; footer?: ReactNode
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
  const text = value.length === 0 ? label : value.length === 1 ? options.find(o => o.key === value[0])?.label ?? label : `${label} · ${value.length}`
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true"
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap ${value.length ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'}`}>
        {text}<ChevronDown size={14} className="text-zinc-500" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-30 mt-1 max-h-[60vh] min-w-[14rem] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl">
          {options.map(o => {
            const on = value.includes(o.key)
            return (
              <button key={o.key} type="button" role="menuitemcheckbox" aria-checked={on}
                onClick={() => onChange(on ? value.filter(x => x !== o.key) : [...value, o.key])}
                className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800">
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${on ? 'border-[#3A913F] bg-[#3A913F]' : 'border-zinc-600'}`}>{on && <Check size={12} className="text-white" />}</span>
                <span className="flex-1">{o.label}</span>
                {o.count != null && <span className="text-xs text-zinc-500">{o.count}</span>}
              </button>
            )
          })}
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-800">Alles tonen</button>}
          {footer && <div className="mt-1 border-t border-zinc-800 pt-1">{footer}</div>}
        </div>
      )}
    </div>
  )
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800 sm:min-h-[40px]">
      <span className={`relative h-4 w-7 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-[#3A913F]' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {children}
    </button>
  )
}

/** Paneel dat onderaan het scherm opschuift (gsm). Sluiten met ✕, de achtergrond of Escape. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl border-t border-zinc-800 bg-zinc-900">
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && <div className="flex flex-shrink-0 gap-2 border-t border-zinc-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>button]:min-h-11 [&>button]:flex-1">{footer}</div>}
      </div>
    </div>
  )
}

/** Korte melding onderaan; verdwijnt vanzelf. */
export function useToast() {
  const [text, setText] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = (s: string) => {
    setText(s)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setText(''), 3000)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const node = text
    ? <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 shadow-xl">{text}</div>
    : null
  return { say, node }
}
