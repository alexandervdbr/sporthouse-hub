'use client'

import { Download, Trash2 } from 'lucide-react'
import DeliveryUpload from '../../public/DeliveryUpload'
import { internalApi } from '../api'
import { fileSize } from '../format'
import type { AssignmentDetail } from '../types'

// Bijlagen (briefing, van het team) en opleveringen (van de freelancer).
// Downloaden = een redirect van de server na de rechtencheck; uploaden gaat
// rechtstreeks van de browser naar Drive (zelfde zone als op de link).
function FileList({ a, files, canManage, onChanged }: { a: AssignmentDetail; files: AssignmentDetail['files']; canManage: boolean; onChanged: () => void }) {
  if (!files.length) return <p className="text-sm text-zinc-500">Geen bestanden.</p>
  return (
    <ul className="space-y-1.5">
      {files.map(f => (
        <li key={f.id} className="flex min-h-[44px] items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5">
          <a href={internalApi.fileUrl(a.id, f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-200 hover:underline">
            <Download size={14} className="flex-shrink-0 text-zinc-500" aria-hidden />
            <span className="truncate">{f.file_name}</span>
            <span className="flex-shrink-0 text-xs text-zinc-500">{fileSize(f.file_size)}</span>
          </a>
          {canManage && (
            <button type="button" aria-label={`${f.file_name} verwijderen`}
              onClick={async () => { await internalApi.deleteFile(a.id, f.id).catch(() => {}); onChanged() }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-red-400"><Trash2 size={14} /></button>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function AssignmentFiles({ a, canManage, onChanged }: { a: AssignmentDetail; canManage: boolean; onChanged: () => void }) {
  const briefing = a.files.filter(f => f.kind === 'briefing')
  const delivered = a.files.filter(f => f.kind === 'oplevering')
  const open = !['afgerond', 'geannuleerd', 'geweigerd'].includes(a.status)
  return (
    <div className="space-y-4">
      <section aria-label="Bijlagen">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Bijlagen (briefing)</h3>
        <FileList a={a} files={briefing} canManage={canManage} onChanged={onChanged} />
        {canManage && open && (
          <div className="mt-2">
            <DeliveryUpload assignmentId={a.id} onUploaded={onChanged} title="Bijlagen toevoegen"
              client={{ uploadSession: internalApi.uploadSession, finalize: internalApi.finalize }} />
          </div>
        )}
      </section>
      <section aria-label="Opleveringen">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Opleveringen</h3>
        <FileList a={a} files={delivered} canManage={false} onChanged={onChanged} />
      </section>
    </div>
  )
}
