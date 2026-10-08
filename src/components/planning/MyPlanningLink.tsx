'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { dateCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningRow } from '@/lib/planning-cache'
import type { PlanningPreset } from '@/lib/planning-presets'
import MyMonthCalendar from './MyMonthCalendar'

// Dezelfde maandweergave die het team op de telefoon krijgt (MyMonthCalendar),
// maar gevoed door /api/planning/mine in plaats van door Supabase. Hergebruik
// is hier geen luiheid: het is dezelfde planning, en twee schermen die
// hetzelfde tonen lopen vroeg of laat uiteen.
//
// Wat anders is: schrijven gaat per dag via de server, die uit het token
// afleidt om wiens rij het gaat. Deze component stuurt nooit een naam of
// afdeling mee — hij zou het kunnen weten, maar dan zou de server het moeten
// geloven.

interface Target { wd: WeekDay; dept: string; emp: string }

export default function MyPlanningLink({
  token, dept, emp, presets,
}: {
  token: string
  dept: string
  emp: string
  presets: PlanningPreset[]
}) {
  const [anchor, setAnchor] = useState(() => new Date())
  const year = anchor.getFullYear()
  const month = anchor.getMonth() + 1

  const [data, setData] = useState<PlanningWeekData>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(`/api/planning/mine?token=${encodeURIComponent(token)}&year=${year}&month=${month}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json() as { rows: PlanningRow[] }
      const map: PlanningWeekData = {}
      for (const r of body.rows) {
        map[dateCellKey(r.year, r.month, r.day, r.department, r.employee)] = {
          value: r.value,
          bold: r.bold ?? true,
          textColor: r.text_color ?? '#ffffff',
          bgColor: r.bg_color ?? null,
          note: r.note ?? null,
          updatedBy: r.updated_by ?? null,
          updatedAt: r.updated_at ?? null,
        }
      }
      setData(map)
    } catch {
      setError('Kon je planning niet laden. Probeer het straks opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [token, year, month])

  useEffect(() => { setLoading(true); load() }, [load])

  // Optimistisch bijwerken en daarna herladen: het scherm reageert meteen,
  // en wat de server ervan maakt is alsnog het laatste woord.
  async function write(wd: WeekDay, cell: CellData | null) {
    const key = dateCellKey(wd.year, wd.month, wd.day, dept, emp)
    setData(prev => {
      const next = { ...prev }
      if (cell) next[key] = cell
      else delete next[key]
      return next
    })
    try {
      const res = await fetch('/api/planning/mine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          year: wd.year, month: wd.month, day: wd.day,
          value: cell?.value ?? '',
          note: cell?.note ?? null,
          bgColor: cell?.bgColor ?? null,
          textColor: cell?.textColor ?? '#ffffff',
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setError('Opslaan mislukt — je wijziging is niet bewaard.')
      load()
    }
  }

  async function handleApply(targets: Target[], cell: CellData) {
    setError('')
    for (const t of targets) await write(t.wd, cell)
  }

  async function handleClear(targets: Target[]) {
    setError('')
    for (const t of targets) await write(t.wd, null)
  }

  function step(delta: number) {
    setAnchor(a => new Date(a.getFullYear(), a.getMonth() + delta, 1))
  }

  return (
    <div className="min-h-screen" style={{ background: '#0d0d0d' }}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-4"
        style={{ background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/logo.png" alt="Sporthouse" width={100} height={26}
            className="object-contain flex-shrink-0" style={{ filter: 'invert(1)', opacity: 0.85 }} />
          <span className="text-zinc-700 text-sm hidden sm:inline">|</span>
          <span className="text-sm text-zinc-400 font-medium truncate">{emp}</span>
        </div>
      </header>

      <main className="px-4 py-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => step(-1)} aria-label="Vorige maand"
            className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
            <ChevronLeft size={16} />
          </button>
          <p className="flex-1 text-center text-sm font-semibold text-sh-grey">
            {DUTCH_MONTHS[month - 1]} {year}
          </p>
          <button onClick={() => step(1)} aria-label="Volgende maand"
            className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
            <ChevronRight size={16} />
          </button>
          {loading && <Loader2 size={14} className="animate-spin text-zinc-600" />}
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <MyMonthCalendar
          year={year}
          month={month}
          dept={dept}
          emp={emp}
          data={data}
          readOnly={false}
          presets={presets}
          onApply={handleApply}
          onClear={handleClear}
        />

        <p className="mt-6 text-[10px] text-zinc-700 text-center">
          Dit is je persoonlijke planningslink. Hou hem voor jezelf — wie hem
          heeft, ziet en bewerkt jouw planning.
        </p>
      </main>
    </div>
  )
}
