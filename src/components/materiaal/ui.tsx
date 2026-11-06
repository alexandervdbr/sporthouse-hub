'use client'

import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react'
import { STATUS_LABEL, type UnitStatus } from '@/lib/gear/status'
import type { GearClientRef } from '@/lib/gear/types'

// De bouwstenen van /materiaal: één stijl per soort knop of veld, zoals de
// rest van het platform (zinc-800 velden met een zinc-700 rand, rounded-lg,
// focus op zinc-500). Het platform heeft geen gedeelde invoer- of
// knopcomponenten; deze leven daarom hier, en alle schermen van de planner
// gebruiken ze — geen losse varianten per scherm.

export const ACCENT = '#3A913F'

/** Gemeenschappelijk voor tekstvelden, keuzelijsten en getallen: hoogte 36px. */
const control =
  'w-full h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-500 transition-colors ' +
  'focus:outline-none focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500/50 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export const inputCls = `${control} px-3`
export const textareaCls =
  'w-full min-h-[4.5rem] px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-500 resize-y transition-colors ' +
  'focus:outline-none focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500/50 disabled:opacity-60 disabled:cursor-not-allowed'
export const labelCls = 'block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5 truncate'

/** Ruimte tussen velden in een formulier, en tussen kolommen in een rij. */
export const formGap = 'space-y-3'
export const rowGap = 'grid gap-3 items-end'

export const PALETTE = [
  '#3A913F', '#22c55e', '#facc15', '#f59e0b', '#f97316', '#c2410c',
  '#ec4899', '#be185d', '#a855f7', '#6d28d9', '#0ea5e9', '#2563eb',
  '#22d3ee', '#0891b2', '#64748b', '#71717a',
]

// ─── Velden ──────────────────────────────────────────────────────────────────

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block min-w-0 ${className}`}><span className={labelCls}>{label}</span>{children}</label>
}

/** Keuzelijst met hetzelfde pijltje overal (de pijl van de browser verdwijnt). */
export function Select({ className = '', wrapperClassName = 'w-full', highlighted, children, ...props }:
  SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string; highlighted?: boolean }) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select {...props}
        className={`${control} appearance-none pl-3 pr-8 truncate ${highlighted ? '!border-emerald-500/60 !bg-emerald-500/10 !text-emerald-200' : ''} ${className}`}>
        {children}
      </select>
      <ChevronDown size={14} aria-hidden
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${highlighted ? 'text-emerald-300' : 'text-zinc-500'}`} />
    </div>
  )
}

/**
 * Tekstveld met suggesties (datalist), met hetzelfde pijltje als een
 * keuzelijst. De eigen pijl van de browser wordt onzichtbaar, maar blijft
 * aanklikbaar onder het onze.
 */
export function ComboInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative w-full">
      <input {...props} className={`${inputCls} pr-8 [&::-webkit-calendar-picker-indicator]:opacity-0 ${className}`} />
      <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
    </div>
  )
}

/** Gesegmenteerde keuze: gelijke breedtes, labels op één regel. */
export function Segmented<T extends string>({ value, options, onChange, label, disabled }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className="grid h-9 p-0.5 rounded-lg bg-zinc-950 border border-zinc-800"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled} title={o.label}
          onClick={() => onChange(o.value)}
          className={`h-full min-w-0 px-2 rounded-md text-xs font-medium whitespace-nowrap truncate transition-colors disabled:cursor-default ${
            value === o.value ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Knoppen ─────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'danger' | 'destructive' | 'text'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 flex-shrink-0 rounded-lg font-medium whitespace-nowrap transition-colors ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50'
const BUTTON_SIZE = { sm: 'h-8 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' }
const BUTTON_VARIANT: Record<Variant, string> = {
  primary:     'bg-[#3A913F] text-white hover:bg-[#347f38]',
  secondary:   'border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800',
  danger:      'border border-red-900/60 bg-transparent text-red-400 hover:bg-red-950/40',
  destructive: 'bg-red-700 text-white hover:bg-red-600',
  text:        'text-zinc-400 hover:text-zinc-200 !px-2',
}

/** De klassen van een knop, voor een link die eruit moet zien als knop. */
export function buttonCls(variant: Variant = 'secondary', size: 'sm' | 'md' = 'md') {
  return `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]}`
}

export function Button({ variant = 'secondary', size = 'md', busy, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button type="button" {...props} disabled={props.disabled || busy}
      className={`${buttonCls(variant, size)} ${className}`}>
      {busy && <Loader2 size={size === 'sm' ? 12 : 13} className="animate-spin" />}
      {children}
    </button>
  )
}

/** De groene hoofdknop; zelfde als <Button variant="primary">. */
export function PrimaryButton({ onClick, busy, disabled, children, size = 'md' }: {
  onClick: () => void; busy?: boolean; disabled?: boolean; children: ReactNode; size?: 'sm' | 'md'
}) {
  return <Button variant="primary" size={size} onClick={onClick} busy={busy} disabled={disabled}>{children}</Button>
}

export function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`tap-target w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 ${
        danger ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-500 hover:text-zinc-200'}`}>
      {children}
    </button>
  )
}

