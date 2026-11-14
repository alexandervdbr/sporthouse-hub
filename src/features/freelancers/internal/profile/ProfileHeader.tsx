'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Camera, Check, Copy, ExternalLink, Mail, Phone } from 'lucide-react'
import { Select, buttonCls, send } from '@/components/materiaal/ui'
import { createClient } from '@/lib/supabase/client'
import { internalApi } from '../api'
import { Avatar, AvailabilityDot, Chip } from '../ui'
import { FREELANCER_STATUS, availabilitySource, ratingText, shortDate } from '../format'
import { useCopy } from '../LinkReveal'
import type { Freelancer } from '../types'

// Bovenaan het profiel: foto, naam, status (inline te wijzigen bij beheren),
// disciplines, beoordeling, beschikbaarheid, contact, portfolio en de knop
// "Nieuwe opdracht" (met deze freelancer al ingevuld).
export default function ProfileHeader({ f, labels, canManage, onChange }: {
  f: Freelancer; labels: Record<string, string>; canManage: boolean; onChange: (f: Freelancer) => void
}) {
  const { copied, copy } = useCopy()
  const fileInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  async function setStatus(status: Freelancer['status']) {
    onChange(await internalApi.update(f.id, { status }))
  }

  // Foto rechtstreeks naar Storage (signed upload); de server controleert en koppelt.
  async function uploadPhoto(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    try {
      const { path, token } = await send<{ path: string; token: string }>(`/api/freelancers/${f.id}/avatar`, 'POST', { contentType: file.type, size: file.size })
      const { error } = await createClient().storage.from('freelancer-avatars').uploadToSignedUrl(path, token, file, { contentType: file.type })
      if (error) throw error
      onChange(await send<Freelancer>(`/api/freelancers/${f.id}/avatar`, 'PUT', { path }))
    } catch { /* de foto blijft zoals ze was */ } finally { setPhotoBusy(false) }
  }

  const contact = [f.phone, f.email].filter(Boolean).join(' · ')
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar name={f.name} url={f.avatar_url} size={64} />
          {canManage && (
            <>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={photoBusy} aria-label="Foto wijzigen"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white">
                <Camera size={14} />
              </button>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={e => uploadPhoto(e.target.files?.[0])} />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold text-white">{f.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            {canManage ? (
              <Select value={f.status} onChange={e => setStatus(e.target.value as Freelancer['status'])} wrapperClassName="w-40" aria-label="Status">
                {(Object.keys(FREELANCER_STATUS) as Freelancer['status'][]).map(s => <option key={s} value={s}>{FREELANCER_STATUS[s]}</option>)}
              </Select>
            ) : <span>{FREELANCER_STATUS[f.status]}</span>}
            {f.archived_at && <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400">Gearchiveerd</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">{f.disciplines.map(d => <Chip key={d}>{labels[d] ?? d}</Chip>)}</div>

      <dl className="space-y-1.5 text-sm">
        {ratingText(f) && <div className="text-zinc-200">{ratingText(f)}</div>}
        <div className="text-zinc-300">
          <AvailabilityDot value={f.availability} />
          {f.available_from && f.availability !== 'beschikbaar' && <span className="text-zinc-500"> · vanaf {shortDate(f.available_from)}</span>}
          {availabilitySource(f) && <div className="text-xs text-zinc-500">{availabilitySource(f)}</div>}
        </div>
      </dl>

      {(f.phone || f.email) && (
        <div className="flex flex-wrap gap-2">
          {f.phone && <a href={`tel:${f.phone.replace(/\s+/g, '')}`} className={`${buttonCls('secondary')} !h-11 sm:!h-9`}><Phone size={14} /> Bellen</a>}
          {f.email && <a href={`mailto:${f.email}`} className={`${buttonCls('secondary')} !h-11 sm:!h-9`}><Mail size={14} /> Mailen</a>}
          <button type="button" onClick={() => copy('contact', contact)} className={`${buttonCls('secondary')} !h-11 sm:!h-9`}>
            {copied === 'contact' ? <Check size={14} /> : <Copy size={14} />} Kopiëren
          </button>
        </div>
      )}

      {f.portfolio_links.length > 0 && (
        <ul className="space-y-1 text-sm">
          {f.portfolio_links.map(l => (
            <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[32px] items-center gap-1.5 break-all text-[#5fbf64] hover:underline"><ExternalLink size={13} className="flex-shrink-0" />{l.label}</a></li>
          ))}
        </ul>
      )}

      {canManage && !f.archived_at && (
        <Link href={`/freelancers/opdrachten/nieuw?freelancer=${f.id}`} className={`${buttonCls('primary')} hidden w-full md:inline-flex`}>Nieuwe opdracht</Link>
      )}
    </div>
  )
}
