'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

// Bouwstenen voor de poolwagens. Invoervelden, kleuren, fouten en fetch komen
// uit de materiaalplanner (src/components/materiaal/ui.tsx); hier alleen wat
// daar niet bestaat.

export { ACCENT, ErrorLine, inputCls, labelCls, send } from '@/components/materiaal/ui'

/** Dialoogvenster in dezelfde stijl als het boekingsformulier van /materiaal. */
export function Modal({ title, onClose, children, footer, wide }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl`}>
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
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
