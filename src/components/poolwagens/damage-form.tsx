'use client'

import { ImagePlus, X } from 'lucide-react'
import { inputCls, labelCls, send } from './ui'
import { putFileToDrive } from '@/lib/drive-upload-client'
import { MAX_PHOTOS } from '@/lib/poolwagens/damage-input'
import { isAllowedPhoto, MAX_PHOTO_BYTES, MAX_PHOTO_LABEL, PHOTO_HINT } from '@/lib/poolwagens/photos'
import type { DamageResult } from '@/lib/poolwagens/arrival-flow'
import type { DamageSeverity } from '@/lib/poolwagens/types'

// De velden en het opslaan van een schademelding, gedeeld door "Schade
// melden" (DamageDialog) en het aankomstformulier (ReservationDetail).
// Eerst wordt de melding opgeslagen; daarna gaan de foto's rechtstreeks naar
// Drive (zoals Pré-assist), en tot slot de mail en de push. Lukt een foto of
// de mail niet, dan blijft de melding gewoon bestaan.

export interface DamageDraft {
  description: string
  severity: DamageSeverity
  files: File[]
}

export const EMPTY_DAMAGE: DamageDraft = { description: '', severity: 'licht', files: [] }

/** Kan dit ontwerp verstuurd worden? Alleen de omschrijving is verplicht. */
export const damageReady = (d: DamageDraft) => !!d.description.trim()

export function DamageFields({ draft, onChange, onError, disabled }: {
  draft: DamageDraft
  onChange: (d: DamageDraft) => void
  /** Een foto die niet mag (type of grootte); '' als alles goed is. */
  onError: (message: string) => void
  disabled?: boolean
}) {
  function addFiles(list: FileList | null) {
    if (!list) return
    const picked = [...list]
    const bad = picked.find(f => !isAllowedPhoto(f.name))
    if (bad) { onError(`${bad.name}: dit bestandstype wordt niet ondersteund. Toegestaan: ${PHOTO_HINT}.`); return }
    const big = picked.find(f => f.size > MAX_PHOTO_BYTES)
    if (big) { onError(`${big.name} is groter dan ${MAX_PHOTO_LABEL}.`); return }
    onError('')
    onChange({ ...draft, files: [...draft.files, ...picked].slice(0, MAX_PHOTOS) })
  }

  return (
    <>
      <div>
        <label className={labelCls}>Omschrijving</label>
        <textarea className={`${inputCls} min-h-24`} value={draft.description} disabled={disabled}
          onChange={e => onChange({ ...draft, description: e.target.value })}
          placeholder="Wat is er beschadigd, en hoe is het gebeurd?" maxLength={2000} />
      </div>

      <div>
        <span className={labelCls}>Ernst</span>
        <div className="flex gap-2">
          {(['licht', 'ernstig'] as const).map(s => (
            <button key={s} type="button" disabled={disabled} onClick={() => onChange({ ...draft, severity: s })} aria-pressed={draft.severity === s}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm text-left ${draft.severity === s
                ? s === 'ernstig' ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-amber-500 bg-amber-500/10 text-amber-200'
                : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800/50'}`}>
              <div className="font-medium">{s === 'licht' ? 'Licht' : 'Ernstig'}</div>
              <div className="text-[11px] opacity-80">{s === 'licht' ? 'Kras, deukje: rijden kan.' : 'Blokkeert de wagen voor nieuwe reservaties.'}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelCls}>Foto’s ({draft.files.length}/{MAX_PHOTOS})</span>
        <div className="flex flex-wrap gap-2">
          {draft.files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-300 max-w-full">
              <span className="truncate">{f.name}</span>
              {!disabled && (
                <button type="button" onClick={() => onChange({ ...draft, files: draft.files.filter((_, j) => j !== i) })} aria-label={`${f.name} weghalen`}>
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
          {draft.files.length < MAX_PHOTOS && !disabled && (
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
              <ImagePlus size={13} /> Foto toevoegen
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </label>
          )}
        </div>
      </div>
    </>
  )
}


/**
 * Melding opslaan, foto's uploaden, verantwoordelijke verwittigen. Mislukt
 * de melding zelf, dan { ok: false } en is er niets opgeslagen (opnieuw
 * proberen kan veilig). Mislukt alleen een foto, dan is de melding er wel.
 */
export async function submitDamage({ carId, reservationId, draft, onProgress }: {
  carId: string
  reservationId: string | null
  draft: DamageDraft
  onProgress: (text: string) => void
}): Promise<DamageResult> {
  let reportId: string
  try {
    onProgress('Melding opslaan…')
    reportId = (await send<{ id: string }>('/api/poolwagens/damage', 'POST', {
      car_id: carId, reservation_id: reservationId, description: draft.description, severity: draft.severity,
    })).id
  } catch (e) {
    onProgress('')
    return { ok: false, error: (e as Error).message }
  }

  // Vanaf hier is de melding opgeslagen; wat volgt mag mislukken.
  const failed: string[] = []
  const files = draft.files
  for (const [i, file] of files.entries()) {
    try {
      onProgress(`Foto ${i + 1} van ${files.length} uploaden…`)
      const { uploadUrl } = await send<{ uploadUrl: string }>('/api/poolwagens/damage/upload-session', 'POST', {
        report_id: reportId, filename: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size,
      })
      await putFileToDrive(file, uploadUrl, pct => onProgress(`Foto ${i + 1} van ${files.length}: ${pct}%`))
      await send('/api/poolwagens/damage/finalize', 'POST', { report_id: reportId, uploadUrl, fileSize: file.size })
    } catch {
      failed.push(file.name)
    }
  }

  onProgress('Verantwoordelijke verwittigen…')
  await send('/api/poolwagens/damage/' + reportId + '/notify', 'POST').catch(() => {})
  onProgress('')

  return {
    ok: true,
    message: failed.length
      ? `Melding opgeslagen, maar ${failed.length === 1 ? 'deze foto kwam' : 'deze foto’s kwamen'} niet aan: ${failed.join(', ')}.`
      : draft.severity === 'ernstig'
        ? 'Melding opgeslagen. De wagen is geblokkeerd voor nieuwe reservaties tot de schade hersteld is.'
        : 'Melding opgeslagen.',
  }
}
