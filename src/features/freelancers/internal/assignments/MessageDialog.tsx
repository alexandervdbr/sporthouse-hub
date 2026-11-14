'use client'

import { useState } from 'react'
import { Modal } from '@/components/poolwagens/ui'
import { Button, ErrorLine, Field, textareaCls } from '@/components/materiaal/ui'

// Bevestigen van een minder gewone stap, met een bericht. Bij "Terugsturen
// met feedback" is het bericht verplicht en ziet de freelancer het.
export default function MessageDialog({ title, explain, label, required, confirm, destructive, onClose, onConfirm }: {
  title: string; explain: string; label: string; required: boolean; confirm: string; destructive?: boolean
  onClose: () => void; onConfirm: (message: string) => Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function go() {
    if (required && !message.trim()) { setError('Schrijf een bericht.'); return }
    setBusy(true); setError('')
    try { await onConfirm(message.trim()) } catch (err) { setError((err as Error).message); setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <Button onClick={onClose}>Terug</Button>
      <Button variant={destructive ? 'destructive' : 'primary'} data-primary busy={busy} onClick={go}>{confirm}</Button>
    </>}>
      <p className="text-sm text-zinc-300">{explain}</p>
      <Field label={label}><textarea autoFocus value={message} onChange={e => setMessage(e.target.value)} className={textareaCls} maxLength={2000} /></Field>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  )
}
