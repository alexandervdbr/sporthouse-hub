'use client'

import { useState } from 'react'
import { Flag, ImagePlus, Loader2, X } from 'lucide-react'
import { ErrorLine, Modal, buttonCls, inputCls, labelCls, secondaryCls, send } from './ui'
import { putFileToDrive } from '@/lib/drive-upload-client'
import { MAX_PHOTOS } from '@/lib/poolwagens/damage-input'
import { isAllowedPhoto, MAX_PHOTO_BYTES, MAX_PHOTO_LABEL, PHOTO_HINT } from '@/lib/poolwagens/photos'
import type { DamageSeverity, PoolCar } from '@/lib/poolwagens/types'

// Schade melden: omschrijving, ernst, foto's. Eerst wordt de melding
// opgeslagen; daarna gaan de foto's rechtstreeks naar Drive (zoals
// Pré-assist), en tot slot de mail en de push. Lukt een foto of de mail
// niet, dan blijft de melding gewoon bestaan.

export default function DamageDialog({ cars, carId, reservationId, onClose, onSaved }: {
  cars: PoolCar[]
  carId: string
  reservationId: string | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [car, setCar] = useState(carId)
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<DamageSeverity>('licht')
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function addFiles(list: FileList | null) {
    if (!list) return
    const picked = [...list]
    const bad = picked.find(f => !isAllowedPhoto(f.name))
    if (bad) { setError(`${bad.name}: dit bestandstype wordt niet ondersteund. Toegestaan: ${PHOTO_HINT}.`); return }
    const big = picked.find(f => f.size > MAX_PHOTO_BYTES)
    if (big) { setError(`${big.name} is groter dan ${MAX_PHOTO_LABEL}.`); return }
    setError('')
    setFiles(prev => [...prev, ...picked].slice(0, MAX_PHOTOS))
  }

  async function submit() {
    setBusy(true)
    setError('')
    let reportId: string
    try {
      setProgress('Melding opslaan…')
      reportId = (await send<{ id: string }>('/api/poolwagens/damage', 'POST', {
        car_id: car, reservation_id: reservationId, description, severity,
      })).id
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      setProgress('')
      return
    }

    // Vanaf hier is de melding opgeslagen; wat volgt mag mislukken.
    const failed: string[] = []
    for (const [i, file] of files.entries()) {
      try {
        setProgress(`Foto ${i + 1} van ${files.length} uploaden…`)
        const { uploadUrl } = await send<{ uploadUrl: string }>('/api/poolwagens/damage/upload-session', 'POST', {
          report_id: reportId, filename: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size,
        })
        await putFileToDrive(file, uploadUrl, pct => setProgress(`Foto ${i + 1} van ${files.length}: ${pct}%`))
        await send('/api/poolwagens/damage/finalize', 'POST', { report_id: reportId, uploadUrl, fileSize: file.size })
      } catch {
        failed.push(file.name)
      }
    }

    setProgress('Verantwoordelijke verwittigen…')
    await send('/api/poolwagens/damage/' + reportId + '/notify', 'POST').catch(() => {})

    onSaved(failed.length
      ? `Melding opgeslagen, maar ${failed.length === 1 ? 'deze foto kwam' : 'deze foto’s kwamen'} niet aan: ${failed.join(', ')}.`
      : severity === 'ernstig'
        ? 'Melding opgeslagen. De wagen is geblokkeerd voor nieuwe reservaties tot de schade hersteld is.'
        : 'Melding opgeslagen.')
  }

  return (
    <Modal title="Schade melden" onClose={busy ? () => {} : onClose} footer={
      <>
        {progress && <span className="mr-auto text-xs text-zinc-500">{progress}</span>}
        <button onClick={onClose} disabled={busy} className={secondaryCls}>Annuleren</button>
        <button onClick={submit} disabled={busy || !car || !description.trim()} className={`${buttonCls} text-white bg-red-600 hover:bg-red-500`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />} Melden
        </button>
      </>
    }>
      <div>
        <label className={labelCls}>Wagen</label>
        <select className={inputCls} value={car} onChange={e => setCar(e.target.value)} disabled={!!reservationId || busy}>
          {cars.filter(c => !c.archived_at).map(c => <option key={c.id} value={c.id}>{c.name} — {c.license_plate}</option>)}
        </select>
        {reservationId && <p className="mt-1 text-xs text-zinc-500">Gekoppeld aan deze rit.</p>}
      </div>

      <div>
        <label className={labelCls}>Omschrijving</label>
        <textarea className={`${inputCls} min-h-24`} value={description} onChange={e => setDescription(e.target.value)} disabled={busy}
          placeholder="Wat is er beschadigd, en hoe is het gebeurd?" maxLength={2000} />
      </div>

      <div>
        <span className={labelCls}>Ernst</span>
        <div className="flex gap-2">
          {(['licht', 'ernstig'] as const).map(s => (
            <button key={s} type="button" disabled={busy} onClick={() => setSeverity(s)} aria-pressed={severity === s}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm text-left ${severity === s
                ? s === 'ernstig' ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-amber-500 bg-amber-500/10 text-amber-200'
                : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800/50'}`}>
              <div className="font-medium">{s === 'licht' ? 'Licht' : 'Ernstig'}</div>
              <div className="text-[11px] opacity-80">{s === 'licht' ? 'Kras, deukje: rijden kan.' : 'Blokkeert de wagen voor nieuwe reservaties.'}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelCls}>Foto’s ({files.length}/{MAX_PHOTOS})</span>
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-300">
              {f.name}
              {!busy && <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} aria-label={`${f.name} weghalen`}><X size={12} /></button>}
            </span>
          ))}
          {files.length < MAX_PHOTOS && !busy && (
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
              <ImagePlus size={13} /> Foto toevoegen
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </label>
          )}
        </div>
      </div>

      <ErrorLine>{error}</ErrorLine>
    </Modal>
  )
}
