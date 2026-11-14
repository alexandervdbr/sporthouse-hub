'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/materiaal/ui'
import type { AssignmentDetail } from '../types'

// Eén primaire knop voor de logische volgende stap ("Delen met …",
// "Afronden", "Beoordelen"); de minder gebruikte acties zitten onder "Meer".
export type PanelAction =
  | { kind: 'transition'; to: string }
  | { kind: 'dialog'; to: 'geaccepteerd' | 'geannuleerd' | 'opgeleverd' }
  | { kind: 'review' } | { kind: 'edit' }

export default function AssignmentActions({ a, busy, onAction }: { a: AssignmentDetail; busy: boolean; onAction: (x: PanelAction) => void }) {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const can = (to: string) => a.actions.some(x => x.to === to)
  const name = a.freelancer?.name?.split(/\s+/)[0] ?? 'freelancer'
  const primary =
    a.status === 'concept' && can('gedeeld') ? { label: `Delen met ${name}`, act: { kind: 'transition', to: 'gedeeld' } as PanelAction }
    : a.status === 'opgeleverd' && can('afgerond') ? { label: 'Afronden', act: { kind: 'transition', to: 'afgerond' } as PanelAction }
    : a.status === 'afgerond' && !a.review ? { label: 'Beoordelen', act: { kind: 'review' } as PanelAction }
    : null

  const more: { label: string; act: PanelAction; danger?: boolean }[] = []
  if (a.status === 'opgeleverd' && can('geaccepteerd')) more.push({ label: 'Terugsturen met feedback', act: { kind: 'dialog', to: 'geaccepteerd' } })
  if (a.status === 'afgerond' && can('opgeleverd')) more.push({ label: 'Heropenen', act: { kind: 'dialog', to: 'opgeleverd' } })
  if (a.status === 'afgerond' && a.review) more.push({ label: 'Review aanpassen', act: { kind: 'review' } })
  if (!['afgerond', 'geannuleerd'].includes(a.status)) more.push({ label: 'Bewerken', act: { kind: 'edit' } })
  if (can('geannuleerd')) more.push({ label: 'Annuleren', act: { kind: 'dialog', to: 'geannuleerd' }, danger: true })

  return (
    <div className="flex items-center gap-2">
      {primary && <Button variant="primary" className="!h-11 flex-1 sm:!h-9 sm:flex-none" busy={busy} onClick={() => onAction(primary.act)}>{primary.label}</Button>}
      {more.length > 0 && (
        <div ref={menu} className="relative">
          <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className="!h-11 sm:!h-9" disabled={busy}>
            <MoreHorizontal size={16} aria-hidden /> Meer
          </Button>
          {open && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl">
              {more.map(m => (
                <button key={m.label} role="menuitem" type="button" onClick={() => { setOpen(false); onAction(m.act) }}
                  className={`flex min-h-[44px] w-full items-center px-3 text-left text-sm hover:bg-zinc-800 ${m.danger ? 'text-red-400' : 'text-zinc-200'}`}>{m.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
