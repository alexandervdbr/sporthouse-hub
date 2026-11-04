'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { CheckCircle2, X } from 'lucide-react'

// Bouwstenen voor de poolwagens. Invoervelden, kleuren, fouten en fetch komen
// uit de materiaalplanner (src/components/materiaal/ui.tsx); hier alleen wat
// daar niet bestaat.

export { ACCENT, ErrorLine, inputCls, labelCls, send } from '@/components/materiaal/ui'

/**
 * Dialoogvenster in dezelfde stijl als het boekingsformulier van /materiaal.
 * Op een gsm past het altijd: de inhoud scrollt, de kop en de knoppen
 * (footer) blijven staan.
 */
export function Modal({ title, onClose, children, footer, wide }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl`}>
        <div className="flex-shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-100 min-w-0 truncate">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="p-2 -m-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><X size={16} /></button>
        </div>
        {/* min-h-0: anders krimpt dit vak niet en valt de footer onder het scherm. */}
        <div className="flex-1 min-h-0 px-4 sm:px-5 py-4 overflow-y-auto overscroll-contain space-y-4">{children}</div>
        {footer && <div className="flex-shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export const buttonCls = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50'
export const secondaryCls = `${buttonCls} text-zinc-300 border border-zinc-700 hover:bg-zinc-800`
export const dangerCls = `${buttonCls} text-red-300 border border-red-900/60 hover:bg-red-950/40`

/** De tabs bovenaan elke poolwagenspagina. */
export function PoolNav({ current, manage }: { current: 'planning' | 'historiek' | 'schade' | 'beheer'; manage: boolean }) {
  const tabs = [
    { key: 'planning', label: 'Planning', href: '/poolwagens' },
    { key: 'historiek', label: 'Historiek', href: '/poolwagens/historiek' },
    { key: 'schade', label: 'Schade', href: '/poolwagens/schade' },
    ...(manage ? [{ key: 'beheer', label: 'Beheer', href: '/poolwagens/beheer' }] : []),
  ] as const
  return (
    <nav className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 w-fit">
      {tabs.map(t => (
        <Link key={t.key} href={t.href}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${current === t.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

export const km = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('nl-BE')} km`)

/** Hoe lang een melding als "Opgeslagen." blijft staan. */
export const NOTICE_MS = 4000

/**
 * Een bevestiging ("Opgeslagen.") die na ongeveer 4 seconden vanzelf
 * verdwijnt, met een knop om ze meteen te sluiten. Foutmeldingen gebruiken
 * ErrorLine en blijven staan. `id` verandert bij elke nieuwe melding, zodat
 * twee keer na elkaar "Opgeslagen." de klok opnieuw start.
 */
export function Notice({ notice, onClose }: { notice: { text: string; id: number } | null; onClose: () => void }) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => close.current(), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])
  if (!notice) return null
  return (
    <div role="status" className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40 text-sm text-emerald-300">
      <span className="flex items-center gap-2 min-w-0"><CheckCircle2 size={14} className="flex-shrink-0" />{notice.text}</span>
      <button onClick={onClose} aria-label="Sluiten" className="p-1 text-emerald-400/70 hover:text-emerald-200"><X size={14} /></button>
    </div>
  )
}

/** Een nieuwe melding, met een eigen id (zie Notice). */
export const newNotice = (text: string) => ({ text, id: Date.now() + Math.random() })
