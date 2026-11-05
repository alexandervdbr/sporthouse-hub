'use client'

import { AlertTriangle, Package, UserRound } from 'lucide-react'
import { RESPONSIBLE_NOTICE, responsibleLabel, type EffectiveResponsible } from '@/lib/gear/responsible'
import { STATUS_LABEL } from '@/lib/gear/status'
import type { GearItem, GearKit } from '@/lib/gear/types'

// Naam en kenmerken van een kit of item, zoals in de planner. Het raster, het
// voorraadscherm en het zijpaneel gebruiken dezelfde bouwstenen, zodat een
// stuk materiaal er overal hetzelfde uitziet.

export function ResponsiblePill({ r }: { r: EffectiveResponsible | null }) {
  if (!r) return null
  return (
    <span title={`${RESPONSIBLE_NOTICE} ${responsibleLabel(r)}`}
      className="ml-auto flex-shrink min-w-0 inline-flex items-center gap-0.5 px-1.5 rounded text-[10px] text-amber-300 border border-amber-500/30 bg-amber-500/10">
      <UserRound size={9} className="flex-shrink-0" />
      <span className="truncate">{r.name}</span>
    </span>
  )
}

/** Beperkt (oranje bolletje), defect (rood label), waarschuwing (driehoekje). */
export function ItemBadges({ item }: { item: GearItem }) {
  return (
    <>
      {item.status === 'beperkt' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title={`Beperkt bruikbaar${item.status_note ? `: ${item.status_note}` : ''}`} />}
      {item.status === 'defect' && <span className="flex-shrink-0 px-1 rounded text-[9px] font-bold uppercase text-red-400 border border-red-500/40 bg-red-500/10">defect</span>}
      {item.status === 'uit_dienst' && <span className="flex-shrink-0 px-1 rounded text-[9px] font-bold uppercase text-zinc-400 border border-zinc-600">uit dienst</span>}
      {item.warning && <AlertTriangle size={11} className="text-amber-400/80 flex-shrink-0" aria-label={item.warning} />}
    </>
  )
}

export function itemTitle(item: GearItem): string {
  return [item.name, item.serial_number && `S/N ${item.serial_number}`, item.warning,
    item.status !== 'ok' ? `${STATUS_LABEL[item.status]}${item.status_note ? `: ${item.status_note}` : ''}` : null].filter(Boolean).join(' — ')
}

export function itemNameClass(item: GearItem, part = false): string {
  const off = item.status === 'defect' || item.status === 'uit_dienst'
  return `${part ? 'text-[12px]' : 'text-[13px]'} truncate text-left ${off ? 'line-through text-zinc-600' : part ? 'text-zinc-400' : 'text-zinc-200'}`
}

/** Aantal onderdelen, defecte en beperkte onderdelen, waarschuwing. */
export function KitBadges({ kit, parts }: { kit: GearKit; parts: GearItem[] }) {
  const defect = parts.filter(p => p.status === 'defect' || p.status === 'uit_dienst').length
  const limited = parts.filter(p => p.status === 'beperkt').length
  return (
    <>
      <span className="text-[10px] text-zinc-600 flex-shrink-0">{parts.length}</span>
      {defect > 0 && <span className="flex-shrink-0 px-1 rounded text-[9px] font-bold text-red-400 border border-red-500/40 bg-red-500/10" title={`${defect} onderdeel defect of uit dienst`}>{defect} defect</span>}
      {limited > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title={`${limited} onderdeel beperkt bruikbaar`} />}
      {kit.warning && <AlertTriangle size={11} className="text-amber-400/80 flex-shrink-0" aria-label={kit.warning} />}
    </>
  )
}

export function KitIcon() {
  return <Package size={12} className="text-zinc-500 flex-shrink-0" aria-hidden />
}
