'use client'

import { useState } from 'react'
import { Modal } from '@/components/poolwagens/ui'
import { Button, ErrorLine, Field, textareaCls } from '@/components/materiaal/ui'
import { internalApi } from '../api'
import { Stars } from '../ui'
import type { AssignmentDetail } from '../types'

// "Afronden" opent meteen de review: grote sterren, subscores ingeklapt, een
// opmerking, en "Later beoordelen". Strikt intern; de freelancer ziet dit nooit.
export default function ReviewDialog({ a, onClose, onSaved }: { a: AssignmentDetail; onClose: () => void; onSaved: () => void }) {
  const r = a.review
  const [score, setScore] = useState<number | null>(r?.score ?? null)
  const [sub, setSub] = useState({ score_quality: r?.score_quality ?? null, score_deadline: r?.score_deadline ?? null, score_communication: r?.score_communication ?? null })
  const [comment, setComment] = useState(r?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!score) { setError('Kies een score van 1 tot 5.'); return }
    setBusy(true); setError('')
    try { await internalApi.review(a.id, { score, ...sub, comment: comment || null }); onSaved() }
    catch (err) { setError((err as Error).message); setBusy(false) }
  }

  return (
    <Modal title={`Hoe ging "${a.title}"?`} onClose={onClose} footer={<>
      <Button variant="text" onClick={onClose}>Later beoordelen</Button>
      <Button variant="primary" data-primary busy={busy} onClick={save}>Review opslaan</Button>
    </>}>
      <div className="flex justify-center"><Stars value={score} onChange={setScore} size={32} label="Score" /></div>
      <details className="rounded-lg border border-zinc-800 px-3 py-2">
        <summary className="cursor-pointer text-sm text-zinc-300">Details (optioneel)</summary>
        <div className="mt-2 space-y-1">
          {([['score_quality', 'Kwaliteit'], ['score_deadline', 'Deadline'], ['score_communication', 'Communicatie']] as const).map(([k, label]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-zinc-400">{label}</span>
              <Stars value={sub[k]} onChange={v => setSub(s => ({ ...s, [k]: v }))} size={18} label={label} />
            </div>
          ))}
        </div>
      </details>
      <Field label="Opmerking"><textarea value={comment} onChange={e => setComment(e.target.value)} className={textareaCls} /></Field>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  )
}
