'use client'

import { Paperclip, X } from 'lucide-react'
import { putFileToDrive } from '@/lib/drive-upload-client'
import { internalApi } from '../api'
import { fileSize } from '../format'

// Bijlagen kiezen vóór de opdracht bestaat; uploaden gebeurt zodra ze
// aangemaakt is (rechtstreeks naar Drive, met voortgang per bestand).
export type Pending = { key: string; file: File; progress: number; error?: string }

export async function uploadPending(assignmentId: string, items: Pending[], onProgress: (key: string, pct: number) => void): Promise<string[]> {
  if (!items.length) return []
  const { uploadUrls } = await internalApi.uploadSession(assignmentId, items.map(i => ({ name: i.file.name, size: i.file.size, mimeType: i.file.type || 'application/octet-stream' })))
  const sent = await Promise.all(items.map(async (i, n) => {
    try { await putFileToDrive(i.file, uploadUrls[n], pct => onProgress(i.key, pct)); return { uploadUrl: uploadUrls[n], size: i.file.size } } catch { return null }
  }))
  const ok = sent.filter((s): s is { uploadUrl: string; size: number } => !!s)
  const { results } = ok.length ? await internalApi.finalize(assignmentId, ok) : { results: [] }
  const failed = items.length - results.filter(r => r.ok).length
  return failed ? [`${failed} bijlage(n) niet geüpload. Voeg ze opnieuw toe in de opdracht.`] : []
}

export default function PendingFiles({ items, onChange, busy }: { items: Pending[]; onChange: (items: Pending[]) => void; busy: boolean }) {
  const add = (files: FileList | null) => files && onChange([...items, ...Array.from(files).map(file => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, progress: 0 }))])
  return (
    <div className="space-y-2">
      <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(e.dataTransfer.files) }}
        className="flex min-h-[64px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 px-4 text-sm text-zinc-300 hover:border-zinc-500">
        <Paperclip size={16} aria-hidden /> Sleep bestanden hierheen of kies
        <input type="file" multiple className="sr-only" disabled={busy} onChange={e => { add(e.target.files); e.target.value = '' }} />
      </label>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map(i => (
            <li key={i.key} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-zinc-200">{i.file.name}</span>
              <span className="text-xs text-zinc-500">{busy ? `${i.progress}%` : fileSize(i.file.size)}</span>
              {!busy && <button type="button" aria-label={`${i.file.name} weghalen`} onClick={() => onChange(items.filter(x => x.key !== i.key))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800"><X size={14} /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
