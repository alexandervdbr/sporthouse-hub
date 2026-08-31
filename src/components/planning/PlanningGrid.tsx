'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2, Settings, Search, User, X, CalendarPlus, Check, Undo2, Redo2 } from 'lucide-react'
import { DEPARTMENTS, DUTCH_MONTHS, DUTCH_DAYS, getDaysInMonth, cellKey, Department } from '@/lib/planning-config'
import PlanningConfigModal from '@/components/planning/PlanningConfigModal'
import { isAdminUser } from '@/lib/auth-permissions'
import type { PlanningPreset } from '@/lib/planning-presets'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CellData {
  value:     string
  bold:      boolean
  textColor: string | null
  bgColor:   string | null
}

type PlanningData = Record<string, CellData>

interface Sel {
  startDay: number
  endDay:   number
  startCol: number
  endCol:   number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_W  = 100
const DATE_W = 48
const CELL_W = 88

const BG_HEAD  = '#161616'
const BG_BODY  = '#0d0d0d'
const BG_WKND  = '#181818'
const BG_TODAY = '#111d11'
const SEL_BG   = 'rgba(59,130,246,0.12)'
const SEL_BDR  = 'rgba(59,130,246,0.5)'

// ─── Palettes ─────────────────────────────────────────────────────────────────

const BG_COLORS = [
  { label: 'Geen',      value: null,       display: 'transparent' },
  { label: 'Rood',      value: '#dc2626',  display: '#dc2626' },
  { label: 'Oranje',    value: '#ea580c',  display: '#ea580c' },
  { label: 'Geel',      value: '#ca8a04',  display: '#ca8a04' },
  { label: 'Fluogeel',  value: '#eeff00',  display: '#eeff00' },
  { label: 'Groen',     value: '#16a34a',  display: '#16a34a' },
  { label: 'Blauw',     value: '#2563eb',  display: '#2563eb' },
  { label: 'Paars',     value: '#9333ea',  display: '#9333ea' },
  { label: 'Roze',      value: '#db2777',  display: '#db2777' },
  { label: 'Grijs',     value: '#52525b',  display: '#52525b' },
]

function emptyCell(): CellData {
  return { value: '', bold: true, textColor: '#ffffff', bgColor: null }
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const MY_NAME_STORAGE_KEY = 'planning-my-name'

// ─── Naam-picker: "wie ben jij in dit rooster?" ────────────────────────────────
// Nodig omdat myColumn (uit de permissies) enkel bestaat voor wie beperkt mag
// bewerken — de meeste mensen met volledige rechten hebben hem niet. Deze
// picker is de generieke oplossing die voor iedereen werkt, admin of niet.
function NamePicker({
  depts, guess, onPick, onCancel,
}: {
  depts: Department[]
  guess: string | null
  onPick: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(guess ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Wie ben jij in dit rooster?</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Zo kan &ldquo;Alleen ik&rdquo; meteen jouw kolom tonen, ook de volgende keer.
          </p>
        </div>
        <select
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 outline-none focus:border-zinc-500"
        >
          <option value="">Kies je naam…</option>
          {depts.map(d => (
            <optgroup key={d.name} label={d.name}>
              {d.employees.map(emp => <option key={emp} value={emp}>{emp}</option>)}
            </optgroup>
          ))}
        </select>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Annuleren
          </button>
          <button
            onClick={() => value && onPick(value)}
            disabled={!value}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            Bevestigen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Meerdere dagen tegelijk zetten (mobiel) ───────────────────────────────────
// Kopieert wat er nu in één cel staat (tekst, kleur, vet) naar zoveel andere
// dagen als je aanvinkt — de "typ het niet vijf keer opnieuw"-knop. Blijft
// binnen de huidige maand: een tweede maand laden voor een zeldzaam geval
// weegt niet op tegen de complexiteit.
function MultiDayApplyModal({
  days, sourceDay, personLabel, preview, onConfirm, onCancel,
}: {
  days: { day: number; dayName: string; isWeekend: boolean; isToday: boolean }[]
  sourceDay: number
  personLabel: string
  preview: CellData
  onConfirm: (targetDays: number[]) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  function toggle(day: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day); else next.add(day)
      return next
    })
  }

  // Maandag altijd in de eerste kolom, zodat elke rij echt één week is — een
  // los blokje her en der zoals voorheen (kolommen die van datum tot datum
  // van weekdag wisselden) was verwarrend. DUTCH_DAYS is zondag-eerst (zoals
  // Date.getDay()); +6 %7 zet dat om naar maandag-eerst.
  const mondayFirst = (dayName: string) => (DUTCH_DAYS.indexOf(dayName) + 6) % 7
  const leadingBlanks = days.length > 0 ? mondayFirst(days[0].dayName) : 0
  const paddedDays: (typeof days[number] | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...days,
  ]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm max-h-[85dvh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">Zet op meerdere dagen</h2>
          <p className="text-xs text-zinc-500 mt-1">{personLabel}</p>
          <div className="mt-2.5 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{
              backgroundColor: preview.bgColor ?? 'rgba(255,255,255,0.06)',
              color: preview.bgColor ? '#ffffff' : (preview.textColor ?? '#e4e4e7'),
            }}>
            {preview.value.trim() || '(leeg)'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Vaste maandag-eerst kopregel boven de dagen, zodat de kolommen
              zelf geen labels meer nodig hebben en meteen duidelijk is welke
              kolom welke weekdag is. */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map(label => (
              <span key={label} className="text-[9px] uppercase tracking-wide text-zinc-600 text-center">{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {paddedDays.map((d, i) => {
              if (!d) return <span key={`blank-${i}`} aria-hidden />
              const isSource = d.day === sourceDay
              const isSel = selected.has(d.day)
              return (
                <button
                  key={d.day}
                  disabled={isSource}
                  onClick={() => toggle(d.day)}
                  className={`relative py-2 rounded-lg border text-center transition-colors ${
                    isSource
                      ? 'bg-zinc-900/40 border-zinc-800 text-zinc-700 cursor-default'
                      : isSel
                        ? 'bg-[#3A913F]/20 border-[#3A913F]/60 text-white'
                        : d.isWeekend
                          ? 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                  title={isSource ? 'Huidige dag' : undefined}
                >
                  <span className="block text-sm font-semibold leading-tight">{d.day}</span>
                  {isSel && <Check size={10} className="absolute top-1 right-1" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex items-center justify-between gap-2 flex-shrink-0">
          <button onClick={onCancel} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Annuleren
          </button>
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            Toepassen op {selected.size || ''} {selected.size === 1 ? 'dag' : 'dagen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function FormattingToolbar({
  cell, hasActive, selCount, onFormat, presets, onApplyPreset, canUndo, canRedo, onUndo, onRedo,
}: {
  cell: CellData | null
  hasActive: boolean
  selCount: number
  onFormat: (key: keyof CellData, value: unknown) => void
  presets: PlanningPreset[]
  onApplyPreset: (preset: PlanningPreset) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl flex-shrink-0 flex-wrap">
      <div className="flex items-center gap-1">
        <button
          onMouseDown={e => { e.preventDefault(); onUndo() }}
          disabled={!canUndo}
          title="Ongedaan maken (Ctrl+Z)"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30 transition-colors"
        >
          <Undo2 size={14} />
        </button>
        <button
          onMouseDown={e => { e.preventDefault(); onRedo() }}
          disabled={!canRedo}
          title="Opnieuw doen (Ctrl+Shift+Z)"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30 transition-colors"
        >
          <Redo2 size={14} />
        </button>
      </div>

      <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />

      <button
        onMouseDown={e => { e.preventDefault(); onFormat('bold', !cell?.bold) }}
        disabled={!hasActive}
        title="Vet (Ctrl+B)"
        className={`w-7 h-7 rounded-lg text-sm font-bold flex items-center justify-center transition-colors ${
          cell?.bold ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30'
        }`}
      >B</button>

      {presets.length > 0 && (
        <>
          <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            {presets.map(p => {
              const active = cell?.value.trim().toUpperCase() === p.name.toUpperCase() && cell?.bgColor === p.color
              return (
                <button
                  key={p.id}
                  onMouseDown={e => { e.preventDefault(); onApplyPreset(p) }}
                  disabled={!hasActive}
                  className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-30"
                  style={active
                    ? { backgroundColor: `${p.color}30`, border: `1px solid ${p.color}`, color: '#fff' }
                    : { backgroundColor: `${p.color}15`, border: `1px solid ${p.color}55`, color: p.color }}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-400 select-none">Achtergrond</span>
        {BG_COLORS.map(c => (
          <button key={c.label}
            onMouseDown={e => { e.preventDefault(); onFormat('bgColor', c.value) }}
            disabled={!hasActive} title={c.label}
            className="transition-transform hover:scale-110 disabled:opacity-30 rounded-full focus:outline-none"
            style={{
              width: 16, height: 16, flexShrink: 0,
              backgroundColor: c.display,
              border: cell?.bgColor === c.value ? '2px solid #fff' : c.value === null ? '2px solid #52525b' : '2px solid transparent',
            }}
          />
        ))}
      </div>

      <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />

      <span className="text-[10px] text-zinc-400 select-none">
        {selCount > 1
          ? `${selCount} cellen geselecteerd · Del wissen · Ctrl+C/V kopiëren`
          : !hasActive
          ? 'Klik cel om te typen · pijltoetsen navigeren · Del wissen'
          : 'Typ direct · pijltoetsen · Del wissen · Shift+klik voor bereik'}
      </span>
    </div>
  )
}

// ─── Main grid ────────────────────────────────────────────────────────────────

export default function PlanningGrid() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [activeDepts, setActiveDepts] = useState<Department[]>(DEPARTMENTS)
  const [data, setData]   = useState<PlanningData>({})
  const [loading, setLoading] = useState(true)
  const [showConfig, setShowConfig] = useState(false)

  // Selection state
  const [sel, setSel]           = useState<Sel | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Planning column permissions
  const [canEditAll, setCanEditAll] = useState(true)
  const [myColumn,   setMyColumn]   = useState<string | null>(null)
  const [myName,     setMyName]     = useState('')
  // Los van canEditAll: presets zijn specifiek beheer-only, niet "volledig mag
  // bewerken" — die twee rechten overlappen niet altijd.
  const [isBeheer,   setIsBeheer]   = useState(false)

  // Kleur-presets (SHG, FOS, …) — iedereen leest ze, enkel beheerders beheren ze.
  const [presets, setPresets] = useState<PlanningPreset[]>([])
  useEffect(() => {
    fetch('/api/planning/presets').then(r => r.json()).then(setPresets).catch(() => {})
  }, [])

  // "Zet op meerdere dagen" (mobiel) — welke cel is de bron.
  const [multiDayTarget, setMultiDayTarget] = useState<{ dept: string; emp: string } | null>(null)

  // Search & "alleen ik" ────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [myIdentity, setMyIdentity] = useState<string | null>(null)
  const [showNamePicker, setShowNamePicker] = useState(false)

  // "Alleen ik" onthouden tussen bezoeken, zodat het niet elke keer opnieuw
  // aangezet moet worden — dat was expliciet de vraag.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MY_NAME_STORAGE_KEY)
      if (stored) setMyIdentity(stored)
      if (localStorage.getItem('planning-only-mine') === 'true') setOnlyMine(true)
    } catch { /* private browsing */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('planning-only-mine', String(onlyMine)) } catch { /* ignore */ }
  }, [onlyMine])

  function confirmIdentity(name: string) {
    setMyIdentity(name)
    try { localStorage.setItem(MY_NAME_STORAGE_KEY, name) } catch { /* ignore */ }
    setShowNamePicker(false)
    setOnlyMine(true)
  }

  function toggleOnlyMine() {
    if (onlyMine) { setOnlyMine(false); return }
    setSearch('')
    if (myIdentity) setOnlyMine(true)
    else setShowNamePicker(true)
  }

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Rijke kopie naast de OS-klembordtekst: de tekst alleen laat kruis-app
  // plakken (bv. naar Excel) werken, maar draagt geen kleur/vet mee. Deze ref
  // bewaart de volledige cellen zodat plakken bínnen het rooster ook de status
  // (tekst + kleur) meeneemt. Eerder werd dit gevalideerd door het OS-klembord
  // meteen weer uit te lezen en te vergelijken — maar die lezing kon de
  // schrijfactie inhalen bij snel kopiëren-en-plakken, waardoor het bijna
  // altijd terugviel op platte tekst. Nu vertrouwen we deze ref gewoon zolang
  // er geen concreet signaal is dat er iets anders gekopieerd werd (zie de
  // invalidatie hieronder).
  const internalClipboard = useRef<CellData[][] | null>(null)

  // Iets anders kopiëren — elders op de pagina, of in een andere app terwijl
  // dit tabblad even niet actief was — betekent dat onze eigen rijke kopie
  // niet meer klopt.
  useEffect(() => {
    function invalidate() { internalClipboard.current = null }
    document.addEventListener('copy', invalidate)
    window.addEventListener('blur', invalidate)
    return () => {
      document.removeEventListener('copy', invalidate)
      window.removeEventListener('blur', invalidate)
    }
  }, [])
  const containerRef = useRef<HTMLDivElement>(null)
  const dragMovedRef = useRef(false)
  const supabase = createClient()
  const days = getDaysInMonth(year, month)

  // Alle personen ongeacht filter — de "master"-lijst waartegen gezocht en
  // geïdentificeerd wordt, en waaruit de naam-picker zijn opties haalt.
  const everyEmployee = useMemo(() =>
    activeDepts.flatMap(dept => dept.employees.map(emp => ({ dept: dept.name, emp }))),
  [activeDepts])

  // Zichtbare afdelingen na filter: leeg gebleven afdelingen vallen weg, zodat
  // de kolomkoppen en de mobiele lijst geen lege groepen tonen.
  const filteredDepts = useMemo(() => {
    if (!onlyMine && !search.trim()) return activeDepts
    const matches = (emp: string) =>
      onlyMine ? emp === myIdentity : norm(emp).includes(norm(search))
    return activeDepts
      .map(dept => ({ ...dept, employees: dept.employees.filter(matches) }))
      .filter(dept => dept.employees.length > 0)
  }, [activeDepts, onlyMine, search, myIdentity])

  // Dit is de kolomruimte die overal verder gebruikt wordt — selectie,
  // toetsenbordnavigatie, kopiëren/plakken, rendering. Zonder filter is dit
  // identiek aan de volledige lijst, dus bestaand gedrag verandert niet.
  const allColumns = useMemo(() =>
    filteredDepts.flatMap(dept => dept.employees.map(emp => ({ dept: dept.name, emp }))),
  [filteredDepts])

  // Filter (en dus de kolomruimte) wijzigt → oude selectie kan naar een kolom
  // wijzen die niet meer bestaat of van betekenis veranderd is.
  useEffect(() => {
    setSel(null); setActiveKey(null); setEditingKey(null)
  }, [onlyMine, search])

  // Beste gok voor de naam-picker: eerste woord van je accountnaam vergelijken
  // met het eerste woord van elke kolomnaam. Bij twijfel (0 of >1 treffers,
  // zoals "Thijs" naast "Thijs M") wordt niets voorgesteld — dan kiest de
  // gebruiker zelf, in plaats van dat er geraden wordt naar wiens planning het is.
  const nameGuess = useMemo(() => {
    if (!myName) return null
    const myFirst = norm(myName).split(' ')[0]
    if (!myFirst) return null
    const candidates = [...new Set(everyEmployee.map(c => c.emp))]
      .filter(emp => norm(emp).split(' ')[0] === myFirst)
    return candidates.length === 1 ? candidates[0] : null
  }, [myName, everyEmployee])

  // ── Load planning permissions ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setMyName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '')
      const permsObj = user.app_metadata?.permissions ?? null
      const sections: string[] = permsObj?.sections ?? []
      const isAdmin = isAdminUser(user)
      // Presets zijn expliciet beheer-only — niet iedereen die volledig mag
      // bewerken (planning_volledig), enkel wie ook de beheer-sectie heeft.
      setIsBeheer(isAdmin)
      if (isAdmin || permsObj === null || sections.includes('planning_volledig')) {
        setCanEditAll(true)
      } else {
        setCanEditAll(false)
        setMyColumn(permsObj.planning_column ?? null)
      }
    })
  }, [])

  // myColumn (admin-toegekend, voor edit-beperking) is de meest betrouwbare
  // bron als hij bestaat — geen giswerk nodig. Wie hem niet heeft (iedereen
  // met volledige rechten) krijgt de zelf-gekozen of geraden identiteit.
  useEffect(() => {
    if (myColumn && myColumn !== '__none__') setMyIdentity(myColumn)
  }, [myColumn])

  // ── Load departments config from Supabase ───────────────────────────────────
  useEffect(() => {
    fetch('/api/planning/config')
      .then(r => r.json())
      .then((data: Department[] | null) => {
        if (Array.isArray(data) && data.length > 0) setActiveDepts(data)
      })
      .catch(() => { /* silently fall back to hardcoded DEPARTMENTS */ })
  }, [])

  async function handleSaveConfig(newDepts: Department[]) {
    await fetch('/api/planning/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDepts),
    })
    setActiveDepts(newDepts)
  }

  const canEditCol = useCallback((emp: string): boolean => {
    if (canEditAll) return true
    if (myColumn === '__none__') return false
    if (myColumn === null) return true
    return myColumn === emp
  }, [canEditAll, myColumn])

  // ── Derived: selected cells set ─────────────────────────────────────────────
  const selectedKeys = useMemo(() => {
    if (!sel) return new Set<string>()
    const minDay = Math.min(sel.startDay, sel.endDay)
    const maxDay = Math.max(sel.startDay, sel.endDay)
    const minCol = Math.min(sel.startCol, sel.endCol)
    const maxCol = Math.max(sel.startCol, sel.endCol)
    const keys = new Set<string>()
    for (let d = minDay; d <= maxDay; d++) {
      for (let c = minCol; c <= maxCol; c++) {
        keys.add(cellKey(d, allColumns[c].dept, allColumns[c].emp))
      }
    }
    return keys
  }, [sel, allColumns])

  // ── Load month ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: rows } = await supabase
        .from('planning_entries')
        .select('day, department, employee, value, bold, text_color, bg_color')
        .eq('year', year)
        .eq('month', month)
      if (cancelled) return
      const map: PlanningData = {}
      for (const r of rows ?? []) {
        map[cellKey(r.day, r.department, r.employee)] = {
          value: r.value, bold: r.bold ?? true,
          textColor: r.text_color ?? '#ffffff', bgColor: r.bg_color ?? null,
        }
      }
      setData(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [year, month])

  // ── Debounced save ──────────────────────────────────────────────────────────
  const scheduleSave = useCallback((key: string, day: number, dept: string, emp: string, cell: CellData) => {
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const isEmpty = !cell.value.trim() && !cell.bold && !cell.textColor && !cell.bgColor
      if (isEmpty) {
        await supabase.from('planning_entries').delete()
          .eq('year', year).eq('month', month).eq('day', day)
          .eq('department', dept).eq('employee', emp)
      } else {
        await supabase.from('planning_entries').upsert({
          year, month, day, department: dept, employee: emp,
          value: cell.value, bold: cell.bold,
          text_color: cell.textColor, bg_color: cell.bgColor,
          updated_by: user?.email,
        }, { onConflict: 'year,month,day,department,employee' })
      }
      delete saveTimers.current[key]
    }, 600)
  }, [year, month])

  // ── Ongedaan maken ───────────────────────────────────────────────────────────
  // Elke wijziging loopt door applyUpdates, dus dat is de ene plek waar undo
  // moet aanknopen — geen aparte boekhouding nodig per actie (typen, plakken,
  // preset, opmaak, …). Opeenvolgende wijzigingen aan exact dezelfde cellen
  // binnen een korte tijd (bv. doorlopend typen in één cel) tellen als één
  // stap, anders zou Ctrl+Z bij elke druk op de toets maar één letter
  // terugdraaien in plaats van de hele invoer.
  const undoStack = useRef<Record<string, CellData>[]>([])
  const redoStack = useRef<Record<string, CellData>[]>([])
  const undoCoalesce = useRef<{ keys: string; timer: ReturnType<typeof setTimeout> | null }>({ keys: '', timer: null })
  const MAX_UNDO = 50
  // Enkel voor de aan/uit-status van de undo/redo-knoppen — de stacks zelf
  // zijn refs (geen re-render nodig bij elke push/pop), maar een knop moet wel
  // weten of er iets op staat.
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // ── Apply data updates ──────────────────────────────────────────────────────
  const applyUpdates = useCallback((updates: Record<string, CellData>) => {
    setData(prev => {
      const keysSignature = Object.keys(updates).sort().join(',')
      if (undoCoalesce.current.keys !== keysSignature) {
        const before: Record<string, CellData> = {}
        for (const key of Object.keys(updates)) before[key] = prev[key] ?? emptyCell()
        undoStack.current.push(before)
        if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
        redoStack.current = [] // een nieuwe wijziging maakt de redo-geschiedenis ongeldig
        setCanUndo(true)
        setCanRedo(false)
      }
      if (undoCoalesce.current.timer) clearTimeout(undoCoalesce.current.timer)
      undoCoalesce.current.keys = keysSignature
      undoCoalesce.current.timer = setTimeout(() => { undoCoalesce.current.keys = '' }, 1200)

      const next = { ...prev, ...updates }
      for (const [key, cell] of Object.entries(updates)) {
        const [dayStr, dept, emp] = key.split('|')
        scheduleSave(key, Number(dayStr), dept, emp, cell)
      }
      return next
    })
  }, [scheduleSave])

  // ── Text change ─────────────────────────────────────────────────────────────
  const handleTextChange = useCallback((day: number, dept: string, emp: string, value: string) => {
    const key = cellKey(day, dept, emp)
    applyUpdates({ [key]: { ...(data[key] ?? emptyCell()), value: value.toUpperCase(), bold: true, textColor: '#ffffff' } })
  }, [data, applyUpdates])

  // ── Preset toepassen (stempelt tekst + kleur in één tik; nogmaals tikken op
  // een al-actieve preset wist de cel weer) ───────────────────────────────────
  const applyPreset = useCallback((day: number, dept: string, emp: string, preset: PlanningPreset) => {
    const key = cellKey(day, dept, emp)
    const current = data[key] ?? emptyCell()
    const isActive = current.value.trim().toUpperCase() === preset.name.toUpperCase() && current.bgColor === preset.color
    applyUpdates({
      [key]: isActive
        ? emptyCell()
        : { value: preset.name.toUpperCase(), bold: true, textColor: '#ffffff', bgColor: preset.color },
    })
  }, [data, applyUpdates])

  // ── "Zet op meerdere dagen" bevestigen: kopieert de brondag naar elke
  // aangevinkte dag voor diezelfde persoon, in één keer weggeschreven. ────────
  const applyToMultipleDays = useCallback((sourceDay: number, dept: string, emp: string, targetDays: number[]) => {
    const sourceKey = cellKey(sourceDay, dept, emp)
    const source = data[sourceKey] ?? emptyCell()
    const updates: Record<string, CellData> = {}
    for (const d of targetDays) updates[cellKey(d, dept, emp)] = { ...source }
    applyUpdates(updates)
  }, [data, applyUpdates])

  // ── Format (applies to all selected cells) ──────────────────────────────────
  const handleFormat = useCallback((fmtKey: keyof CellData, value: unknown) => {
    const keys = (selectedKeys.size > 0 ? Array.from(selectedKeys) : activeKey ? [activeKey] : [])
      .filter(k => canEditCol(k.split('|')[2]))
    if (keys.length === 0) return
    const updates: Record<string, CellData> = {}
    for (const k of keys) {
      updates[k] = { ...(data[k] ?? emptyCell()), [fmtKey]: value }
    }
    applyUpdates(updates)
  }, [selectedKeys, activeKey, data, applyUpdates, canEditCol])

  // Preset op de huidige selectie (desktop toolbar). Zet tekst én kleur in één
  // applyUpdates-call — twee losse handleFormat-aanroepen zouden elkaars
  // wijziging kunnen overschrijven, omdat elke aanroep een volledig nieuw
  // cel-object bouwt vanuit dezelfde (dan nog niet bijgewerkte) `data`.
  const applyPresetToSelection = useCallback((preset: PlanningPreset) => {
    const keys = (selectedKeys.size > 0 ? Array.from(selectedKeys) : activeKey ? [activeKey] : [])
      .filter(k => canEditCol(k.split('|')[2]))
    if (keys.length === 0) return
    const updates: Record<string, CellData> = {}
    for (const k of keys) {
      const current = data[k] ?? emptyCell()
      const isActive = current.value.trim().toUpperCase() === preset.name.toUpperCase() && current.bgColor === preset.color
      updates[k] = isActive
        ? emptyCell()
        : { value: preset.name.toUpperCase(), bold: true, textColor: '#ffffff', bgColor: preset.color }
    }
    applyUpdates(updates)
  }, [selectedKeys, activeKey, data, applyUpdates, canEditCol])

  // ── Clear selected cells ────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    const keys = (selectedKeys.size > 0 ? Array.from(selectedKeys) : activeKey ? [activeKey] : [])
      .filter(k => canEditCol(k.split('|')[2]))
    if (keys.length === 0) return
    const updates: Record<string, CellData> = {}
    for (const k of keys) {
      updates[k] = emptyCell()
    }
    applyUpdates(updates)
  }, [selectedKeys, activeKey, applyUpdates, canEditCol])

  // ── Copy ────────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const before = undoStack.current.pop()
    if (!before) return
    undoCoalesce.current.keys = '' // een volgende toets mag hier niet meer mee samengevoegd worden
    setData(prev => {
      const after: Record<string, CellData> = {}
      for (const key of Object.keys(before)) after[key] = prev[key] ?? emptyCell()
      redoStack.current.push(after)
      setCanUndo(undoStack.current.length > 0)
      setCanRedo(true)

      const next = { ...prev, ...before }
      for (const [key, cell] of Object.entries(before)) {
        const [dayStr, dept, emp] = key.split('|')
        scheduleSave(key, Number(dayStr), dept, emp, cell)
      }
      return next
    })
  }, [scheduleSave])

  const handleRedo = useCallback(() => {
    const after = redoStack.current.pop()
    if (!after) return
    undoCoalesce.current.keys = ''
    setData(prev => {
      const before: Record<string, CellData> = {}
      for (const key of Object.keys(after)) before[key] = prev[key] ?? emptyCell()
      undoStack.current.push(before)
      setCanRedo(redoStack.current.length > 0)
      setCanUndo(true)

      const next = { ...prev, ...after }
      for (const [key, cell] of Object.entries(after)) {
        const [dayStr, dept, emp] = key.split('|')
        scheduleSave(key, Number(dayStr), dept, emp, cell)
      }
      return next
    })
  }, [scheduleSave])

  const handleCopy = useCallback(() => {
    // Zonder sleep-selectie is er enkel activeKey (een klik op één cel) — dat
    // is nog steeds een geldige, kopieerbare selectie van precies één cel,
    // dus die valt hier terug op zijn eigen 1×1 bereik.
    const region = sel ?? (activeKey
      ? (() => {
          const day = Number(activeKey.split('|')[0])
          const col = allColumns.findIndex(c => activeKey === cellKey(day, c.dept, c.emp))
          return col >= 0 ? { startDay: day, endDay: day, startCol: col, endCol: col } : null
        })()
      : null)
    if (!region) return
    const minDay = Math.min(region.startDay, region.endDay)
    const maxDay = Math.max(region.startDay, region.endDay)
    const minCol = Math.min(region.startCol, region.endCol)
    const maxCol = Math.max(region.startCol, region.endCol)

    const textRows: string[] = []
    const cellRows: CellData[][] = []
    for (let d = minDay; d <= maxDay; d++) {
      const textRow: string[] = []
      const cellRow: CellData[] = []
      for (let c = minCol; c <= maxCol; c++) {
        const cell = data[cellKey(d, allColumns[c].dept, allColumns[c].emp)] ?? emptyCell()
        textRow.push(cell.value)
        cellRow.push(cell)
      }
      textRows.push(textRow.join('\t'))
      cellRows.push(cellRow)
    }
    const text = textRows.join('\n')
    // Naar het OS-klembord voor kruis-app plakken (bv. naar Excel) — enkel
    // tekst, want dat is alles wat zo'n doel kan begrijpen.
    navigator.clipboard.writeText(text)
    // En de volledige cellen intern, zodat plakken bínnen dit rooster ook de
    // kleur en opmaak meeneemt, niet enkel de tekst.
    internalClipboard.current = cellRows
  }, [sel, activeKey, data, allColumns])

  // ── Paste ───────────────────────────────────────────────────────────────────
  // Werkt als een spreadsheet: is het plakdoel groter dan wat er gekopieerd
  // is, dan wordt het gekopieerde herhaald tot het hele doel gevuld is, in
  // plaats van enkel de cellen linksboven te vullen.
  const handlePaste = useCallback(async () => {
    const startDay = sel
      ? Math.min(sel.startDay, sel.endDay)
      : activeKey ? Number(activeKey.split('|')[0]) : null
    const startCol = sel
      ? Math.min(sel.startCol, sel.endCol)
      : activeKey
        ? allColumns.findIndex(c => activeKey === cellKey(Number(activeKey.split('|')[0]), c.dept, c.emp))
        : null

    if (startDay === null || startCol === null || startCol < 0) return

    // Onze eigen kopie (mét kleur/opmaak) heeft voorrang zolang er niets op
    // wijst dat er intussen iets anders gekopieerd is (zie de invalidatie
    // hierboven bij een echte 'copy' elders op de pagina, of bij het verlaten
    // van dit venster). Enkel wanneer we niets hebben, lezen we het
    // OS-klembord — voor tekst die van buiten deze app gekopieerd is, bv. uit
    // Excel.
    const rich = internalClipboard.current
    let sourceCells: CellData[][]
    if (rich) {
      sourceCells = rich
    } else {
      let osText = ''
      try { osText = await navigator.clipboard.readText() } catch { return }
      sourceCells = osText.split('\n').map(r => r.split('\t').map(val => ({ value: val, bold: true, textColor: null, bgColor: null })))
    }
    const sourceRows = sourceCells.length
    const sourceCols = Math.max(1, ...sourceCells.map(r => r.length))
    if (sourceRows === 0 || sourceCols === 0) return

    // Zonder actieve selectie (enkel een actieve cel) plakken we op natuurlijke
    // grootte, net als vroeger. Mét selectie vullen we minstens die selectie,
    // ook als het gekopieerde kleiner is — en nooit kleiner dan het gekopieerde
    // zelf, want een groter blok in een kleinere selectie plakken plakt het
    // hele blok, net als in Excel/Sheets.
    const selDayCount = sel ? Math.abs(sel.endDay - sel.startDay) + 1 : 1
    const selColCount = sel ? Math.abs(sel.endCol - sel.startCol) + 1 : 1
    const targetRows = sel ? Math.max(sourceRows, selDayCount) : sourceRows
    const targetCols = sel ? Math.max(sourceCols, selColCount) : sourceCols

    const dayIndex = days.findIndex(d => d.day === startDay)
    const updates: Record<string, CellData> = {}
    for (let ri = 0; ri < targetRows; ri++) {
      const targetDay = days[dayIndex + ri]?.day
      if (!targetDay) break
      for (let ci = 0; ci < targetCols; ci++) {
        const targetColIdx = startCol + ci
        if (targetColIdx >= allColumns.length) break
        const { dept, emp } = allColumns[targetColIdx]
        const key = cellKey(targetDay, dept, emp)
        const source = sourceCells[ri % sourceRows]?.[ci % sourceCols]
        if (!source) continue
        updates[key] = rich
          ? { ...source }
          : { ...(data[key] ?? emptyCell()), value: source.value }
      }
    }
    applyUpdates(updates)
  }, [sel, activeKey, data, days, allColumns, applyUpdates])

  // ── Helper: focus input for a given key ─────────────────────────────────────
  function focusCell(key: string) {
    const input = document.querySelector<HTMLInputElement>(`input[data-key="${key}"]`)
    if (input) { input.focus(); input.select() }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const ctrl = isMac ? e.metaKey : e.ctrlKey

      if (ctrl && e.key === 'c') {
        // Ook één aangeklikte cel (enkel activeKey, geen sleep-selectie) is
        // geldig om te kopiëren — voorheen moest het per se een echt bereik
        // zijn, waardoor Ctrl+C op één cel domweg niets deed.
        if (sel || activeKey) { e.preventDefault(); handleCopy() }
      }
      if (ctrl && e.key === 'v') {
        if (sel || activeKey) { e.preventDefault(); handlePaste() }
      }
      if (ctrl && e.key === 'b') {
        if (sel || activeKey) {
          e.preventDefault()
          const first = activeKey ?? (sel ? cellKey(sel.startDay, allColumns[Math.min(sel.startCol, sel.endCol)].dept, allColumns[Math.min(sel.startCol, sel.endCol)].emp) : null)
          handleFormat('bold', !(data[first ?? '']?.bold))
        }
      }
      // Ctrl/Cmd+Z ongedaan maken, Shift erbij (of Ctrl/Cmd+Y) opnieuw doen —
      // altijd preventDefault, ook zonder iets op de stack, anders vecht dit
      // met de eigen undo van een net-actief tekstveld.
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setEditingKey(null)
        if (e.shiftKey) handleRedo(); else handleUndo()
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setEditingKey(null)
        handleRedo()
      }
      if (e.key === 'Escape') {
        setEditingKey(null)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        return
      }

      // Delete/Backspace when not editing → clear selected cells
      if (!editingKey && (e.key === 'Delete' || e.key === 'Backspace') && (activeKey || sel)) {
        e.preventDefault()
        handleClear()
        return
      }

      // Enter when active but not editing → enter edit mode
      if (!editingKey && activeKey && e.key === 'Enter' && !ctrl) {
        e.preventDefault()
        setEditingKey(activeKey)
        focusCell(activeKey)
        return
      }

      // Enter when editing → confirm and move down
      if (editingKey && e.key === 'Enter' && !ctrl) {
        e.preventDefault()
        const parts = editingKey.split('|')
        const curDay = Number(parts[0])
        const curDept = parts[1]
        const curEmp  = parts[2]
        const colIdx = allColumns.findIndex(c => c.dept === curDept && c.emp === curEmp)
        const dayIdx = days.findIndex(d => d.day === curDay)
        const nd = Math.min(dayIdx + 1, days.length - 1)
        const { dept, emp } = allColumns[colIdx]
        const newKey = cellKey(days[nd].day, dept, emp)
        setEditingKey(null)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setActiveKey(newKey)
        setSel({ startDay: days[nd].day, endDay: days[nd].day, startCol: colIdx, endCol: colIdx })
        return
      }

      // Arrow-key navigation — always navigate (blurs current editing cell first)
      if (activeKey && !ctrl && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setEditingKey(null)
        const parts = activeKey.split('|')
        const curDay = Number(parts[0])
        const curDept = parts[1]
        const curEmp  = parts[2]
        const colIdx = allColumns.findIndex(c => c.dept === curDept && c.emp === curEmp)
        const dayIdx = days.findIndex(d => d.day === curDay)
        let nd = dayIdx, nc = colIdx
        if (e.key === 'ArrowDown')  nd = Math.min(dayIdx + 1, days.length - 1)
        if (e.key === 'ArrowUp')    nd = Math.max(dayIdx - 1, 0)
        if (e.key === 'ArrowRight') nc = Math.min(colIdx + 1, allColumns.length - 1)
        if (e.key === 'ArrowLeft')  nc = Math.max(colIdx - 1, 0)
        const { dept, emp } = allColumns[nc]
        const newKey = cellKey(days[nd].day, dept, emp)
        setActiveKey(newKey)
        setSel({ startDay: days[nd].day, endDay: days[nd].day, startCol: nc, endCol: nc })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sel, activeKey, editingKey, handleCopy, handlePaste, handleFormat, handleClear, handleUndo, handleRedo, data, allColumns, days])

  // ── Mouse up (stop drag) ────────────────────────────────────────────────────
  useEffect(() => {
    function onMouseUp() { setIsDragging(false) }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  // ── Cell mouse handlers ─────────────────────────────────────────────────────
  function onCellMouseDown(day: number, colIdx: number, e: React.MouseEvent) {
    dragMovedRef.current = false
    if (e.shiftKey && sel) {
      setSel(prev => prev ? { ...prev, endDay: day, endCol: colIdx } : { startDay: day, endDay: day, startCol: colIdx, endCol: colIdx })
    } else {
      setSel({ startDay: day, endDay: day, startCol: colIdx, endCol: colIdx })
      setActiveKey(cellKey(day, allColumns[colIdx].dept, allColumns[colIdx].emp))
    }
    setIsDragging(true)
  }

  function onCellMouseEnter(day: number, colIdx: number) {
    if (!isDragging) return
    if (!dragMovedRef.current) {
      // Eerste beweging van deze sleep: dit is een echte drag-selectie, geen
      // klik. De startcel kan net (via zijn eigen focus bij mousedown) in
      // bewerkmodus zijn beland — dat hoort hier niet meer te gelden, anders
      // blijft Backspace/Delete straks denken dat er maar één cel bewerkt
      // wordt in plaats van de hele sleep-selectie.
      dragMovedRef.current = true
      setEditingKey(null)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
    setSel(prev => prev ? { ...prev, endDay: day, endCol: colIdx } : null)
  }

  function onCellClick(day: number, colIdx: number, e: React.MouseEvent) {
    if (dragMovedRef.current || e.shiftKey) return
    if (!canEditCol(allColumns[colIdx].emp)) return
    const key = cellKey(day, allColumns[colIdx].dept, allColumns[colIdx].emp)
    setEditingKey(key)
    focusCell(key)
  }

  // ── Row header click → select whole row ─────────────────────────────────────
  function onRowHeaderClick(day: number) {
    setSel({ startDay: day, endDay: day, startCol: 0, endCol: allColumns.length - 1 })
    setActiveKey(null)
    setEditingKey(null)
  }

  // ── Column header click → select whole column ────────────────────────────────
  function onColHeaderClick(colIdx: number) {
    setSel({ startDay: days[0].day, endDay: days[days.length - 1].day, startCol: colIdx, endCol: colIdx })
    setActiveKey(null)
    setEditingKey(null)
  }

  // ── Month nav ───────────────────────────────────────────────────────────────
  function prev() { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function next() { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const activeCell = activeKey ? (data[activeKey] ?? emptyCell()) : null
  const selCount = selectedKeys.size

  // ── Mobile: one day at a time ───────────────────────────────────────────────
  // A month × employees spreadsheet can't be made legible on a phone, and
  // scrolling it sideways is worse than useless. Below lg we show a single day
  // as a list of people instead — the same data, the shape a phone can hold.
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
  const [mobileDay, setMobileDay] = useState(isCurrentMonth ? now.getDate() : 1)
  const [openPaletteKey, setOpenPaletteKey] = useState<string | null>(null)

  // Changing month must not leave the day picker on a day that doesn't exist
  // (e.g. 31 → February).
  useEffect(() => {
    setMobileDay(prev => Math.min(prev, days.length) || 1)
    setOpenPaletteKey(null)
  }, [month, year, days.length])

  const mobileDayInfo = days.find(d => d.day === mobileDay) ?? days[0]

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 h-full" ref={containerRef}>

      {/* Navigation */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
          <ChevronLeft size={15} />
        </button>
        <span className="text-sm font-semibold text-sh-grey min-w-[160px] text-center">
          {DUTCH_MONTHS[month - 1]} {year}
        </span>
        <button onClick={next} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
          <ChevronRight size={15} />
        </button>
        {loading && <Loader2 size={13} className="animate-spin text-zinc-600 ml-1" />}
        {canEditAll && (
          <button
            onClick={() => setShowConfig(true)}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
            title="Planning configuratie"
          >
            <Settings size={15} />
          </button>
        )}
      </div>

      {/* Zoeken & "Alleen ik" — zelfde rij op mobiel en desktop, zodat je niet
          telkens door de hele lijst hoeft te scrollen of te zoeken naar jezelf. */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setOnlyMine(false) }}
            placeholder="Zoek een naam…"
            disabled={onlyMine}
            className="w-full pl-8 pr-7 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors disabled:opacity-40"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Zoekopdracht wissen"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={toggleOnlyMine}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex-shrink-0 ${
            onlyMine
              ? 'bg-[#3A913F]/15 border-[#3A913F]/40 text-green-400'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <User size={13} />
          Alleen ik{myIdentity && onlyMine ? ` (${myIdentity})` : ''}
        </button>

        {myIdentity && !myColumn && (
          <button
            onClick={() => setShowNamePicker(true)}
            title="Wijzig wie jij bent in dit rooster"
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
          >
            wijzig
          </button>
        )}
      </div>

      {showNamePicker && (
        <NamePicker
          depts={activeDepts}
          guess={nameGuess}
          onPick={confirmIdentity}
          onCancel={() => setShowNamePicker(false)}
        />
      )}

      {multiDayTarget && (
        <MultiDayApplyModal
          days={days}
          sourceDay={mobileDay}
          personLabel={`${multiDayTarget.emp} — ${multiDayTarget.dept}`}
          preview={data[cellKey(mobileDay, multiDayTarget.dept, multiDayTarget.emp)] ?? emptyCell()}
          onConfirm={targetDays => {
            applyToMultipleDays(mobileDay, multiDayTarget.dept, multiDayTarget.emp, targetDays)
            setMultiDayTarget(null)
          }}
          onCancel={() => setMultiDayTarget(null)}
        />
      )}

      {/* Formatting toolbar — multi-select, copy/paste and bulk colouring are
          desktop interactions, so it's hidden on the mobile day view. */}
      <div className="hidden lg:block">
        <FormattingToolbar
          cell={activeCell}
          hasActive={!!activeKey || selCount > 0}
          selCount={selCount}
          onFormat={handleFormat}
          presets={presets}
          onApplyPreset={applyPresetToSelection}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      </div>

      {/* ── Mobile: single day, listed per person ── */}
      <div className="lg:hidden flex flex-col gap-3 flex-1 min-h-0">
        {/* Day strip — scrolls horizontally, current day centred by the browser */}
        <div className="scroll-x flex-shrink-0 -mx-1 px-1">
          <div className="flex gap-1.5">
            {days.map(d => {
              const isSel = d.day === mobileDay
              return (
                <button
                  key={d.day}
                  onClick={() => { setMobileDay(d.day); setOpenPaletteKey(null) }}
                  className={`flex-shrink-0 w-11 py-1.5 rounded-lg border text-center transition-colors ${
                    isSel
                      ? 'bg-zinc-700 border-zinc-500 text-white'
                      : d.isToday
                        ? 'bg-[#111d11] border-[#3A913F]/50 text-zinc-300'
                        : d.isWeekend
                          ? 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <span className="block text-[9px] uppercase tracking-wide opacity-70">{d.dayName.slice(0, 2)}</span>
                  <span className="block text-sm font-semibold leading-tight">{d.day}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setMobileDay(d => Math.max(1, d - 1))}
            disabled={mobileDay <= 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30"
            aria-label="Vorige dag"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-sh-grey">
            {mobileDayInfo?.dayName} {mobileDay} {DUTCH_MONTHS[month - 1]}
          </span>
          <button
            onClick={() => setMobileDay(d => Math.min(days.length, d + 1))}
            disabled={mobileDay >= days.length}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30"
            aria-label="Volgende dag"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {filteredDepts.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-600">
              {onlyMine ? 'Je kolom is niet gevonden in dit rooster.' : `Niemand gevonden voor "${search}".`}
            </p>
          )}
          {filteredDepts.map(dept => (
            <div key={dept.name}>
              <p className="section-label mb-1.5">{dept.name}</p>
              <div className="space-y-1.5">
                {dept.employees.map(emp => {
                  const key    = cellKey(mobileDay, dept.name, emp)
                  const cell   = data[key] ?? emptyCell()
                  const locked = !canEditCol(emp)
                  return (
                    <div key={emp} className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                      <div className="flex items-center gap-2 p-2">
                        <span className="w-24 flex-shrink-0 text-xs text-zinc-400 truncate">{emp}</span>
                        <input
                          value={cell.value}
                          disabled={locked}
                          onChange={e => handleTextChange(mobileDay, dept.name, emp, e.target.value)}
                          placeholder={locked ? '—' : 'Leeg'}
                          className="flex-1 min-w-0 bg-transparent px-2 py-1.5 rounded-lg outline-none text-sm placeholder:text-zinc-600 disabled:opacity-50"
                          style={{
                            backgroundColor: cell.bgColor ?? 'transparent',
                            color: cell.bgColor ? '#ffffff' : (cell.textColor ?? '#e4e4e7'),
                            fontWeight: cell.bold ? 600 : 400,
                          }}
                        />
                        {!locked && (
                          <button
                            onClick={() => setOpenPaletteKey(k => k === key ? null : key)}
                            aria-label="Kleur kiezen"
                            className="w-8 h-8 flex-shrink-0 rounded-lg border border-zinc-700 flex items-center justify-center"
                            style={{ backgroundColor: cell.bgColor ?? 'transparent' }}
                          >
                            {!cell.bgColor && <span className="w-3 h-3 rounded-full border border-zinc-600" />}
                          </button>
                        )}
                        {!locked && (
                          <button
                            onClick={() => setMultiDayTarget({ dept: dept.name, emp })}
                            aria-label="Zet op meerdere dagen"
                            title="Zet op meerdere dagen"
                            className="w-8 h-8 flex-shrink-0 rounded-lg border border-zinc-700 text-zinc-400 flex items-center justify-center"
                          >
                            <CalendarPlus size={14} />
                          </button>
                        )}
                      </div>
                      {openPaletteKey === key && !locked && (
                        <div className="px-2 pb-2 pt-1 border-t border-zinc-800 space-y-2">
                          {/* Presets — één tik zet tekst én kleur; nog eens tikken
                              op de al-actieve preset wist de cel weer. */}
                          {presets.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {presets.map(p => {
                                const active = cell.value.trim().toUpperCase() === p.name.toUpperCase() && cell.bgColor === p.color
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { applyPreset(mobileDay, dept.name, emp, p); setOpenPaletteKey(null) }}
                                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                                    style={active
                                      ? { backgroundColor: `${p.color}30`, border: `1px solid ${p.color}`, color: '#fff' }
                                      : { backgroundColor: `${p.color}15`, border: `1px solid ${p.color}55`, color: p.color }}
                                  >
                                    {p.name}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {BG_COLORS.map(c => (
                              <button
                                key={c.label}
                                onClick={() => {
                                  applyUpdates({ [key]: { ...cell, bgColor: c.value } })
                                  setOpenPaletteKey(null)
                                }}
                                title={c.label}
                                className="w-7 h-7 rounded-full"
                                style={{
                                  backgroundColor: c.display,
                                  border: cell.bgColor === c.value ? '2px solid #fff' : c.value === null ? '2px dashed #52525b' : '2px solid transparent',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable grid — desktop only */}
      <div
        className="hidden lg:block overflow-auto flex-1 border border-zinc-800 rounded-xl select-none"
        style={{ minWidth: 0 }}
        onMouseLeave={() => { if (isDragging) setIsDragging(false) }}
      >
        {allColumns.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-600">
            {onlyMine ? 'Je kolom is niet gevonden in dit rooster.' : `Niemand gevonden voor "${search}".`}
          </p>
        )}
        {allColumns.length > 0 && <table
          className="border-collapse text-xs"
          style={{ minWidth: DAY_W + DATE_W + allColumns.length * CELL_W }}
        >
          <thead>
            {/* Row 1 — Department headers */}
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 40, width: DAY_W, minWidth: DAY_W, backgroundColor: BG_HEAD }}
                className="border-b border-r border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-500">
                Dag
              </th>
              <th style={{ position: 'sticky', left: DAY_W, zIndex: 40, width: DATE_W, minWidth: DATE_W, backgroundColor: BG_HEAD }}
                className="border-b border-r-2 border-zinc-700 px-2 py-2 text-center font-semibold text-zinc-500">
                #
              </th>
              {filteredDepts.map(dept => (
                <th key={dept.name} colSpan={dept.employees.length}
                  style={{ backgroundColor: BG_HEAD, borderLeft: '2px solid #3f3f46' }}
                  className="border-b border-zinc-800 px-2 py-2 text-center font-semibold text-sh-grey whitespace-nowrap">
                  {dept.name}
                </th>
              ))}
            </tr>

            {/* Row 2 — Employee names (clickable for column select) */}
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 40, width: DAY_W, minWidth: DAY_W, backgroundColor: BG_HEAD }}
                className="border-b-2 border-r border-zinc-700" />
              <th style={{ position: 'sticky', left: DAY_W, zIndex: 40, width: DATE_W, minWidth: DATE_W, backgroundColor: BG_HEAD }}
                className="border-b-2 border-r-2 border-zinc-700" />
              {allColumns.map(({ dept, emp }, ci) => {
                const isFirstInDept = filteredDepts.find(d => d.name === dept)?.employees[0] === emp
                const isColSelected = sel &&
                  ci >= Math.min(sel.startCol, sel.endCol) &&
                  ci <= Math.max(sel.startCol, sel.endCol)
                const isOwn   = !canEditAll && myColumn === emp
                const isLocked = !canEditCol(emp)
                return (
                  <th key={`h-${dept}-${emp}-${ci}`}
                    onClick={() => onColHeaderClick(ci)}
                    style={{
                      width: CELL_W, minWidth: CELL_W, maxWidth: CELL_W,
                      backgroundColor: isColSelected ? 'rgba(59,130,246,0.15)' : isOwn ? 'rgba(58,145,63,0.1)' : BG_HEAD,
                      borderLeft: isFirstInDept ? '2px solid #3f3f46' : '1px solid #27272a',
                      cursor: 'pointer',
                    }}
                    className="border-b-2 border-zinc-700 px-1 py-1.5 text-center font-medium transition-colors select-none">
                    <span className={`block truncate px-1 ${isOwn ? 'text-green-400' : isLocked ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {emp}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {days.map(({ day, dayName, isWeekend, isToday }) => {
              const rowBg = isToday ? BG_TODAY : isWeekend ? BG_WKND : BG_BODY
              const isRowSelected = sel &&
                day >= Math.min(sel.startDay, sel.endDay) &&
                day <= Math.max(sel.startDay, sel.endDay)

              return (
                <tr key={day}>
                  {/* Day name — click to select row */}
                  <td
                    onClick={() => onRowHeaderClick(day)}
                    style={{
                      position: 'sticky', left: 0, zIndex: 20,
                      width: DAY_W, minWidth: DAY_W,
                      // Sticky cells must stay opaque — the data columns scroll
                      // underneath them. So the selection tint is layered over
                      // an opaque base instead of replacing it, which would let
                      // the moving content show through.
                      backgroundColor: rowBg,
                      backgroundImage: isRowSelected ? `linear-gradient(${SEL_BG}, ${SEL_BG})` : undefined,
                      cursor: 'pointer',
                    }}
                    className={`border-b border-r border-zinc-800 px-3 py-0 font-medium whitespace-nowrap hover:bg-zinc-800 transition-colors select-none ${
                      isToday ? 'text-sh-grey' : isWeekend ? 'text-zinc-500' : 'text-zinc-300'
                    }`}>
                    {dayName}
                  </td>

                  {/* Date — click to select row */}
                  <td
                    onClick={() => onRowHeaderClick(day)}
                    style={{
                      position: 'sticky', left: DAY_W, zIndex: 20,
                      width: DATE_W, minWidth: DATE_W,
                      backgroundColor: rowBg,
                      backgroundImage: isRowSelected ? `linear-gradient(${SEL_BG}, ${SEL_BG})` : undefined,
                      cursor: 'pointer',
                    }}
                    className={`border-b border-r-2 border-zinc-700 px-2 py-0 text-center font-semibold select-none ${
                      isToday ? 'text-sh-grey' : isWeekend ? 'text-zinc-600' : 'text-zinc-400'
                    }`}>
                    {day}
                  </td>

                  {/* Employee cells */}
                  {allColumns.map(({ dept, emp }, ci) => {
                    const key = cellKey(day, dept, emp)
                    const cell = data[key] ?? emptyCell()
                    const isActive = activeKey === key
                    const isSelected = selectedKeys.has(key)
                    const isEditing = editingKey === key
                    const isFirstInDept = filteredDepts.find(d => d.name === dept)?.employees[0] === emp
                    const locked = !canEditCol(emp)

                    const cellBg = cell.bgColor
                      ?? (isSelected ? SEL_BG : isWeekend ? BG_WKND : isToday ? BG_TODAY : 'transparent')

                    return (
                      <td
                        key={`${day}-${dept}-${emp}-${ci}`}
                        onMouseDown={e => onCellMouseDown(day, ci, e)}
                        onMouseEnter={() => onCellMouseEnter(day, ci)}
                        onClick={e => onCellClick(day, ci, e)}
                        style={{
                          width: CELL_W, minWidth: CELL_W, maxWidth: CELL_W,
                          padding: 0,
                          backgroundColor: cellBg,
                          borderLeft: isFirstInDept ? '2px solid #3f3f46' : '1px solid #1a1a1a',
                          outline: isActive ? '2px solid #3A913F' : isSelected ? `1px solid ${SEL_BDR}` : undefined,
                          outlineOffset: isActive ? '-2px' : '-1px',
                          cursor: locked ? 'default' : 'text',
                          userSelect: 'none',
                          opacity: locked ? 0.45 : 1,
                        }}
                        className="border-b border-zinc-800/60"
                      >
                        <input
                          data-key={key}
                          type="text"
                          value={cell.value}
                          onChange={e => !locked && handleTextChange(day, dept, emp, e.target.value)}
                          onFocus={e => {
                            if (locked) return
                            // Aan het einde van een sleep-selectie landt de
                            // muisknop-loslating op de cel onder de cursor, en
                            // browsers focussen een tekstveld standaard zodra
                            // de klik daar terechtkomt — los van wat onCellClick
                            // beslist (die herkent een sleep prima via
                            // dragMovedRef, maar dat voorkomt niet dat de
                            // browser het veld zelf al focust). Zonder deze
                            // check ging zo'n sleep-selectie altijd eindigen met
                            // die ene cel in bewerkmodus, wat Backspace liet
                            // denken dat er maar één cel geselecteerd was.
                            if (dragMovedRef.current) { e.target.blur(); return }
                            setActiveKey(key)
                            setEditingKey(key)
                            if (!sel || !selectedKeys.has(key)) {
                              setSel({ startDay: day, endDay: day, startCol: ci, endCol: ci })
                            }
                          }}
                          onBlur={() => {
                            setEditingKey(null)
                            setActiveKey(prev => prev === key ? null : prev)
                          }}
                          readOnly={locked}
                          style={{
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            lineHeight: 'inherit',
                            letterSpacing: 'inherit',
                            fontWeight: cell.bold ? 'bold' : 'normal',
                            color: cell.textColor ?? '#ffffff',
                            textTransform: 'uppercase',
                            minHeight: 36,
                            backgroundColor: 'transparent',
                            width: '100%',
                            padding: '0 4px',
                            outline: 'none',
                            cursor: locked ? 'default' : isEditing ? 'text' : 'cell',
                            userSelect: isEditing ? 'auto' : 'none',
                            textAlign: 'center',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                          tabIndex={-1}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: BG_TODAY, border: '1px solid #3A913F40' }} />
          <span className="text-[10px] text-zinc-600">Vandaag</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: BG_WKND, border: '1px solid #27272a' }} />
          <span className="text-[10px] text-zinc-600">Weekend</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SEL_BG, border: `1px solid ${SEL_BDR}` }} />
          <span className="text-[10px] text-zinc-600">Selectie</span>
        </div>
        <span className="text-[10px] text-zinc-500 ml-auto">Automatisch opgeslagen · Ctrl+C kopiëren · Ctrl+V plakken · Ctrl+B vet</span>
      </div>

      {showConfig && (
        <PlanningConfigModal
          departments={activeDepts}
          onSave={handleSaveConfig}
          onClose={() => setShowConfig(false)}
          isBeheer={isBeheer}
        />
      )}
    </div>
  )
}