// ─── Kenmerken en meldingen ──────────────────────────────────────────────────

const STATUS_STYLE: Record<UnitStatus, string> = {
  ok:         'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  beperkt:    'text-amber-300 border-amber-500/30 bg-amber-500/10',
  defect:     'text-red-400 border-red-500/40 bg-red-500/10',
  uit_dienst: 'text-zinc-400 border-zinc-600 bg-zinc-800/60',
}

export function StatusBadge({ status }: { status: UnitStatus }) {
  return (
    <span className={`inline-flex items-center flex-shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400">
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

export function ColorDots({ value, onChange, size = 18 }: { value: string; onChange: (c: string) => void; size?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PALETTE.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Kleur ${c}`} aria-pressed={value === c}
          className="rounded-full flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          style={{ width: size, height: size, backgroundColor: c, border: value === c ? '2px solid #fff' : '2px solid transparent' }} />
      ))}
    </div>
  )
}

// ─── Gegevens ────────────────────────────────────────────────────────────────

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

/** Wie verantwoordelijke kan zijn: klanten en collega's. */
export interface People {
  clients: GearClientRef[]
  colleagues: { id: string; name: string }[]
}

/** Verantwoordelijke kiezen: niemand, een klant, of een collega. */
export function ResponsiblePicker({ value, onChange, people, disabled }: {
  value: { client: string | null; user: string | null; name: string | null }
  onChange: (v: { responsible_client_id: string | null; responsible_user_id: string | null }) => void
  people: People
  disabled?: boolean
}) {
  const current = value.client ? `client:${value.client}` : value.user ? `user:${value.user}` : ''
  const knownUser = !value.user || people.colleagues.some(c => c.id === value.user)
  return (
    <Select value={current} disabled={disabled} aria-label="Verantwoordelijke"
      onChange={e => {
        const [kind, id] = e.target.value.split(':')
        onChange({ responsible_client_id: kind === 'client' ? id : null, responsible_user_id: kind === 'user' ? id : null })
      }}>
      <option value="">— Geen (van iedereen) —</option>
      <optgroup label="Klanten">
        {people.clients.map(c => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}
      </optgroup>
      <optgroup label="Collega's">
        {people.colleagues.map(c => <option key={c.id} value={`user:${c.id}`}>{c.name}</option>)}
        {!knownUser && <option value={`user:${value.user}`}>{value.name ?? 'Collega'}</option>}
      </optgroup>
    </Select>
  )
}

/**
 * Contactpersoon bij de verantwoordelijke: een collega met een account, of —
 * als die er (nog) geen heeft — een naam als vrije tekst.
 */
export function ContactPicker({ value, onChange, people, disabled }: {
  value: { user: string | null; name: string | null }
  onChange: (v: { contact_user_id: string | null; contact_name: string | null }) => void
  people: People
  disabled?: boolean
}) {
  const freeText = !value.user && !!value.name
  const [typing, setTyping] = useState(freeText)
  const [name, setName] = useState(freeText ? value.name ?? '' : '')
  const knownUser = !value.user || people.colleagues.some(c => c.id === value.user)
  const current = value.user ? `user:${value.user}` : typing ? 'vrij' : ''
  return (
    <div className="space-y-1.5">
      <Select value={current} disabled={disabled} aria-label="Contactpersoon"
        onChange={e => {
          const v = e.target.value
          if (v === 'vrij') { setTyping(true); return }
          setTyping(false); setName('')
          onChange({ contact_user_id: v ? v.slice(5) : null, contact_name: null })
        }}>
        <option value="">— Geen —</option>
        <optgroup label="Collega's">
          {people.colleagues.map(c => <option key={c.id} value={`user:${c.id}`}>{c.name}</option>)}
          {!knownUser && <option value={`user:${value.user}`}>{value.name ?? 'Collega'}</option>}
        </optgroup>
        <option value="vrij">Iemand zonder account…</option>
      </Select>
      {typing && !value.user && (
        <input value={name} disabled={disabled} onChange={e => setName(e.target.value)} placeholder="Naam van de contactpersoon"
          aria-label="Naam van de contactpersoon" className={inputCls}
          onBlur={() => { if (name.trim() !== (value.name ?? '')) onChange({ contact_user_id: null, contact_name: name.trim() || null }) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      )}
    </div>
  )
}
