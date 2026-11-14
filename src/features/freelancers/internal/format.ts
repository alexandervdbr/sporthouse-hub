import type { Freelancer } from './types'

export const FREELANCER_STATUS: Record<Freelancer['status'], string> = {
  vast: 'Vast', proefopdracht: 'Proefopdracht', kandidaat: 'Kandidaat', inactief: 'Inactief',
}

export const AVAILABILITY: Record<Freelancer['availability'], { label: string; dot: string }> = {
  beschikbaar: { label: 'Beschikbaar', dot: 'bg-emerald-500' },
  beperkt: { label: 'Beperkt', dot: 'bg-amber-400' },
  niet_beschikbaar: { label: 'Niet beschikbaar', dot: 'bg-red-500' },
}

export const ASSIGNMENT_STATUS: Record<string, { label: string; cls: string }> = {
  concept: { label: 'Concept', cls: 'text-zinc-300 border-zinc-600 bg-zinc-800' },
  gedeeld: { label: 'Gedeeld', cls: 'text-sky-300 border-sky-500/40 bg-sky-500/10' },
  geaccepteerd: { label: 'Geaccepteerd', cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
  geweigerd: { label: 'Geweigerd', cls: 'text-red-300 border-red-500/40 bg-red-500/10' },
  opgeleverd: { label: 'Opgeleverd', cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  afgerond: { label: 'Afgerond', cls: 'text-zinc-300 border-zinc-600 bg-zinc-800/60' },
  geannuleerd: { label: 'Geannuleerd', cls: 'text-zinc-500 border-zinc-700 bg-transparent' },
}

/** "★ 4 · opdrachten 4,3 (7)"; ontbrekende delen vallen weg. */
export function ratingText(f: Pick<Freelancer, 'overall_rating' | 'stats'>): string {
  const parts: string[] = []
  if (f.overall_rating != null) parts.push(`★ ${f.overall_rating}`)
  if (f.stats?.review_avg != null) parts.push(`opdrachten ${String(f.stats.review_avg).replace('.', ',')} (${f.stats.review_count})`)
  return parts.join(' · ')
}

export function rateText(f: Pick<Freelancer, 'rate_amount' | 'rate_unit' | 'rate_note'>): string {
  const amount = f.rate_amount != null && f.rate_unit
    ? `€${new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 }).format(f.rate_amount)} / ${f.rate_unit}` : ''
  return [amount, f.rate_note].filter(Boolean).join(' — ')
}

export function ago(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86400_000)
  if (days <= 0) return 'vandaag'
  if (days === 1) return 'gisteren'
  if (days < 30) return `${days} dagen geleden`
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "door freelancer, 3 dagen geleden" */
export function availabilitySource(f: Pick<Freelancer, 'availability_updated_at' | 'availability_updated_by'>): string | null {
  if (!f.availability_updated_at) return null
  return `door ${f.availability_updated_by === 'freelancer' ? 'freelancer' : 'team'}, ${ago(f.availability_updated_at)}`
}

export function shortDate(d: string) {
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}

export { relativeDeadline, fileSize, longDate } from '../public/format'
