'use client'

import { useState } from 'react'
import { Modal } from '@/components/poolwagens/ui'
import { Button, ErrorLine, Field, inputCls, textareaCls } from '@/components/materiaal/ui'
import { internalApi } from '../api'
import type { AssignmentDetail } from '../types'

// "Bewerken" (via Meer): titel, briefing en deadline. Klant en discipline
// blijven zoals bij het aanmaken; dat volstaat voor een correctie.
export default function EditAssignmentModal({ a, onClose, onSaved }: { a: AssignmentDetail; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(a.title)
  const [briefing, setBriefing] = useState(a.briefing ?? '')
  const [deadline, setDeadline] = useState(a.deadline ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try { await internalApi.updateAssignment(a.id, { title, briefing: briefing || null, deadline: deadline || null }); onSaved() }
    catch (err) { setError((err as Error).message); setBusy(false) }
  }
  return (
    <Modal title="Opdracht bewerken" wide onClose={onClose} footer={<>
      <Button onClick={onClose}>Annuleren</Button>
      <Button variant="primary" data-primary busy={busy} onClick={save}>Opslaan</Button>
    </>}>
      <Field label="Titel"><input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} /></Field>
      <Field label="Briefing"><textarea value={briefing} onChange={e => setBriefing(e.target.value)} className={`${textareaCls} min-h-[12rem]`} /></Field>
      <Field label="Deadline"><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} /></Field>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  )
}
