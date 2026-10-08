'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
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
  Link2,
  Link2Off,
} from 'lucide-react'
import { UNASSIGNED_DEPT, type Department } from '@/lib/planning-config'
import type { PlanningPreset } from '@/lib/planning-presets'
import type { PlanningLinkRow } from '@/lib/planning-links'

export interface PlanningTeamContact {
  id: string
  name: string
  employment_type?: string | null
  active_until?: string | null
  active?: boolean
}
interface Staleness { dept: string; emp: string; lastEntryDate: string; entryCount: number }

// Een afdeling in de kladversie. `employees` zijn contact-id's.
//
// Hier stond tot oktober 2026 een slot-model dat per naam bijhield waar hij
// vandaan kwam, zodat hernoemen en verslepen de planning konden meenemen. Dat
// is overbodig geworden: een planningsdag hangt nu aan een contact-id, dus
// verslepen verplaatst niets en hernoemen gebeurt in Team. Zie
// supabase/migrations/0053_planning_op_contact_id.sql.
interface DraftDept {
  name: string
  employees: string[]
}

interface Props {
  departments: Department[]
  onSave: (d: Department[]) => Promise<void>
  // Contact-id's van wie uit de teamweergave gehouden wordt.
  archived: string[]
  onSaveArchived: (a: string[]) => Promise<void>
  // De echte Team-contacten (zie /team). Wie hier niet tussen staat is ofwel
  // uit Team verdwenen, ofwel een eenmalig getypte naam — in beide gevallen
  // gemarkeerd zodat een beheerder kan beslissen wat ermee moet.
  //
  // Met status erbij, want "staat niet in Team" en "stagiair die gestopt is"
  // zien er voor het raster hetzelfde uit en zijn iets totaal anders: het
  // eerste is een probleem, het tweede is het systeem dat werkt.
  teamContacts: PlanningTeamContact[]
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

export default function PlanningConfigModal({ departments, onSave, archived, onSaveArchived, teamContacts, onClose, isBeheer }: Props) {
  const [tab, setTab] = useState<'afdelingen' | 'presets'>('afdelingen')
  const [depts, setDepts] = useState<DraftDept[]>(() =>
    departments.map(d => ({ name: d.name, employees: [...d.employees] }))
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const teamById = useMemo(() => {
    const m = new Map<string, PlanningTeamContact>()
    for (const c of teamContacts) m.set(c.id, c)
    return m
  }, [teamContacts])

  // Wie wel in Team staat maar nog nergens in het rooster: de kandidaten voor
  // "Medewerker toevoegen". Namen typen kan niet meer — iedereen in het
  // rooster is een contact, anders valt er niets te koppelen.
  const unplacedContacts = useMemo(() => {
    const placed = new Set(depts.flatMap(d => d.employees))
    return teamContacts
      .filter(c => !placed.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  }, [depts, teamContacts])

  // Archiveren is een losstaande, meteen-opslaande actie (zoals presets) —
  // geen aparte kladversie zoals bij afdelingen, want er is niets te
  // verwerpen: één klik = actief/inactief wisselen.
  const [busyArchive, setBusyArchive] = useState<string | null>(null)
  const isArchivedId = (id: string) => archived.includes(id)

  async function toggleArchived(id: string) {
    setBusyArchive(id)
    const next = isArchivedId(id) ? archived.filter(a => a !== id) : [...archived, id]
    await onSaveArchived(next)
    setBusyArchive(null)
  }

  // Everyone flagged "niet in Team" (see the badge below), collected up
  // front so a beheerder can spot every remaining conflict at a glance
  // instead of scrolling every department looking for the badge by eye.
  const [showNotInTeamDigest, setShowNotInTeamDigest] = useState(true)
  const [flashDept, setFlashDept] = useState<number | null>(null)
  const deptRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Een id in het rooster waar geen contact meer bij hoort. Dat kan bijna
  // niet meer — de database weigert een contact te verwijderen dat planning
  // heeft staan — maar een rooster met een dood id laat je niet staan.
  const notInTeamList = useMemo(() => {
    const out: { dept: string; deptIdx: number; emp: string }[] = []
    depts.forEach((d, di) => {
      d.employees.forEach(id => {
        if (!teamById.has(id)) out.push({ dept: d.name, deptIdx: di, emp: id })
      })
    })
    return out
  }, [depts, teamById])

  function jumpToDept(deptIdx: number) {
    setTab('afdelingen')
    setCollapsed(prev => ({ ...prev, [deptIdx]: false }))
    requestAnimationFrame(() => {
      deptRefs.current[deptIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setFlashDept(deptIdx)
    setTimeout(() => setFlashDept(d => (d === deptIdx ? null : d)), 1500)
  }

  // Persoonlijke planningslinks voor wie geen account heeft (weekendstudenten).
  // Zie supabase/migrations/0052_planning_links.sql.
  const [links, setLinks] = useState<PlanningLinkRow[]>([])
  const [busyLink, setBusyLink] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const loadLinks = useCallback(() => {
    if (!isBeheer) return
    fetch('/api/planning/links')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (Array.isArray(d)) setLinks(d) })
      .catch(() => {})
  }, [isBeheer])
  useEffect(() => { loadLinks() }, [loadLinks])

  const linkFor = useCallback(
    (contactId: string) => links.find(l => l.contact_id === contactId) ?? null,
    [links]
  )

  function linkUrl(token: string) {
    return `${window.location.origin}/p/${token}`
  }

  async function createLink(contactId: string) {
    setBusyLink(contactId)
    try {
      const res = await fetch('/api/planning/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      if (!res.ok) throw new Error(await res.text())
      const created = await res.json() as PlanningLinkRow
      setLinks(prev => [created, ...prev])
      await navigator.clipboard.writeText(linkUrl(created.token)).catch(() => {})
      setCopiedToken(created.token)
      setTimeout(() => setCopiedToken(t => (t === created.token ? null : t)), 2000)
    } catch { /* de knop blijft gewoon staan om opnieuw te proberen */ }
    setBusyLink(null)
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(linkUrl(token)).catch(() => {})
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(t => (t === token ? null : t)), 2000)
  }

  async function revokeLink(link: PlanningLinkRow) {
    const ok = confirm(
      `De link van ${teamById.get(link.contact_id)?.name ?? 'deze persoon'} intrekken?\n\n` +
      `Wie hem nog heeft kan er daarna niets meer mee. Je kan altijd een ` +
      `nieuwe maken, maar dat is een andere link.`
    )
    if (!ok) return
    setBusyLink(link.contact_id)
    await fetch(`/api/planning/links?token=${encodeURIComponent(link.token)}`, { method: 'DELETE' })
    setLinks(prev => prev.filter(l => l.token !== link.token))
    setBusyLink(null)
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

  // Hoeveel ingevulde dagen hangen er aan deze (afdeling, naam)? Bepaalt of
  // verwijderen mag: die rijen staan op de tekst, dus zodra de naam uit het
  // rooster verdwijnt zijn ze nergens meer te zien.
  const entryCountMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of staleness) m.set(`${s.dept}|${s.emp}`, s.entryCount)
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

  // ─── Emp actions ──────────────────────────────────────────────────────────

  function addEmployee(deptIdx: number, contactId: string) {
    if (!contactId) return
    setDepts(prev => prev.map((d, i) =>
      i === deptIdx ? { ...d, employees: [...d.employees, contactId] } : d
    ))
  }

  function deleteEmployee(deptIdx: number, empIdx: number) {
    const id = depts[deptIdx].employees[empIdx]
    const naam = teamById.get(id)?.name ?? id
    const planned = entryCountMap.get(id) ?? 0

    // Dit maakt niets meer kapot: zijn dagen hangen aan zijn contact, niet aan
    // deze plek in het rooster. Ze zijn alleen niet meer zichtbaar zolang hij
    // nergens staat, en komen terug zodra je hem weer toevoegt.
    //
    // Daarom een bevestiging en geen blokkade, anders dan voorheen — en voor
    // iemand die er nog is, is archiveren nog altijd wat je bedoelt.
    if (planned > 0) {
      const ok = confirm(
        `${naam} uit het rooster halen?\n\n` +
        `Zijn ${planned} ingevulde dag(en) blijven bewaard en komen terug zodra ` +
        `je hem weer toevoegt — ook in een andere afdeling.\n\n` +
        `Gaat het om iemand die er niet meer werkt, gebruik dan archiveren: dan ` +
        `blijven oude weken gewoon zichtbaar.`
      )
      if (!ok) return
    }

    setDepts(prev => prev.map((d, i) => {
      if (i !== deptIdx) return d
      return { ...d, employees: d.employees.filter((_, ei) => ei !== empIdx) }
    }))
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

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      // Geen verhuizingen meer. Van afdeling wisselen verplaatst niets in de
      // database: een planningsdag hangt aan een contact, niet aan een plek.
      await onSave(depts.map(d => ({ name: d.name, employees: [...d.employees] })))
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Opslaan mislukt.')
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
                    {dept.employees.map((id, ei) => {
                      const contact = teamById.get(id)
                      // Een id zonder contact hoort niet te bestaan, maar als
                      // het gebeurt moet je het kunnen zien en weghalen.
                      const emp = contact?.name ?? '(onbekend contact)'
                      const isEmpDragTarget = dragOverEmp?.dept === di && dragOverEmp.emp === ei
                      const isEmpDragging = dragEmpRef.current?.dept === di && dragEmpRef.current.emp === ei
                      const isArchivedEmp = isArchivedId(id)
                      const isBusy = busyArchive === id
                      const lastEntry = stalenessMap.get(id)
                      const stale = !isArchivedEmp && lastEntry && daysAgo(lastEntry) >= STALE_AFTER_DAYS
                      const notInTeam = !contact
                      // Stagiair of student: zeg dat, met zijn status erbij.
                      // Zonder dit zag een stagiair die netjes gestopt is er
                      // op het scherm hetzelfde uit als een fout.
                      const tempLabel = contact && (contact.employment_type ?? 'vast') !== 'vast'
                        ? contact.active === false
                          ? `${contact.employment_type}, niet actief`
                          : contact.active_until
                            ? `${contact.employment_type} tot ${contact.active_until}`
                            : String(contact.employment_type)
                        : null
                      const personLink = linkFor(id)
                      const linkBusy = busyLink === id
                      const plannedDays = entryCountMap.get(id) ?? 0

                      return (
                        <div
                          key={id}
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

                          {/* De naam komt uit Team en is hier niet te
                              bewerken — er is maar één plek waar hij staat. */}
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-zinc-400">
                              <span className="truncate" title={emp}>{emp}</span>
                              {isArchivedEmp && (
                                <span className="flex-shrink-0 text-[9px] uppercase tracking-wide text-zinc-600">inactief</span>
                              )}
                              {notInTeam && (
                                <span
                                  className="flex-shrink-0 text-[9px] uppercase tracking-wide text-red-400 border border-red-900/60 rounded px-1"
                                  title="Dit id hoort bij geen enkel Team-contact meer. Haal hem uit het rooster."
                                >
                                  onbekend
                                </span>
                              )}
                              {copiedToken && personLink?.token === copiedToken && (
                                <span className="flex-shrink-0 text-[9px] uppercase tracking-wide text-sky-400">
                                  gekopieerd
                                </span>
                              )}
                              {tempLabel && (
                                <span
                                  className="flex-shrink-0 text-[9px] uppercase tracking-wide text-amber-500 border border-amber-900/60 rounded px-1"
                                  title="Contractvorm komt uit Team"
                                >
                                  {tempLabel}
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
                          </div>

                          {/* Persoonlijke planningslink, voor wie geen login
                              heeft. */}
                          {contact && (
                            <button
                              onClick={() => personLink ? copyLink(personLink.token) : createLink(id)}
                              disabled={linkBusy}
                              title={personLink
                                ? (copiedToken === personLink.token ? 'Gekopieerd' : 'Link kopiëren')
                                : 'Persoonlijke planningslink maken (voor wie geen login heeft)'}
                              className={`flex-shrink-0 transition-all hover:text-sky-400 ${
                                personLink ? 'opacity-100 text-sky-500' : 'opacity-0 group-hover:opacity-100 text-zinc-600'
                              }`}
                            >
                              {linkBusy
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Link2 size={13} />}
                            </button>
                          )}
                          {personLink && (
                            <button
                              onClick={() => revokeLink(personLink)}
                              disabled={linkBusy}
                              title="Link intrekken"
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                            >
                              <Link2Off size={13} />
                            </button>
                          )}

                          {/* Archive toggle (hover, or always if archived) */}
                          <button
                            onClick={() => toggleArchived(id)}
                            disabled={isBusy}
                            title={isArchivedEmp ? 'Terug actief maken' : 'Archiveren (blijft zichtbaar in oude planningen)'}
                            className={`flex-shrink-0 transition-all text-zinc-600 hover:text-amber-400 disabled:cursor-not-allowed ${
                              isArchivedEmp ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {isBusy ? <Loader2 size={13} className="animate-spin" /> : isArchivedEmp ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                          </button>

                          {/* Uit het rooster halen. Mag nu gewoon: zijn dagen
                              hangen aan zijn contact en komen terug zodra hij
                              weer ergens staat. */}
                          <button
                            onClick={() => deleteEmployee(di, ei)}
                            title={plannedDays > 0
                              ? `Uit het rooster halen — ${plannedDays} ingevulde dag(en) blijven bewaard`
                              : 'Uit het rooster halen'}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )
                    })}

                    {/* Toevoegen is een contact kiezen, geen naam typen:
                        iedereen in het rooster hoort bij een Team-contact. */}
                    <div className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-zinc-600">
                      <Plus size={13} className="flex-shrink-0" />
                      <select
                        value=""
                        onChange={e => { addEmployee(di, e.target.value); e.currentTarget.value = '' }}
                        disabled={unplacedContacts.length === 0}
                        className="flex-1 min-w-0 bg-transparent outline-none cursor-pointer disabled:cursor-default hover:text-zinc-400 transition-colors"
                      >
                        <option value="">
                          {unplacedContacts.length === 0
                            ? 'Iedereen uit Team staat al in het rooster'
                            : 'Medewerker toevoegen…'}
                        </option>
                        {unplacedContacts.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
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
