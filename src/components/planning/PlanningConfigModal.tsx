'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X,
  Check,
  GripVertical,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { Department } from '@/lib/planning-config'
import type { PlanningPreset } from '@/lib/planning-presets'

interface Props {
  departments: Department[]
  onSave: (d: Department[]) => Promise<void>
  onClose: () => void
  // Presets zijn beheer-only (de API weigert schrijven sowieso, maar dan moet
  // de tab er ook niet staan om een 403 uit te lokken).
  isBeheer: boolean
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

      <div className="space-y-1.5">
        {presets.map(p => (
          <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="flex-1 min-w-0 text-sm text-zinc-100 truncate">{p.name}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => patchPreset(p, { color: c })}
                  aria-label={`Kleur ${c}`}
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: c, border: p.color === c ? '2px solid #fff' : '2px solid transparent' }}
                />
              ))}
            </div>
            <button
              onClick={() => removePreset(p)}
              disabled={busyId === p.id}
              aria-label={`${p.name} verwijderen`}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400"
            >
              {busyId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        ))}
        {presets.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog geen presets.</p>}
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

export default function PlanningConfigModal({ departments, onSave, onClose, isBeheer }: Props) {
  const [tab, setTab] = useState<'afdelingen' | 'presets'>('afdelingen')
  const [depts, setDepts] = useState<Department[]>(() =>
    departments.map(d => ({ name: d.name, employees: [...d.employees] }))
  )
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  // Inline rename state
  const [renamingDept, setRenamingDept] = useState<number | null>(null)
  const [renamingEmp, setRenamingEmp] = useState<{ dept: number; emp: number } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Drag state for departments
  const dragDeptRef = useRef<number | null>(null)
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
    setRenameValue(depts[deptIdx].employees[empIdx])
    setRenamingDept(null)
  }

  function confirmRenameEmp() {
    if (!renamingEmp) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      setDepts(prev => prev.map((d, i) => {
        if (i !== renamingEmp.dept) return d
        const emps = [...d.employees]
        emps[renamingEmp.emp] = trimmed
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
      return { ...d, employees: [...d.employees, 'Nieuwe naam'] }
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
    setDepts(prev => prev.map((d, i) => {
      if (i !== deptIdx) return d
      const emps = d.employees.filter((_, ei) => ei !== empIdx)
      return { ...d, employees: emps }
    }))
    if (renamingEmp?.dept === deptIdx && renamingEmp.emp === empIdx) {
      setRenamingEmp(null)
    }
  }

  // ─── Add dept ─────────────────────────────────────────────────────────────

  function addDepartment() {
    const idx = depts.length
    setDepts(prev => [...prev, { name: 'Nieuwe afdeling', employees: [] }])
    setTimeout(() => {
      setRenamingDept(idx)
      setRenameValue('Nieuwe afdeling')
    }, 0)
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
    if (dragEmpRef.current?.dept !== deptIdx) return // only within same dept
    setDragOverEmp({ dept: deptIdx, emp: empIdx })
  }

  function onEmpDrop(e: React.DragEvent, deptIdx: number, empIdx: number) {
    e.preventDefault()
    const from = dragEmpRef.current
    if (!from || from.dept !== deptIdx || from.emp === empIdx) {
      setDragOverEmp(null)
      return
    }
    setDepts(prev => prev.map((d, i) => {
      if (i !== deptIdx) return d
      const emps = [...d.employees]
      const [moved] = emps.splice(from.emp, 1)
      emps.splice(empIdx, 0, moved)
      return { ...d, employees: emps }
    }))
    dragEmpRef.current = null
    setDragOverEmp(null)
  }

  function onEmpDragEnd() {
    dragEmpRef.current = null
    setDragOverEmp(null)
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(depts)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl"
        style={{ width: 540, maxHeight: '85vh' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200">Planning configuratie</h2>
          <button
            onClick={onClose}
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
          {(!isBeheer || tab === 'afdelingen') && depts.map((dept, di) => {
            const isDragTarget = dragOverDept === di
            const isCollapsed = !!collapsed[di]
            const isRenamingThis = renamingDept === di
            const isDraggingThis = dragDeptRef.current === di

            return (
              <div
                key={di}
                draggable
                onDragStart={() => onDeptDragStart(di)}
                onDragOver={e => onDeptDragOver(e, di)}
                onDrop={e => onDeptDrop(e, di)}
                onDragEnd={onDeptDragEnd}
                className="rounded-xl border transition-all"
                style={{
                  borderColor: isDragTarget ? '#2563eb' : '#27272a',
                  backgroundColor: isDragTarget ? 'rgba(37,99,235,0.06)' : '#111111',
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
                      <button onClick={confirmRenameDept} className="flex-shrink-0 text-green-500 hover:text-green-400 transition-colors">
                        <Check size={14} />
                      </button>
                      <button onClick={cancelRenameDept} className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors">
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
                </div>

                {/* Employee list */}
                {!isCollapsed && (
                  <div className="border-t border-zinc-800 px-3 pb-2 pt-1 space-y-0.5">
                    {dept.employees.map((emp, ei) => {
                      const isRenamingThisEmp = renamingEmp?.dept === di && renamingEmp.emp === ei
                      const isEmpDragTarget = dragOverEmp?.dept === di && dragOverEmp.emp === ei
                      const isEmpDragging = dragEmpRef.current?.dept === di && dragEmpRef.current.emp === ei

                      return (
                        <div
                          key={ei}
                          draggable
                          onDragStart={() => onEmpDragStart(di, ei)}
                          onDragOver={e => onEmpDragOver(e, di, ei)}
                          onDrop={e => onEmpDrop(e, di, ei)}
                          onDragEnd={onEmpDragEnd}
                          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all"
                          style={{
                            backgroundColor: isEmpDragTarget ? 'rgba(37,99,235,0.10)' : 'transparent',
                            border: isEmpDragTarget ? '1px solid #2563eb' : '1px solid transparent',
                            opacity: isEmpDragging ? 0.5 : 1,
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
                              <button onClick={confirmRenameEmp} className="flex-shrink-0 text-green-500 hover:text-green-400 transition-colors">
                                <Check size={13} />
                              </button>
                              <button onClick={cancelRenameEmp} className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors">
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="flex-1 text-left text-xs text-zinc-400 hover:text-zinc-200 truncate transition-colors"
                              onClick={() => startRenameEmp(di, ei)}
                              title="Klik om naam aan te passen"
                            >
                              {emp}
                            </button>
                          )}

                          {/* Delete button (hover) */}
                          {!isRenamingThisEmp && (
                            <button
                              onClick={() => deleteEmployee(di, ei)}
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
