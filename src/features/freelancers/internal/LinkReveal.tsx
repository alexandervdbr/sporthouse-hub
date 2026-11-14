'use client'

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Modal } from '@/components/poolwagens/ui'
import { Button } from '@/components/materiaal/ui'
import { shareMessage } from './api'

// Een nieuwe link en/of pincode, ÉÉN keer getoond. De pincode is daarna
// nergens meer op te vragen; alleen te vervangen. Tip: stuur de pincode via
// een ander kanaal dan de link.
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000) } catch { /* geen klembord */ }
  }
  return { copied, copy }
}

export default function LinkReveal({ name, url, pin, onClose }: { name: string; url?: string | null; pin?: string | null; onClose: () => void }) {
  const { copied, copy } = useCopy()
  const message = url ? shareMessage(name, url) : ''
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  return (
    <Modal title={pin ? 'Bewaar deze pincode nu' : 'Link'} onClose={onClose} footer={<Button variant="primary" data-primary onClick={onClose}>Klaar</Button>}>
      {pin && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-xs text-amber-200">Pincode voor {name} — wordt maar één keer getoond</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-3xl font-semibold tracking-[0.3em] text-white">{pin}</span>
            <Button size="sm" onClick={() => copy('pin', pin)}>{copied === 'pin' ? <Check size={14} /> : <Copy size={14} />} Kopiëren</Button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">Tip: stuur de pincode via een ander kanaal dan de link (bv. de link per mail, de pincode per sms).</p>
        </div>
      )}
      {url && (
        <div className="space-y-2">
          <p className="break-all rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => copy('url', url)}>{copied === 'url' ? <Check size={14} /> : <Copy size={14} />} Link kopiëren</Button>
            <Button onClick={() => copy('msg', message)}>{copied === 'msg' ? <Check size={14} /> : <Copy size={14} />} Bericht kopiëren</Button>
            {canShare && <Button onClick={() => navigator.share({ text: message }).catch(() => {})}><Share2 size={14} /> Delen</Button>}
          </div>
        </div>
      )}
    </Modal>
  )
}
