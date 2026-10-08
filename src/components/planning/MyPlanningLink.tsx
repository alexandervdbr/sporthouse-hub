'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { dateCellKey, type PlanningWeekData } from '@/lib/planning-week'
import type { PlanningRow } from '@/lib/planning-cache'
import MyMonthCalendar from './MyMonthCalendar'
import MyMonthWeeks from './MyMonthWeeks'

// De planning van één persoon, achter een link, zonder login.
//
// Alleen lezen. Dat was eerst anders, maar bewerken brengt de statuskiezer mee
// en die bevat de volledige lijst presets — Play Sports, FOS, RBFA, Sport
// Vlaanderen, De Spor. Dat is de klantenlijst, en die hoort niet bij een
// weekendstudent terecht te komen. Ook niet in de broncode van de pagina:
// daarom worden de presets hier helemaal niet meer aangeleverd, in plaats van
// alleen de knoppen te verbergen.
//
// In de praktijk vult een vaste medewerker deze rij toch in. Wil je bewerken
// terugzetten, dan komt /api/planning/mine PUT terug en gaat readOnly om.

export default function MyPlanningLink({
  token, dept, emp,
}: {
  token: string
  dept: string
  emp: string
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

  function step(delta: number) {
    setAnchor(a => new Date(a.getFullYear(), a.getMonth() + delta, 1))
  }

  // Dezelfde twee weergaven die het team krijgt: het maandraster op een breed
  // scherm, de lijst op een telefoon. Hiervoor stond overal de lijst, ook op
  // desktop — 31 rijen onder elkaar in een kolom van een derde van het scherm.
  const shared = {
    year, month, dept, emp, data,
    readOnly: true,
    presets: [],
    onApply: () => {},
    onClear: () => {},
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d0d' }}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 flex-shrink-0"
        style={{ background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/logo.png" alt="Sporthouse" width={100} height={26}
            className="object-contain flex-shrink-0" style={{ filter: 'invert(1)', opacity: 0.85 }} />
          <span className="text-zinc-700 text-sm hidden sm:inline">|</span>
          <span className="text-sm text-zinc-400 font-medium truncate">{emp}</span>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-4 w-full max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <button onClick={() => step(-1)} aria-label="Vorige maand"
            className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <p className="flex-1 text-center text-sm font-semibold text-sh-grey">
            {DUTCH_MONTHS[month - 1]} {year}
          </p>
          <button onClick={() => step(1)} aria-label="Volgende maand"
            className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <ChevronRight size={16} />
          </button>
          {loading && <Loader2 size={14} className="animate-spin text-zinc-600" />}
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-400 flex-shrink-0">
            {error}
          </p>
        )}

        <div className="hidden lg:block flex-1 min-h-0">
          <MyMonthWeeks {...shared} dimReadOnly={false} />
        </div>
        <div className="lg:hidden">
          <MyMonthCalendar {...shared} />
        </div>

        <p className="mt-6 text-[10px] text-zinc-700 text-center flex-shrink-0">
          Dit is je persoonlijke planningslink. Hou hem voor jezelf — wie hem
          heeft, ziet jouw planning. Klopt er iets niet, laat het weten.
        </p>
      </main>
    </div>
  )
}
