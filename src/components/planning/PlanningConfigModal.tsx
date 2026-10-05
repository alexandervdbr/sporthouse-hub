'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  X,
  Check,
  GripVertical,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Archive,
  ArchiveRestore,
  TriangleAlert,
} from 'lucide-react'
import { normName, UNASSIGNED_DEPT, type Department } from '@/lib/planning-config'
import type { PlanningPreset } from '@/lib/planning-presets'
import type { PlanningRename } from '@/lib/planning-rename'

interface ArchivedEmployee { dept: string; emp: string }
interface Staleness { dept: string; emp: string; lastEntryDate: string }

// Een naam in de kladversie, met waar hij vandaan kwam. Die herkomst reist
// mee met het object, dus slepen tussen afdelingen en hernoemen houden hem
// automatisch bij — ook als je beide doet, of de afdeling zelf hernoemt.
//
// Dat is nodig omdat planning_entries op (afdeling, naam) staat: wat hier een
// tekstwijziging lijkt, is in de database een verhuizing. `orig: null` betekent
// nieuw toegevoegd, dus valt er niets te verhuizen.
interface DraftEmp {
  name: string
  orig: { dept: string; emp: string } | null
}

interface DraftDept {
  name: string
  employees: DraftEmp[]
}

interface Props {
  departments: Department[]
  onSave: (d: Department[]) => Promise<void>
  // Opslaan mét verhuizingen: gaat via /api/planning/rename zodat de
  // bestaande cellen meegaan naar de nieuwe naam of afdeling.
  onRename: (renames: PlanningRename[], departments: Department[]) => Promise<{ ok: true } | { ok: false; error: string }>
  archived: ArchivedEmployee[]
  onSaveArchived: (a: ArchivedEmployee[]) => Promise<void>
  // Real Team contact names (see /team) — anyone here who isn't in this
  // list either left Team or was always a one-off manually-typed entry;
  // either way it's flagged so a beheerder can decide what to do with it.
  teamNames: string[]
  onClose: () => void
  // Presets zijn beheer-only (de API weigert schrijven sowieso, maar dan moet
  // de tab er ook niet staan om een 403 uit te lokken).
  isBeheer: boolean
}

const STALE_AFTER_DAYS = 60

function daysAgo(dateStr: string) {
  const then = new Date(dateStr + 'T00:00:00Z').getTime()
  return Math.floor((Date.now() - then) / 86_400_000)
}

const PRESET_COLORS = ['#16a34a', '#ea580c', '#2563eb', '#9333ea', '#dc2626', '#ca8a04', '#db2777', '#52525b']

