'use client'

import { useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { ACCENT, ErrorLine, buttonCls, inputCls, labelCls, secondaryCls, send } from './ui'
import { diffDays } from '@/lib/gear/dates'
import { MAX_RANGE_DAYS } from '@/lib/poolwagens/planning-range'
import { freeCars, type FreeCar } from '@/lib/poolwagens/status'
import { addMinutesLocal, brusselsLocalToISO, formatPeriod, nowLocal } from '@/lib/poolwagens/time'
import type { PoolPlanning } from '@/lib/poolwagens/types'

// "Vind een vrije wagen": kies een periode (standaard nu tot +3 uur) en zie
// welke wagens dan de hele tijd vrij en niet geblokkeerd zijn. Haalt voor die
// periode één keer de planning op (ze kan buiten de getoonde week liggen) en
// past dezelfde regels toe als de server (src/lib/poolwagens/status.ts).

export default function FreeCarFinder({ onReserve }: { onReserve: (carId: string, start: string, end: string) => void }) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [result, setResult] = useState<{ cars: FreeCar[]; start: string; end: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const startISO = brusselsLocalToISO(start)
  const endISO = brusselsLocalToISO(end)
  const problem = !startISO || !endISO ? 'Kies een vertrek en een verwachte terugkomst.'
    : Date.parse(endISO) <= Date.parse(startISO) ? 'De terugkomst ligt na het vertrek.'
    : diffDays(start.slice(0, 10), end.slice(0, 10)) + 1 > MAX_RANGE_DAYS ? `Kies een periode van hoogstens ${MAX_RANGE_DAYS} dagen.`
    : null

  async function search(s: string, e: string) {
    const sISO = brusselsLocalToISO(s), eISO = brusselsLocalToISO(e)
    if (!sISO || !eISO) return
    setBusy(true)
    setError('')
    try {
      const p = await send<PoolPlanning>(`/api/poolwagens/planning?from=${s.slice(0, 10)}&to=${e.slice(0, 10)}`, 'GET')
      setResult({ cars: freeCars(p, sISO, eISO, new Date(p.now)), start: s, end: e })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openFinder() {
    const s = nowLocal()
    const e = addMinutesLocal(s, 180) ?? s
    setStart(s); setEnd(e); setResult(null); setOpen(true)
    search(s, e)
  }

  if (!open) {
    return (
      <button onClick={openFinder} className={`${secondaryCls} min-h-11 md:min-h-0`}>
        <Search size={13} /> Vind een vrije wagen
      </button>
    )
  }

  const stale = result && (result.start !== start || result.end !== end)

  return (
    <section aria-label="Vind een vrije wagen" className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Vind een vrije wagen</h2>
        <button onClick={() => setOpen(false)} aria-label="Sluiten" className="p-2 -m-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><X size={15} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 sm:items-end">
        <div>
          <label className={labelCls}>Vertrek</label>
          <input type="datetime-local" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Verwachte terugkomst</label>
          <input type="datetime-local" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <button onClick={() => search(start, end)} disabled={busy || !!problem}
          className={`${buttonCls} min-h-11 sm:min-h-[38px] justify-center text-white`} style={{ backgroundColor: ACCENT }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Zoeken
        </button>
      </div>

      <ErrorLine>{problem && (start || end) ? problem : error}</ErrorLine>

      {result && !stale && (
        result.cars.length === 0 ? (
          <p className="text-sm text-zinc-400">Geen enkele wagen is vrij van {formatPeriod(brusselsLocalToISO(result.start)!, brusselsLocalToISO(result.end)!)}.</p>
        ) : (
          <div>
            <p className="text-xs text-zinc-500 mb-2">
              Vrij van {formatPeriod(brusselsLocalToISO(result.start)!, brusselsLocalToISO(result.end)!)}: {result.cars.length} {result.cars.length === 1 ? 'wagen' : 'wagens'}
            </p>
            <ul className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800">
              {result.cars.map(({ car, notBack }) => (
                <li key={car.id} className="min-h-[52px] md:min-h-[40px] px-3 py-1.5 flex items-center gap-3">
                  <Check size={14} className="text-emerald-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-zinc-100">{car.name}</span>
                    <span className="ml-2 text-[10px] font-mono text-zinc-500">{car.license_plate}</span>
                    {notBack && <p className="text-[11px] text-red-400">Nog niet terug van de vorige rit.</p>}
                  </div>
                  <button onClick={() => onReserve(car.id, result.start, result.end)}
                    className={`${buttonCls} min-h-11 md:min-h-0 text-white`} style={{ backgroundColor: ACCENT }}>
                    Reserveren
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
      {stale && <p className="text-xs text-zinc-500">Klik op Zoeken voor de nieuwe periode.</p>}
    </section>
  )
}
