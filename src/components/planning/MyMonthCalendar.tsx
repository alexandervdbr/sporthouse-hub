'use client'

import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { DUTCH_MONTHS, getDaysInMonth, type Person } from '@/lib/planning-config'
import { dateCellKey, emptyCell, type CellData, type PlanningWeekData, type Target, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'


// Maandag eerst, zoals overal in deze planning.
const WEEKDAG_KOPJES = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

const SEL_BG = 'rgba(59,130,246,0.12)'
const SEL_BORDER = '#3b82f6'

// Mobile's own "Mijn maand".
//
// Dit is de vierde vorm, en de derde keer dat er een raster staat. De twee
// eerdere pogingen zijn afgekeurd, en om goede redenen die hier nog steeds
// gelden:
//
//   1. Een raster met slepen — dat was een muisgebaar op een touchscreen.
//      Hier gebeurt alles met tikken. Eén tik opent de dag; wil je er meer,
//      dan zet je eerst "Selecteren" aan en tikt ze aan. Er wordt nergens
//      gesleept.
//   2. Een raster met bolletjes plus een losse lijst eronder — die bolletjes
//      zeiden te weinig, en het vinkje leek een versiering in plaats van iets
//      om op te tikken. Hier staat de statusnaam zelf in het vakje, op zijn
//      eigen kleur, en is het hele vakje de knop.
//
// Daarna stond hier een lijst van 31 rijen: wel leesbaar, maar vier dagen per
// scherm en een maand die je alleen scrollend kon overzien. Het raster ruilt
// volledige statusnamen in voor overzicht — lange namen worden afgekapt, en
// één tik geeft het hele verhaal terug.
//
// Uitgelijnd op de weekdagen, met lege plekken vooraan, net als de dagkiezer
// in DayEditor.
export default function MyMonthCalendar({
  year, month, person, data, readOnly, presets, onApply, onClear, emailToName,
}: {
  year: number
  month: number
  person: Person
  data: PlanningWeekData
  readOnly: boolean
  presets: PlanningPreset[]
  onApply: (targets: Target[], value: CellData) => void
  onClear: (targets: Target[]) => void
  emailToName?: Map<string, string>
}) {
  const contactId = person.id
  const days = getDaysInMonth(year, month)

  function wdFor(day: number): WeekDay {
    const d = days.find(x => x.day === day)!
    return { date: new Date(year, month - 1, day), year, month, day, dayName: d.dayName, isWeekend: d.isWeekend, isToday: d.isToday }
  }

  // Maandag = 0; getDay() telt vanaf zondag. Geen useMemo: `days` wordt
  // hierboven toch elke render opnieuw gemaakt, dus die zou niets bewaren.
  const eersteKolom = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const raster: ((typeof days)[number] | null)[] =
    [...Array<(typeof days)[number] | null>(eersteKolom).fill(null), ...days]

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData } | null>(null)

  useEffect(() => {
    setSelectMode(false)
    setSelected(new Set())
  }, [year, month])

  function openEditorForDays(dayNums: number[]) {
    if (readOnly || dayNums.length === 0) return
    const sorted = [...dayNums].sort((a, b) => a - b)
    const targets: Target[] = sorted.map(d => ({ wd: wdFor(d), contactId }))
    const initial = targets.length === 1
      ? (data[dateCellKey(year, month, sorted[0], contactId)] ?? emptyCell())
      : emptyCell()
    setEditing({ targets, cell: initial })
  }

  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelected(new Set())
  }

  function handleDayClick(day: number) {
    if (readOnly) return
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(day)) next.delete(day); else next.add(day)
        return next
      })
      return
    }
    openEditorForDays([day])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
          {DUTCH_MONTHS[month - 1]} {year}
        </p>
        {!readOnly && (
          <button onClick={toggleSelectMode} className="text-[11px] text-zinc-400 hover:text-zinc-200 underline">
            {selectMode ? 'Annuleren' : 'Selecteren'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAG_KOPJES.map(d => (
          <p key={d} className="text-center text-[10px] uppercase tracking-wide text-zinc-600">{d}</p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 pb-20">
        {raster.map((d, i) => {
          if (!d) return <div key={`leeg-${i}`} aria-hidden />

          const key = dateCellKey(year, month, d.day, contactId)
          const cell = data[key] ?? emptyCell()
          const isSelected = selectMode && selected.has(d.day)

          return (
            <button
              key={d.day}
              onClick={() => handleDayClick(d.day)}
              className="relative flex flex-col gap-0.5 min-h-[3.4rem] p-1 rounded-lg border text-left transition-colors"
              style={{
                borderColor: isSelected ? SEL_BORDER : '#27272a',
                backgroundColor: isSelected ? SEL_BG : 'rgba(24,24,27,0.6)',
                // Een leeg weekend mag naar de achtergrond; staat er iets
                // ingepland, dan is dat juist het vermelden waard.
                opacity: d.isWeekend && !cell.value ? 0.45 : 1,
              }}
            >
              <span className={`text-[10px] leading-none ${
                d.isToday ? 'text-emerald-400 font-bold' : d.isWeekend ? 'text-zinc-600' : 'text-zinc-500'
              }`}>
                {d.day}
              </span>

              {cell.value ? (
                <span
                  className="flex-1 flex items-center rounded px-1 text-[9px] font-semibold leading-tight truncate"
                  style={{
                    backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)',
                    color: cell.bgColor ? '#fff' : '#a1a1aa',
                  }}
                >
                  {cell.value}
                </span>
              ) : (
                <span className="flex-1" />
              )}

              {/* Een notitie is te lang voor dit vakje, maar dat er één is
                  moet je kunnen zien voor je tikt. */}
              {cell.note && !isSelected && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-zinc-500" />
              )}

              {isSelected && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3A913F' }}>
                  <Check size={10} className="text-white" strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-full shadow-2xl bg-zinc-800 border border-zinc-700">
          <span className="text-xs text-zinc-300 pl-1">
            {selected.size} {selected.size === 1 ? 'dag' : 'dagen'} geselecteerd
          </span>
          <button
            onClick={() => openEditorForDays([...selected])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            <Check size={12} /> Bewerken
          </button>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Selectie wissen"
            className="tap-target w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {editing && (
        <DayEditor
          title={editing.targets.length === 1
            ? `${editing.targets[0].wd.dayName} ${editing.targets[0].wd.day} ${DUTCH_MONTHS[month - 1]}`
            : `${editing.targets.length} dagen geselecteerd`}
          initialCell={editing.cell}
          presets={presets}
          readOnly={readOnly}
          emailToName={emailToName}
          dateEditor={{
            pool: days.map(d => wdFor(d.day)),
            selected: editing.targets.map(t => t.wd),
            onChange: next => {
              if (next.length === 0) { setEditing(null); setSelected(new Set()); setSelectMode(false); return }
              const sorted = [...next].sort((a, b) => a.day - b.day)
              setEditing(prev => prev && { ...prev, targets: sorted.map(wd => ({ wd, contactId })) })
            },
          }}
          onSave={cell => { onApply(editing.targets, cell); setEditing(null); setSelected(new Set()); setSelectMode(false) }}
          onClear={() => { onClear(editing.targets); setEditing(null); setSelected(new Set()); setSelectMode(false) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
