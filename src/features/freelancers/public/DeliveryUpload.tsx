'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, RotateCw, Upload } from 'lucide-react'
import { putFileToDrive } from '@/lib/drive-upload-client'
import { api } from './api'
import { fileSize } from './format'

// Bestanden opleveren, rechtstreeks van de gsm of computer naar Drive: de
// bytes gaan niet door onze server. Meerdere tegelijk, voortgang per bestand,
// opnieuw proberen bij een fout. Zonder `accept` biedt een gsm zelf de keuze
// tussen camerarol en bestanden.

type Item = { key: string; file: File; progress: number; status: 'bezig' | 'klaar' | 'fout'; error?: string }

export default function DeliveryUpload({ assignmentId, onUploaded }: { assignmentId: string; onUploaded: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const input = useRef<HTMLInputElement>(null)
  const busy = items.some(i => i.status === 'bezig')

  // Wegnavigeren tijdens een upload breekt hem af: eerst waarschuwen.
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  const update = (key: string, patch: Partial<Item>) => setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)))

  async function send(batch: Item[]) {
    let urls: string[]
    try {
      urls = (await api.uploadSession(assignmentId, batch.map(i => ({ name: i.file.name, size: i.file.size, mimeType: i.file.type || 'application/octet-stream' })))).uploadUrls
    } catch (err) {
      batch.forEach(i => update(i.key, { status: 'fout', error: (err as Error).message }))
      return
    }
    const done = await Promise.all(batch.map(async (item, n) => {
      try {
        await putFileToDrive(item.file, urls[n], pct => update(item.key, { progress: pct }))
        return { item, url: urls[n] }
      } catch {
        update(item.key, { status: 'fout', error: 'De verbinding viel weg.' })
        return null
      }
    }))
    const sent = done.filter((d): d is { item: Item; url: string } => !!d)
    if (!sent.length) return
    try {
      const { results } = await api.finalize(assignmentId, sent.map(d => ({ uploadUrl: d.url, size: d.item.file.size })))
      results.forEach((r, n) => update(sent[n].item.key, r.ok ? { status: 'klaar', progress: 100 } : { status: 'fout', error: r.error }))
      if (results.some(r => r.ok)) onUploaded()
    } catch (err) {
      sent.forEach(d => update(d.item.key, { status: 'fout', error: (err as Error).message }))
    }
  }

  function pick(files: FileList | null) {
    if (!files?.length) return
    const batch: Item[] = Array.from(files).map(file => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, progress: 0, status: 'bezig' }))
    setItems(prev => [...prev, ...batch])
    void send(batch)
    if (input.current) input.current.value = ''
  }

  function retry(item: Item) {
    update(item.key, { status: 'bezig', progress: 0, error: undefined })
    void send([{ ...item, status: 'bezig', progress: 0 }])
  }

  return (
    <section aria-labelledby="opleveren" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 id="opleveren" className="text-base font-semibold text-white">Bestanden toevoegen</h2>
      <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files) }}
        className="mt-3 flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
          border-zinc-700 px-4 py-5 text-center text-base text-zinc-300 hover:border-zinc-500 focus-within:ring-2 focus-within:ring-[#3A913F]/50">
        <Upload size={22} aria-hidden />
        <span>Kies of sleep bestanden</span>
        <input ref={input} type="file" multiple className="sr-only" onChange={e => pick(e.target.files)} />
      </label>

      {busy && (
        <p className="mt-3 flex items-start gap-2 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
          Houd deze pagina open tot alle bestanden geüpload zijn.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map(i => (
            <li key={i.key} className="rounded-xl bg-zinc-900 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-base text-zinc-200">{i.file.name}</span>
                <span className="text-sm text-zinc-500">{fileSize(i.file.size)}</span>
                {i.status === 'klaar' && <Check size={18} className="text-emerald-400" aria-label="Klaar" />}
                {i.status === 'fout' && (
                  <button type="button" onClick={() => retry(i)}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-700">
                    <RotateCw size={14} aria-hidden /> Opnieuw
                  </button>
                )}
              </div>
              {i.status === 'bezig' && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar"
                  aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Upload ${i.file.name}`}>
                  <div className="h-full bg-[#3A913F] transition-all" style={{ width: `${i.progress}%` }} />
                </div>
              )}
              {i.status === 'fout' && <p className="mt-1 text-sm text-red-400">{i.error ?? 'Mislukt.'}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