// ─── Presets-tab: SHG, FOS, en wat een beheerder verder wil toevoegen ────────
// Elke actie schrijft meteen weg — geen aparte "Opslaan"-stap zoals bij de
// afdelingen, want er is geen lokale kladversie om te verwerpen.
function PresetsPanel() {
  const [presets, setPresets] = useState<PlanningPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!colorPickerFor) return
    function onOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setColorPickerFor(null)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [colorPickerFor])

  // Alphabetical, not insertion/sort_order — a growing list of statuses just
  // reads as random clutter otherwise.
  const sortedPresets = useMemo(
    () => [...presets].sort((a, b) => a.name.localeCompare(b.name, 'nl')),
    [presets]
  )

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/planning/presets')
      .then(r => r.json())
      .then(setPresets)
      .catch(() => setError('Kon presets niet laden.'))
      .finally(() => setLoading(false))
  }, [])

  async function addPreset() {
    if (!newName.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/planning/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = await res.json()
      setPresets(prev => [...prev, created])
      setNewName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toevoegen mislukt')
    }
    setCreating(false)
  }

  async function patchPreset(p: PlanningPreset, fields: Partial<PlanningPreset>) {
    setBusyId(p.id); setError('')
    try {
      const res = await fetch('/api/planning/presets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, ...fields }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setPresets(prev => prev.map(x => x.id === p.id ? updated : x))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
    setBusyId(null)
  }

  async function removePreset(p: PlanningPreset) {
    if (!confirm(`Preset "${p.name}" verwijderen?\n\nCellen die er al mee gestempeld zijn behouden hun tekst en kleur.`)) return
    setBusyId(p.id)
    await fetch('/api/planning/presets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id }),
    })
    setPresets(prev => prev.filter(x => x.id !== p.id))
    setBusyId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-zinc-600">
        <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Een preset zet in één tik zowel de tekst als de achtergrondkleur van een cel — sneller dan
        typen en dan apart een kleur kiezen, en consistent ongeacht wie de cel invult.
      </p>

      {error && (
        <p className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-xs text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {sortedPresets.map(p => (
          <div key={p.id} className="relative flex items-center gap-2 p-2 rounded-xl border border-zinc-800 bg-zinc-950/40">
            <button
              onClick={() => setColorPickerFor(id => id === p.id ? null : p.id)}
              aria-label={`Kleur wijzigen voor ${p.name}`}
              className="w-4 h-4 rounded-full flex-shrink-0 ring-1 ring-white/10 hover:ring-white/30 transition-all"
              style={{ backgroundColor: p.color }}
            />
            <span className="flex-1 min-w-0 text-sm text-zinc-100 truncate">{p.name}</span>
            <button
              onClick={() => removePreset(p)}
              disabled={busyId === p.id}
              aria-label={`${p.name} verwijderen`}
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400"
            >
              {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            </button>

            {colorPickerFor === p.id && (
              <div ref={colorPickerRef} onClick={e => e.stopPropagation()}
                className="absolute left-0 top-full mt-1 z-30 flex items-center gap-1.5 p-2 rounded-lg shadow-2xl bg-zinc-800 border border-zinc-700">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { patchPreset(p, { color: c }); setColorPickerFor(null) }}
                    aria-label={`Kleur ${c}`}
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: c, border: p.color === c ? '2px solid #fff' : '2px solid transparent' }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {sortedPresets.length === 0 && <p className="py-4 text-center text-sm text-zinc-600 col-span-full">Nog geen presets.</p>}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-zinc-600 mb-2">Preset toevoegen</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addPreset() }}
            placeholder="Naam, bv. SHG"
            className="flex-1 min-w-0 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <div className="flex items-center gap-1">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                aria-label={`Kleur ${c}`}
                className="w-5 h-5 rounded-full"
                style={{ backgroundColor: c, border: newColor === c ? '2px solid #fff' : '2px solid transparent' }}
              />
            ))}
          </div>
          <button
            onClick={addPreset}
            disabled={creating || !newName.trim()}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: '#3A913F' }}
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlanningConfigModal({ departments, onSave, onRename, archived, onSaveArchived, teamNames, onClose, isBeheer }: Props) {
  const [tab, setTab] = useState<'afdelingen' | 'presets'>('afdelingen')
  const [depts, setDepts] = useState<DraftDept[]>(() =>
    departments.map(d => ({
      name: d.name,
      employees: d.employees.map(emp => ({ name: emp, orig: { dept: d.name, emp } })),
    }))
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const teamNameSet = useMemo(() => new Set(teamNames.map(normName)), [teamNames])

  // Archiveren is een losstaande, meteen-opslaande actie (zoals presets) —
  // geen aparte kladversie zoals bij afdelingen, want er is niets te
  // verwerpen: één klik = actief/inactief wisselen.
  const [busyArchive, setBusyArchive] = useState<string | null>(null)
  const isArchivedPair = (dept: string, emp: string) => archived.some(a => a.dept === dept && a.emp === emp)

  async function toggleArchived(dept: string, emp: string) {
    setBusyArchive(`${dept}|${emp}`)
    const next = isArchivedPair(dept, emp)
      ? archived.filter(a => !(a.dept === dept && a.emp === emp))
      : [...archived, { dept, emp }]
    await onSaveArchived(next)
    setBusyArchive(null)
  }

  // Everyone flagged "niet in Team" (see the badge below), collected up
  // front so a beheerder can spot every remaining conflict at a glance
  // instead of scrolling every department looking for the badge by eye.
  const [showNotInTeamDigest, setShowNotInTeamDigest] = useState(true)
  const [flashDept, setFlashDept] = useState<number | null>(null)
  const deptRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const notInTeamList = useMemo(() => {
    const out: { dept: string; deptIdx: number; emp: string }[] = []
    depts.forEach((d, di) => {
      d.employees.forEach(({ name: emp }) => {
        const isArch = archived.some(a => a.dept === d.name && a.emp === emp)
        if (!isArch && !teamNameSet.has(normName(emp))) out.push({ dept: d.name, deptIdx: di, emp })
      })
    })
    return out
  }, [depts, teamNameSet, archived])

  function jumpToDept(deptIdx: number) {
    setTab('afdelingen')
    setCollapsed(prev => ({ ...prev, [deptIdx]: false }))
    requestAnimationFrame(() => {
      deptRefs.current[deptIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setFlashDept(deptIdx)
    setTimeout(() => setFlashDept(d => (d === deptIdx ? null : d)), 1500)
  }

  const [staleness, setStaleness] = useState<Staleness[]>([])
  useEffect(() => {
    fetch('/api/planning/staleness').then(r => r.ok ? r.json() : []).then(setStaleness).catch(() => {})
  }, [])
  const stalenessMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of staleness) m.set(`${s.dept}|${s.emp}`, s.lastEntryDate)
    return m
  }, [staleness])

  // Inline rename state
  const [renamingDept, setRenamingDept] = useState<number | null>(null)
  const [renamingEmp, setRenamingEmp] = useState<{ dept: number; emp: number } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Drag state for departments
  const dragDeptRef = useRef<number | null>(null)

  // Skipped while renaming so Escape cancels just the rename, not the whole
  // modal — the rename inputs' own onKeyDown already handles that case.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && renamingDept === null && renamingEmp === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, renamingDept, renamingEmp])
  const [dragOverDept, setDragOverDept] = useState<number | null>(null)

  // Drag state for employees
  const dragEmpRef = useRef<{ dept: number; emp: number } | null>(null)
  const [dragOverEmp, setDragOverEmp] = useState<{ dept: number; emp: number } | null>(null)

  // ─── Dept rename ──────────────────────────────────────────────────────────

  function startRenameDept(idx: number) {
    setRenamingDept(idx)
    setRenameValue(depts[idx].name)
    setRenamingEmp(null)
  }

  function confirmRenameDept() {
    if (renamingDept === null) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      setDepts(prev => prev.map((d, i) => i === renamingDept ? { ...d, name: trimmed } : d))
    }
    setRenamingDept(null)
  }

  function cancelRenameDept() {
    setRenamingDept(null)
  }

  // ─── Emp rename ───────────────────────────────────────────────────────────

  function startRenameEmp(deptIdx: number, empIdx: number) {
    setRenamingEmp({ dept: deptIdx, emp: empIdx })
    setRenameValue(depts[deptIdx].employees[empIdx].name)
    setRenamingDept(null)
  }

  function confirmRenameEmp() {
    if (!renamingEmp) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      setDepts(prev => prev.map((d, i) => {
        if (i !== renamingEmp.dept) return d
        const emps = [...d.employees]
        emps[renamingEmp.emp] = { ...emps[renamingEmp.emp], name: trimmed }
        return { ...d, employees: emps }
      }))
    }
    setRenamingEmp(null)
  }

  function cancelRenameEmp() {
    setRenamingEmp(null)
  }

  // ─── Emp actions ──────────────────────────────────────────────────────────

  function addEmployee(deptIdx: number) {
    setDepts(prev => prev.map((d, i) => {
      if (i !== deptIdx) return d
      return { ...d, employees: [...d.employees, { name: 'Nieuwe naam', orig: null }] }
    }))
    // Auto-enter rename for new employee
    setTimeout(() => {
      setDepts(prev => {
        const empIdx = prev[deptIdx].employees.length - 1
        setRenamingEmp({ dept: deptIdx, emp: empIdx })
        setRenameValue('Nieuwe naam')
        return prev
      })
    }, 0)
  }

  function deleteEmployee(deptIdx: number, empIdx: number) {
    const slot = depts[deptIdx].employees[empIdx]
    // Alleen als er iets te verliezen is: een pas toegevoegde naam (orig null)
    // heeft nog geen planning, dus daar valt niets over te melden.
    if (slot.orig) {
      const ok = confirm(
        `"${slot.name}" definitief uit het rooster halen?\n\n` +
        `De bestaande planning onder deze naam blijft in de database staan, maar ` +
        `is nergens meer te zien — ook niet in Statistieken.\n\n` +
        `Wil je iemand die er niet meer werkt gewoon uit de teamweergave halen, ` +
        `gebruik dan archiveren: dan blijven oude weken wel kloppen.`
      )
      if (!ok) return
    }
    setDepts(prev => prev.map((d, i) => {
      if (i !== deptIdx) return d
      const emps = d.employees.filter((_, ei) => ei !== empIdx)
      return { ...d, employees: emps }
    }))
    if (renamingEmp?.dept === deptIdx && renamingEmp.emp === empIdx) {
      setRenamingEmp(null)
    }
  }

  // ─── Add/delete dept ────────────────────────────────────────────────────────

  function addDepartment() {
    const idx = depts.length
    setDepts(prev => [...prev, { name: 'Nieuwe afdeling', employees: [] }])
    setTimeout(() => {
      setRenamingDept(idx)
      setRenameValue('Nieuwe afdeling')
    }, 0)
  }

  function deleteDepartment(idx: number) {
    const dept = depts[idx]
    if (dept.employees.length > 0) {
      const ok = confirm(
        `Afdeling "${dept.name}" verwijderen?\n\n` +
        `De ${dept.employees.length} medewerker(s) hierin verdwijnen ook uit deze afdeling — ` +
        `een Team-lid krijgt bij de volgende synchronisatie gewoon opnieuw een plek in "${UNASSIGNED_DEPT}".\n\n` +
        `Hun bestaande planning staat op deze afdelingsnaam en blijft daarop staan: ` +
        `die is daarna nergens meer te zien. Wil je ze behouden, sleep ze dan eerst ` +
        `naar een andere afdeling — dan verhuist de planning mee.`
      )
      if (!ok) return
    }
    setDepts(prev => prev.filter((_, i) => i !== idx))
    if (renamingDept === idx) setRenamingDept(null)
  }

  // ─── Dept drag ────────────────────────────────────────────────────────────

  function onDeptDragStart(idx: number) {
    dragDeptRef.current = idx
  }

  function onDeptDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverDept(idx)
  }

  function onDeptDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const from = dragDeptRef.current
    if (from === null || from === idx) {
      setDragOverDept(null)
      return
    }
    setDepts(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(idx, 0, moved)
      // Adjust renamingDept index
      if (renamingDept !== null) {
        if (renamingDept === from) setRenamingDept(idx)
        else if (from < idx && renamingDept > from && renamingDept <= idx) setRenamingDept(renamingDept - 1)
        else if (from > idx && renamingDept < from && renamingDept >= idx) setRenamingDept(renamingDept + 1)
      }
      return next
    })
    dragDeptRef.current = null
    setDragOverDept(null)
  }

  function onDeptDragEnd() {
    dragDeptRef.current = null
    setDragOverDept(null)
  }

  // ─── Emp drag ─────────────────────────────────────────────────────────────

  function onEmpDragStart(deptIdx: number, empIdx: number) {
    dragEmpRef.current = { dept: deptIdx, emp: empIdx }
  }

  function onEmpDragOver(e: React.DragEvent, deptIdx: number, empIdx: number) {
    e.preventDefault()
    setDragOverEmp({ dept: deptIdx, emp: empIdx })
  }

  function onEmpDrop(e: React.DragEvent, deptIdx: number, empIdx: number) {
    e.preventDefault()
    const from = dragEmpRef.current
    setDragOverEmp(null)
    if (!from || (from.dept === deptIdx && from.emp === empIdx)) { dragEmpRef.current = null; return }
    setDepts(prev => {
      const next = prev.map(d => ({ ...d, employees: [...d.employees] }))
      const [moved] = next[from.dept].employees.splice(from.emp, 1)
      next[deptIdx].employees.splice(empIdx, 0, moved)
      return next
    })
    dragEmpRef.current = null
  }

  function onEmpDragEnd() {
    dragEmpRef.current = null
    setDragOverEmp(null)
  }

  // Dropping directly on a department's header row (rather than on one of
  // its employee rows) moves someone to the end of that department — the
  // only way to move someone into a department with no rows to drop onto
  // yet (e.g. a newly added one, or a collapsed one).
  function onDeptHeaderDragOver(e: React.DragEvent, deptIdx: number) {
    if (!dragEmpRef.current) return
    e.preventDefault()
    setDragOverEmp({ dept: deptIdx, emp: -1 })
  }

  function onDeptHeaderDrop(e: React.DragEvent, deptIdx: number) {
    const from = dragEmpRef.current
    if (!from) return
    e.preventDefault()
    setDragOverEmp(null)
    if (from.dept === deptIdx) { dragEmpRef.current = null; return }
    setDepts(prev => {
      const next = prev.map(d => ({ ...d, employees: [...d.employees] }))
      const [moved] = next[from.dept].employees.splice(from.emp, 1)
      next[deptIdx].employees.push(moved)
      return next
    })
    dragEmpRef.current = null
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  // Wat er aan verhuizingen in de kladversie zit: elke naam die nog bij een
  // bestaande (afdeling, naam) hoort maar er niet meer op staat. Dat vangt
  // hernoemen, slepen naar een andere afdeling, een hernoemde afdeling, en
  // alle combinaties daarvan — de herkomst zit op het slot, niet op de plek.
  const pendingRenames = useMemo<PlanningRename[]>(() => {
    const out: PlanningRename[] = []
    for (const d of depts) {
      for (const e of d.employees) {
        if (!e.orig) continue
        const name = e.name.trim()
        if (!name) continue
        if (e.orig.dept !== d.name || e.orig.emp !== name) {
          out.push({ fromDept: e.orig.dept, fromEmp: e.orig.emp, toDept: d.name, toEmp: name })
        }
      }
    }
    return out
  }, [depts])

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const plain: Department[] = depts.map(d => ({
        name: d.name,
        employees: d.employees.map(e => e.name),
      }))

      // Niets verhuisd: gewoon de config opslaan, zoals het altijd ging.
      if (pendingRenames.length === 0) {
        await onSave(plain)
        onClose()
        return
      }

      // Wél verhuisd: via de rename-route, zodat de bestaande cellen mee
      // naar de nieuwe naam gaan in plaats van onder de oude achter te
      // blijven. Mislukt dat, dan blijft de modal open met de reden — de
      // kladversie staat er nog, dus niemand verliest zijn werk.
      const res = await onRename(pendingRenames, plain)
      if (!res.ok) {
        setSaveError(res.error)
        return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex flex-col w-full max-w-[540px] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200">Planning configuratie</h2>
          <button
            onClick={onClose}
            aria-label="Sluiten"
            title="Sluiten"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs — Presets alleen zichtbaar voor beheerders; de API weigert
            schrijven sowieso, maar dan moet de tab er ook niet staan. */}
        {isBeheer && (
          <div className="px-4 pt-3 flex-shrink-0">
            <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 w-fit">
              {(['afdelingen', 'presets'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400'
                  }`}
                >
                  {t === 'afdelingen' ? 'Afdelingen' : 'Presets'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {isBeheer && tab === 'presets' && <PresetsPanel />}

          {(!isBeheer || tab === 'afdelingen') && notInTeamList.length > 0 && (
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 overflow-hidden">
              <button
                onClick={() => setShowNotInTeamDigest(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-400"
              >
                <TriangleAlert size={13} />
                {notInTeamList.length} naam{notInTeamList.length === 1 ? '' : 'en'} niet gekoppeld aan Team
                <span className="ml-auto text-amber-600">
                  {showNotInTeamDigest ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
              </button>
              {showNotInTeamDigest && (
                <div className="px-3 pb-2 space-y-0.5">
                  {notInTeamList.map((n, i) => (
                    <button
                      key={i}
                      onClick={() => jumpToDept(n.deptIdx)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-xs text-zinc-300 hover:bg-amber-900/20 transition-colors text-left"
                    >
                      <span className="truncate">{n.emp}</span>
                      <span className="flex-shrink-0 text-[10px] text-zinc-500">{n.dept}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(!isBeheer || tab === 'afdelingen') && depts.map((dept, di) => {
            const isDragTarget = dragOverDept === di || dragOverEmp?.dept === di && dragOverEmp.emp === -1
            const isCollapsed = !!collapsed[di]
            const isRenamingThis = renamingDept === di
            const isDraggingThis = dragDeptRef.current === di

            return (
              <div
                key={di}
                ref={el => { deptRefs.current[di] = el }}
                draggable
                onDragStart={() => onDeptDragStart(di)}
                onDragOver={e => dragEmpRef.current ? onDeptHeaderDragOver(e, di) : onDeptDragOver(e, di)}
                onDrop={e => dragEmpRef.current ? onDeptHeaderDrop(e, di) : onDeptDrop(e, di)}
                onDragEnd={onDeptDragEnd}
                className="group rounded-xl border transition-all"
                style={{
                  borderColor: flashDept === di ? '#f59e0b' : isDragTarget ? '#2563eb' : '#27272a',
                  backgroundColor: flashDept === di ? 'rgba(245,158,11,0.08)' : isDragTarget ? 'rgba(37,99,235,0.06)' : '#111111',
                  opacity: isDraggingThis ? 0.5 : 1,
                }}
              >
                {/* Dept header row */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {/* Drag handle */}
                  <span className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing flex-shrink-0">
                    <GripVertical size={15} />
                  </span>

                  {/* Collapse toggle */}
                  <button
                    onClick={() => setCollapsed(prev => ({ ...prev, [di]: !prev[di] }))}
                    className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {isCollapsed
                      ? <ChevronRight size={14} />
                      : <ChevronDown size={14} />
                    }
                  </button>

                  {/* Dept name / rename input */}
                  {isRenamingThis ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmRenameDept()
                          if (e.key === 'Escape') cancelRenameDept()
                        }}
                        className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-600"
                      />
                      <button onClick={confirmRenameDept} aria-label="Naam bevestigen" title="Naam bevestigen" className="flex-shrink-0 text-green-500 hover:text-green-400 transition-colors">
                        <Check size={14} />
                      </button>
                      <button onClick={cancelRenameDept} aria-label="Annuleren" title="Annuleren" className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="flex-1 text-left text-xs font-semibold text-zinc-300 hover:text-zinc-100 truncate transition-colors"
                      onClick={() => startRenameDept(di)}
                      title="Klik om naam aan te passen"
                    >
                      {dept.name}
                    </button>
                  )}

                  {/* Employee count badge */}
                  <span className="flex-shrink-0 text-[10px] text-zinc-600 ml-1">
                    {dept.employees.length} medewerkers
                  </span>

                  {/* Delete department (hover) */}
                  <button
                    onClick={() => deleteDepartment(di)}
                    title="Afdeling verwijderen"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Employee list */}
                {!isCollapsed && (
                  <div className="border-t border-zinc-800 px-3 pb-2 pt-1 space-y-0.5">
                    {dept.employees.map((slot, ei) => {
                      const emp = slot.name
                      const isRenamingThisEmp = renamingEmp?.dept === di && renamingEmp.emp === ei
                      const isEmpDragTarget = dragOverEmp?.dept === di && dragOverEmp.emp === ei
                      const isEmpDragging = dragEmpRef.current?.dept === di && dragEmpRef.current.emp === ei
                      const isArchivedEmp = isArchivedPair(dept.name, emp)
                      const isBusy = busyArchive === `${dept.name}|${emp}`
                      const lastEntry = stalenessMap.get(`${dept.name}|${emp}`)
                      const stale = !isArchivedEmp && lastEntry && daysAgo(lastEntry) >= STALE_AFTER_DAYS
                      const notInTeam = !isArchivedEmp && !teamNameSet.has(normName(emp))
                      // Nog niet opgeslagen hernoemd of versleept. Archiveren
                      // schrijft meteen weg op (afdeling, naam) en zou dan naar
                      // een naam wijzen die in de database nog niet bestaat —
                      // dus eerst opslaan.
                      const slotMoved = !!slot.orig && (slot.orig.dept !== dept.name || slot.orig.emp !== emp)

                      return (
                        <div
                          key={slot.orig ? `o:${slot.orig.dept}|${slot.orig.emp}` : `n:${di}-${ei}`}
                          draggable
                          onDragStart={() => onEmpDragStart(di, ei)}
                          onDragOver={e => onEmpDragOver(e, di, ei)}
                          onDrop={e => onEmpDrop(e, di, ei)}
                          onDragEnd={onEmpDragEnd}
                          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all"
                          style={{
                            backgroundColor: isEmpDragTarget ? 'rgba(37,99,235,0.10)' : 'transparent',
                            border: isEmpDragTarget ? '1px solid #2563eb' : '1px solid transparent',
                            opacity: isEmpDragging ? 0.5 : isArchivedEmp ? 0.5 : 1,
                          }}
                        >
                          {/* Emp drag handle */}
                          <span className="text-zinc-700 hover:text-zinc-500 cursor-grab active:cursor-grabbing flex-shrink-0">
                            <GripVertical size={13} />
                          </span>

                          {/* Emp name / rename */}
                          {isRenamingThisEmp ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') confirmRenameEmp()
                                  if (e.key === 'Escape') cancelRenameEmp()
                                }}
                                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-xs text-zinc-200 outline-none focus:border-blue-600"
                              />
                              <button onClick={confirmRenameEmp} aria-label="Naam bevestigen" title="Naam bevestigen" className="flex-shrink-0 text-green-500 hover:text-green-400 transition-colors">
                                <Check size={13} />
                              </button>
                              <button onClick={cancelRenameEmp} aria-label="Annuleren" title="Annuleren" className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors">
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                              onClick={() => startRenameEmp(di, ei)}
                              title="Klik om naam aan te passen"
                            >
                              <span className="truncate">{emp}</span>
                              {isArchivedEmp && (
                                <span className="flex-shrink-0 text-[9px] uppercase tracking-wide text-zinc-600">inactief</span>
                              )}
                              {notInTeam && (
                                <span
                                  className="flex-shrink-0 text-[9px] uppercase tracking-wide text-zinc-600 border border-zinc-700 rounded px-1"
                                  title="Geen actieve naamsovereenkomst met Team — ofwel iemand die er niet meer werkt, ofwel een tijdelijke/eenmalige naam"
                                >
                                  niet in Team
                                </span>
                              )}
                              {slotMoved && (
                                <span
                                  className="flex-shrink-0 text-[9px] uppercase tracking-wide text-sky-400 border border-sky-900 rounded px-1"
                                  title={`Was: ${slot.orig!.dept} — ${slot.orig!.emp}. De bestaande planning verhuist mee bij opslaan.`}
                                >
                                  verplaatst
                                </span>
                              )}
                              {stale && (
                                <span
                                  className="flex-shrink-0 flex items-center gap-1 text-[9px] text-amber-500"
                                  title={`Laatste planning: ${lastEntry}`}
                                >
                                  <TriangleAlert size={10} />
                                  {daysAgo(lastEntry!)}d geleden
                                </span>
                              )}
                            </button>
                          )}

                          {/* Archive toggle (hover, or always if archived) */}
                          {!isRenamingThisEmp && (
                            <button
                              onClick={() => toggleArchived(dept.name, emp)}
                              disabled={isBusy || slotMoved}
                              title={
                                slotMoved
                                  ? 'Eerst opslaan — deze naam is nog niet verplaatst in de database'
                                  : isArchivedEmp ? 'Terug actief maken' : 'Archiveren (blijft zichtbaar in oude planningen)'
                              }
                              className={`flex-shrink-0 transition-all text-zinc-600 hover:text-amber-400 disabled:cursor-not-allowed disabled:hover:text-zinc-600 ${
                                isArchivedEmp ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              {isBusy ? <Loader2 size={13} className="animate-spin" /> : isArchivedEmp ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                            </button>
                          )}

                          {/* Delete button (hover) */}
                          {!isRenamingThisEmp && (
                            <button
                              onClick={() => deleteEmployee(di, ei)}
                              title="Definitief verwijderen"
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {/* Add employee */}
                    <button
                      onClick={() => addEmployee(di)}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                    >
                      <Plus size={13} />
                      Medewerker toevoegen
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Add department */}
          {tab === 'afdelingen' && (
            <button
              onClick={addDepartment}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-dashed border-zinc-800 text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition-colors"
            >
              <Plus size={14} />
              Afdeling toevoegen
            </button>
          )}
        </div>

        {/* Footer — presets slaan meteen op bij elke actie, dus enkel de
            afdelingen-tab heeft een expliciete Opslaan-stap nodig. */}
        {tab === 'presets' ? (
          <div className="flex items-center justify-end px-5 py-4 border-t border-zinc-800 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors"
            >
              Sluiten
            </button>
          </div>
        ) : (
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800 flex-shrink-0">
          {saveError && <p className="mr-auto text-[11px] text-red-400">{saveError}</p>}
          {!saveError && pendingRenames.length > 0 && (
            <p className="mr-auto text-[11px] text-zinc-500">
              {pendingRenames.length} naam{pendingRenames.length === 1 ? '' : 'en'} verplaatst —
              de bestaande planning verhuist mee.
            </p>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: saving ? '#1d4ed8' : '#2563eb' }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Opslaan
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
