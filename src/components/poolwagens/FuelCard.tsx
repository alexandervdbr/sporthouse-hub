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
 * Haalt de pincode op vraag op (de database beslist of je ze mag zien) en
 * vergeet ze na 30 seconden weer. Ze wordt nergens bewaard.
 */
function usePin(carId: string) {
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

  return { pin, busy, error, show, hide: () => setPin(null) }
}

/**
 * Compacte knop "Pincode tankkaart ••1234" voor "Mijn ritten" en de "Nu"-kaart:
 * toont de pincode ter plekke in de knop, 30 seconden lang; nog eens klikken
 * verbergt ze. De tekst en de pincode liggen op dezelfde plek op elkaar
 * (de ene onzichtbaar), zodat de knop nooit van breedte verandert en de rest
 * van de pagina niet verspringt. `block`: over de volle breedte.
 */
export function FuelPinButton({ carId, last4, block = false, className = '' }: { carId: string; last4: string | null; block?: boolean; className?: string }) {
  const { pin, busy, error, show, hide } = usePin(carId)
  const layer = 'col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-opacity'
  return (
    <span className={`${block ? 'flex flex-col' : 'inline-flex flex-col'} gap-1 min-w-0 ${className}`}>
      <button type="button" onClick={pin ? hide : show} disabled={busy}
        title={pin ? 'Verbergen' : 'De pincode blijft 30 seconden zichtbaar.'}
        aria-label={pin ? `Pincode ${pin.split('').join(' ')}, tik om te verbergen` : undefined}
        className={`${secondaryCls} justify-center ${block ? 'w-full min-h-11 md:min-h-9' : 'min-h-11 md:min-h-0'}`}>
        <span className="grid">
          <span className={`${layer} ${pin ? 'opacity-0' : ''}`} aria-hidden={!!pin}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Fuel size={13} />}
            <span className="whitespace-nowrap">Pincode tankkaart</span>
            {last4 ? <span className="font-mono text-zinc-500">••{last4}</span> : null}
          </span>
          <span className={`${layer} ${pin ? '' : 'opacity-0'}`} aria-hidden={!pin} aria-live="polite">
            <Fuel size={13} />
            <span className="font-mono font-semibold tracking-[0.3em] text-zinc-100 text-sm">{pin ?? ''}</span>
          </span>
        </span>
      </button>
      {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
    </span>
  )
}

/** "Toon pincode" in de ritdetails, met de pincode groot in beeld. */
export function FuelPin({ carId, last4 }: { carId: string; last4: string | null }) {
  const { pin, busy, error, show, hide } = usePin(carId)

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
          <button type="button" onClick={hide} className={`${secondaryCls} min-h-11 md:min-h-0 flex-shrink-0`}><EyeOff size={13} /> Verbergen</button>
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
