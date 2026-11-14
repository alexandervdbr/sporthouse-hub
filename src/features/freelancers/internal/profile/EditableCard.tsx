'use client'

import { useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button, ErrorLine } from '@/components/materiaal/ui'

// Een kaart op het profiel die je apart bewerkt: Opslaan/Annuleren per kaart.
// Zonder beheerrecht is er geen potloodje (niet uitgeschakeld, gewoon weg).
export default function EditableCard({ title, canEdit, view, edit, onSave, onCancel }: {
  title: string; canEdit: boolean; view: ReactNode; edit: ReactNode
  onSave: () => Promise<void>; onCancel?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try { await onSave(); setEditing(false) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`${title} bewerken`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Pencil size={14} /></button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          {edit}
          <ErrorLine>{error}</ErrorLine>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setEditing(false); setError(''); onCancel?.() }}>Annuleren</Button>
            <Button variant="primary" busy={busy} onClick={save}>Opslaan</Button>
          </div>
        </div>
      ) : view}
    </section>
  )
}
