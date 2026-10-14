'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { DUTCH_MONTHS, getDaysInMonth, type Person } from '@/lib/planning-config'
import { dateCellKey, emptyCell, type CellData, type PlanningWeekData, type Target, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

type Dag = ReturnType<typeof getDaysInMonth>[number]

// Maandag eerst, zoals overal in deze planning.
const WEEKDAG_KOPJES = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

const SEL_BG = 'rgba(59,130,246,0.12)'
const SEL_BORDER = '#3b82f6'

// Mobile's own "Mijn maand", in drie weergaven.
//
// Dit scherm is vier keer opnieuw getekend en elke vorm had gelijk voor
// iemand: een raster geeft overzicht maar kapt namen af, een lijst is
// leesbaar maar toont vier dagen per scherm. Dat is geen ontwerpfout die nog
// opgelost moet worden — het zijn verschillende vragen. "Wat doe ik vandaag"
// en "hoe ziet mijn maand eruit" hebben niet dezelfde vorm nodig.
//
// Dus kiest de gebruiker, en onthoudt dit scherm wat hij koos.
//
// Wat uit die vier rondes meegenomen is en in elke weergave geldt:
//   - Er wordt nergens gesleept. Dat was de eerste poging: een muisgebaar op
//     een touchscreen. Eén tik opent de dag; wil je er meer, dan zet je
//     "Selecteren" aan en tikt ze aan.
//   - Een status is nooit alleen een bolletje. Dat was de tweede poging: die
//     zeiden te weinig, en het vinkje leek een versiering. De naam staat er
//     altijd bij, op zijn eigen kleur, en het hele vlak is de knop.
const WEERGAVEN = ['maand', 'week', 'dag'] as const
type Weergave = (typeof WEERGAVEN)[number]

const WEERGAVE_LABELS: Record<Weergave, string> = {
  maand: 'Maand',
  week:  'Week',
  dag:   'Dag',
}

// Per toestel, niet per account: dit gaat over het scherm in je hand, niet
// over wie je bent. Naast 'planning-active-tab', dat om dezelfde reden niet
// in planning-cache.ts staat.
const WEERGAVE_KEY = 'planning-mijn-weergave'

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

  function cellFor(day: number): CellData {
    return data[dateCellKey(year, month, day, contactId)] ?? emptyCell()
  }

  // ── Het raster, uitgelijnd op de weekdagen ────────────────────────────────
  // Geen useMemo: `days` wordt hierboven toch elke render opnieuw gemaakt.
  // Maandag = 0; getDay() telt vanaf zondag.
  const eersteKolom = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const raster: (Dag | null)[] = [...Array<Dag | null>(eersteKolom).fill(null), ...days]
  while (raster.length % 7 !== 0) raster.push(null)

  const weken: (Dag | null)[][] = []
  for (let i = 0; i < raster.length; i += 7) weken.push(raster.slice(i, i + 7))

  // Waar je begint: vandaag als die in deze maand valt, anders het begin.
  const vandaag = days.find(d => d.isToday)
  const startDag = vandaag?.day ?? 1
  const startWeek = Math.floor((eersteKolom + startDag - 1) / 7)

  const [weergave, setWeergave] = useState<Weergave>('maand')
  const [weekIdx, setWeekIdx] = useState(startWeek)
  const [dagNr, setDagNr] = useState(startDag)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData } | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WEERGAVE_KEY)
      if (stored === 'maand' || stored === 'week' || stored === 'dag') setWeergave(stored)
    } catch { /* private browsing */ }
  }, [])

  // Van maand wisselen zet je terug bij het begin van die maand — of bij
  // vandaag, als je daar beland bent.
  useEffect(() => {
    setSelectMode(false)
    setSelected(new Set())
    setWeekIdx(startWeek)
    setDagNr(startDag)
  }, [year, month, startWeek, startDag])

  function kiesWeergave(w: Weergave) {
    setWeergave(w)
    setSelectMode(false)
    setSelected(new Set())
    try { localStorage.setItem(WEERGAVE_KEY, w) } catch { /* private browsing */ }
  }

  function openEditorForDays(dayNums: number[]) {
    if (readOnly || dayNums.length === 0) return
    const sorted = [...dayNums].sort((a, b) => a - b)
    const targets: Target[] = sorted.map(d => ({ wd: wdFor(d), contactId }))
    const initial = targets.length === 1 ? cellFor(sorted[0]) : emptyCell()
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

  const dagVanNu = days.find(d => d.day === dagNr) ?? days[0]
  const weekDagen = (weken[weekIdx] ?? []).filter((d): d is Dag => d !== null)

  return (
    <div>
      {/* ── Weergavekeuze ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
          {WEERGAVEN.map(w => (
            <button
              key={w}
              onClick={() => kiesWeergave(w)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                weergave === w ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {WEERGAVE_LABELS[w]}
            </button>
          ))}
        </div>
        {/* In de dagweergave staat er één dag op het scherm; daar valt niets
            te selecteren wat tikken niet sneller doet. */}
        {!readOnly && weergave !== 'dag' && (
          <button onClick={toggleSelectMode} className="text-[11px] text-zinc-400 hover:text-zinc-200 underline">
            {selectMode ? 'Annuleren' : 'Selecteren'}
          </button>
        )}
      </div>

      {/* ── Maand ────────────────────────────────────────────────────────── */}
      {weergave === 'maand' && (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAG_KOPJES.map(d => (
              <p key={d} className="text-center text-[10px] uppercase tracking-wide text-zinc-600">{d}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 pb-20">
            {raster.map((d, i) => {
              if (!d) return <div key={`leeg-${i}`} aria-hidden />
              const cell = cellFor(d.day)
              const isSelected = selectMode && selected.has(d.day)
              return (
                <button
                  key={d.day}
                  onClick={() => handleDayClick(d.day)}
                  className="relative flex flex-col gap-0.5 min-h-[3.4rem] p-1 rounded-lg border text-left transition-colors"
                  style={{
                    borderColor: isSelected ? SEL_BORDER : '#27272a',
                    backgroundColor: isSelected ? SEL_BG : 'rgba(24,24,27,0.6)',
                    // Een leeg weekend mag naar de achtergrond; staat er wel
                    // iets ingepland, dan is dat juist het vermelden waard.
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
                  {/* Een notitie past hier niet, maar dát er één is moet je
                      kunnen zien voor je tikt. */}
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
        </>
      )}

      {/* ── Week ─────────────────────────────────────────────────────────── */}
      {weergave === 'week' && (
        <>
          <Stapper
            label={weekDagen.length > 0
              ? `${weekDagen[0].day} – ${weekDagen[weekDagen.length - 1].day} ${DUTCH_MONTHS[month - 1].toLowerCase()}`
              : DUTCH_MONTHS[month - 1]}
            onPrev={weekIdx > 0 ? () => setWeekIdx(i => i - 1) : null}
            onNext={weekIdx < weken.length - 1 ? () => setWeekIdx(i => i + 1) : null}
            hint={`Week ${weekIdx + 1} van ${weken.length}`}
          />
          <div className="space-y-1.5 pb-20">
            {weekDagen.map(d => {
              const cell = cellFor(d.day)
              const isSelected = selectMode && selected.has(d.day)
              return (
                <button
                  key={d.day}
                  onClick={() => handleDayClick(d.day)}
                  className="w-full flex items-center gap-3 pl-2.5 pr-3 py-3 rounded-xl border text-left transition-colors"
                  style={{
                    borderColor: isSelected ? SEL_BORDER : '#27272a',
                    backgroundColor: isSelected ? SEL_BG : 'rgba(24,24,27,0.6)',
                    borderLeftWidth: isSelected ? '4px' : '1px',
                  }}
                >
                  {selectMode && (
                    <span
                      className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: isSelected ? '#3A913F' : 'rgba(255,255,255,0.06)',
                        border: isSelected ? 'none' : '1.5px solid #52525b',
                      }}
                    >
                      {isSelected && <Check size={15} className="text-white" strokeWidth={3} />}
                    </span>
                  )}
                  <span className={`w-14 flex-shrink-0 text-xs ${
                    d.isToday ? 'text-emerald-400 font-semibold' : d.isWeekend ? 'text-zinc-600' : 'text-zinc-500'
                  }`}>
                    {d.dayName.slice(0, 2).toUpperCase()} {d.day}
                  </span>
                  {cell.value ? (
                    <span
                      className="flex-1 min-w-0 truncate rounded-md px-2 py-1.5 text-xs font-semibold"
                      style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                    >
                      {cell.value}
                    </span>
                  ) : (
                    <span className="flex-1 text-xs text-zinc-700">—</span>
                  )}
                  {cell.note && (
                    <span className="flex-shrink-0 max-w-[30%] truncate text-[10px] text-zinc-500">{cell.note}</span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Dag ──────────────────────────────────────────────────────────── */}
      {weergave === 'dag' && dagVanNu && (
        <>
          <Stapper
            label={`${dagVanNu.dayName} ${dagVanNu.day} ${DUTCH_MONTHS[month - 1].toLowerCase()}`}
            onPrev={dagNr > 1 ? () => setDagNr(n => n - 1) : null}
            onNext={dagNr < days.length ? () => setDagNr(n => n + 1) : null}
            hint={dagVanNu.isToday ? 'Vandaag' : undefined}
          />

          {/* De strip waarmee je een dag verderop aantikt in plaats van er
              met de pijlen naartoe te stappen — hetzelfde gebaar als het
              mobiele Team-scherm. */}
          <div className="scroll-x -mx-1 px-1 pb-3">
            <div className="flex gap-1 w-max">
              {days.map(d => {
                const cell = cellFor(d.day)
                const actief = d.day === dagNr
                return (
                  <button
                    key={d.day}
                    onClick={() => setDagNr(d.day)}
                    className="flex flex-col items-center gap-1 w-10 flex-shrink-0 py-1.5 rounded-lg border transition-colors"
                    style={{
                      borderColor: actief ? SEL_BORDER : 'transparent',
                      backgroundColor: actief ? SEL_BG : 'transparent',
                      opacity: d.isWeekend && !cell.value ? 0.45 : 1,
                    }}
                  >
                    <span className="text-[9px] uppercase text-zinc-600">{d.dayName.slice(0, 2)}</span>
                    <span className={`text-xs ${d.isToday ? 'text-emerald-400 font-bold' : 'text-zinc-400'}`}>{d.day}</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: cell.value ? (cell.bgColor ?? '#71717a') : 'transparent' }}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="pb-20">
          <button
            onClick={() => openEditorForDays([dagNr])}
            disabled={readOnly}
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-left disabled:opacity-60"
          >
            {(() => {
              const cell = cellFor(dagNr)
              return (
                <>
                  {cell.value ? (
                    <span
                      className="inline-flex rounded-lg px-3 py-2 text-base font-semibold"
                      style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#d4d4d8' }}
                    >
                      {cell.value}
                    </span>
                  ) : (
                    <span className="text-sm text-zinc-600">
                      {readOnly ? 'Niets ingepland.' : 'Niets ingepland — tik om in te vullen.'}
                    </span>
                  )}
                  {cell.note && (
                    <p className="mt-4 text-xs text-zinc-400 whitespace-pre-wrap">{cell.note}</p>
                  )}
                </>
              )
            })()}
          </button>
          </div>
        </>
      )}

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

// Vorige/volgende binnen de maand. Loopt bewust niet door naar de vorige of
// volgende maand: daarvoor staan de pijlen in de balk erboven, en twee paar
// pijlen die hetzelfde lijken te doen maar het net niet doen is erger dan een
// pijl die op zijn grens stopt.
function Stapper({ label, hint, onPrev, onNext }: {
  label: string
  hint?: string
  onPrev: (() => void) | null
  onNext: (() => void) | null
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <button
        onClick={() => onPrev?.()}
        disabled={!onPrev}
        aria-label="Vorige"
        className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex-1 text-center min-w-0">
        <p className="text-sm font-semibold text-sh-grey truncate">{label}</p>
        {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
      </div>
      <button
        onClick={() => onNext?.()}
        disabled={!onNext}
        aria-label="Volgende"
        className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
