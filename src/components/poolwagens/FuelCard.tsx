'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Fuel, Loader2 } from 'lucide-react'
import { ErrorLine, secondaryCls, send } from './ui'
import { PIN_VISIBLE_MS } from '@/lib/poolwagens/fuel-card'

// De tankkaart bij een wagen: de laatste vier tekens naast de nummerplaat, en
// tijdens de rit de pincode op vraag (zie src/lib/poolwagens/fuel-card.ts).

/** "••1234" met een pompje, naast de nummerplaat. Niets als er geen kaart is. */
export function FuelTag({ last4, className = '' }: { last4: string | null; className?: string }) {
  if (!last4) return null
  return (
    <span title="Tankkaart" className={`inline-flex items-center gap-0.5 text-[10px] font-mono text-zinc-500 flex-shrink-0 ${className}`}>
      <Fuel size={10} aria-hidden /><span className="sr-only">Tankkaart </span>••{last4}
    </span>
  )
}

/**
 * "Toon pincode": haalt de pincode op (de database beslist of je ze mag zien)
 * en verbergt ze na 30 seconden weer. Ze wordt nergens bewaard.
 */
export function FuelPin({ carId, last4 }: { carId: string; last4: string | null }) {
  const [pin, setPin] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pin) return
    const t = setTimeout(() => setPin(null), PIN_VISIBLE_MS)
    return () => clearTimeout(t)
  }, [pin])

  async function show() {
    setBusy(true)
    setError('')
    try {
      const res = await send<{ pin: string | null }>(`/api/poolwagens/cars/${carId}/pin`, 'POST')
      if (res.pin) setPin(res.pin)
      else setError('Voor deze wagen is geen pincode ingesteld.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-zinc-400 flex items-center gap-1.5"><Fuel size={13} /> Tankkaart{last4 ? ` ••${last4}` : ''}</div>
          {pin ? (
            <div className="mt-1 text-2xl font-mono font-semibold tracking-[0.3em] text-zinc-100" aria-live="polite">{pin}</div>
          ) : (
            <div className="mt-1 text-xs text-zinc-500">De pincode blijft 30 seconden zichtbaar.</div>
          )}
        </div>
        {pin ? (
          <button type="button" onClick={() => setPin(null)} className={`${secondaryCls} min-h-11 md:min-h-0 flex-shrink-0`}><EyeOff size={13} /> Verbergen</button>
        ) : (
          <button type="button" onClick={show} disabled={busy} className={`${secondaryCls} min-h-11 md:min-h-0 flex-shrink-0`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Toon pincode
          </button>
        )}
      </div>
      <ErrorLine>{error}</ErrorLine>
    </div>
  )
}
