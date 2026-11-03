'use client'

import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { STATUS_LABEL, type UnitStatus } from '@/lib/gear/status'

// Kleine bouwstenen die Beheer en de detailpagina van /materiaal delen.

export const inputCls =
  'w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600'
export const labelCls = 'block text-[10px] text-zinc-500 uppercase tracking-wider mb-1'
export const ACCENT = '#3A913F'

export const PALETTE = [
  '#3A913F', '#22c55e', '#facc15', '#f59e0b', '#f97316', '#c2410c',
  '#ec4899', '#be185d', '#a855f7', '#6d28d9', '#0ea5e9', '#2563eb',
  '#22d3ee', '#0891b2', '#64748b', '#71717a',
]

const STATUS_STYLE: Record<UnitStatus, string> = {
  ok:         'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  beperkt:    'text-amber-300 border-amber-500/30 bg-amber-500/10',
  defect:     'text-red-400 border-red-500/40 bg-red-500/10',
  uit_dienst: 'text-zinc-400 border-zinc-600 bg-zinc-800/60',
}

export function StatusBadge({ status }: { status: UnitStatus }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400">
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export function ColorDots({ value, onChange, size = 16 }: { value: string; onChange: (c: string) => void; size?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Kleur ${c}`}
          aria-pressed={value === c}
          className="rounded-full flex-shrink-0"
          style={{ width: size, height: size, backgroundColor: c, border: value === c ? '2px solid #fff' : '2px solid transparent' }}
        />
      ))}
    </div>
  )
}

/** fetch met JSON, en een leesbare fout als het misgaat. */
export async function send<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.text()) || 'Er ging iets mis.')
  return (res.status === 204 ? null : await res.json()) as T
}
