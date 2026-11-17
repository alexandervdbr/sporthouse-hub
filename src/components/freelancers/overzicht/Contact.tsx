'use client'

import { Copy, Link2, Mail, Phone } from 'lucide-react'
import type { Freelancer } from './types'
import { copyValue, linkLabel, mailHref, telHref } from './logic'

// Contact met één klik. Een icoon zonder gegevens is er niet (niet grijs);
// zijn plek blijft leeg, zodat de iconen in de kolom onder elkaar staan.
// stopPropagation: een klik op een icoon opent het paneel niet.

const icon = 'flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400'
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export function ContactIcons({ f, onCopied }: { f: Freelancer; onCopied: (msg: string) => void }) {
  const value = copyValue(f)
  return (
    <span className="inline-flex items-center" onClick={stop} onKeyDown={stop}>
      {f.phone ? <a href={telHref(f.phone)} className={icon} aria-label={`${f.name} bellen`} title={f.phone}><Phone size={15} /></a> : <span className="w-9" aria-hidden />}
      {f.email ? <a href={mailHref(f.email)} className={icon} aria-label={`${f.name} mailen`} title={f.email}><Mail size={15} /></a> : <span className="w-9" aria-hidden />}
      {value && (
        <button type="button" className={icon} aria-label={`${value} kopiëren`} title={`${value} kopiëren`}
          onClick={async () => onCopied((await copyText(value)) ? 'Gekopieerd' : 'Kopiëren lukte niet')}>
          <Copy size={15} />
        </button>
      )}
    </span>
  )
}

export function PortfolioIcon({ f }: { f: Freelancer }) {
  const first = f.portfolio_links[0]
  if (!first) return <span className="text-zinc-600">—</span>
  const more = f.portfolio_links.length - 1
  return (
    <a href={first.url} target="_blank" rel="noopener noreferrer" onClick={stop} className={`${icon} w-auto gap-1 px-2`}
      aria-label={`Portfolio: ${linkLabel(first)}`} title={f.portfolio_links.map(linkLabel).join(' · ')}>
      <Link2 size={15} />{more > 0 && <span className="text-xs">+{more}</span>}
    </a>
  )
}
