'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/components/materiaal/ui'

// Melding onderaan het scherm, met een optionele knop ("Ongedaan maken").
// Verdwijnt na `ms` milliseconden, tenzij er details zijn die je moet lezen.

export interface ToastData {
  id: number
  message: string
  details?: string[]
  tone?: 'info' | 'warn'
  action?: { label: string; onClick: () => void }
  ms?: number
}

export default function Toast({ toast, onClose }: { toast: ToastData; onClose: () => void }) {
  useEffect(() => {
    if (toast.details?.length) return
    const t = window.setTimeout(onClose, toast.ms ?? 8000)
    return () => window.clearTimeout(t)
  }, [toast, onClose])

  return (
    <div role="status" aria-live="polite"
      className="fixed z-[70] bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,32rem)] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl px-4 py-3"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-2">
        <p className={`flex-1 min-w-0 text-sm ${toast.tone === 'warn' ? 'text-amber-200' : 'text-zinc-100'}`}>{toast.message}</p>
        {toast.action && (
          <Button size="sm" variant="text" onClick={toast.action.onClick} className="!text-emerald-400 hover:!text-emerald-300">
            {toast.action.label}
          </Button>
        )}
        <IconButton label="Sluiten" onClick={onClose}><X size={14} /></IconButton>
      </div>
      {toast.details && toast.details.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">{toast.details.map((d, i) => <li key={i} className="text-xs text-amber-300">{d}</li>)}</ul>
      )}
    </div>
  )
}
