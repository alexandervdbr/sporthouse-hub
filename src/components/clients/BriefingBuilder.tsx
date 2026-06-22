'use client'

import { useState, useEffect, Fragment } from 'react'
import { Plus, Trash2, Send, Copy, Check, Loader2, UserPlus, X, AlertCircle, ChevronDown, ChevronRight, Link } from 'lucide-react'

interface Asset {
  label: string
  url: string
}

interface Row {
  id: string
  title: string
  assignee: string
  deadline: string
  description: string
  audience: string
  style: string
  assets: Asset[]
  notes: string
  open: boolean
}

interface Member {
  id: string
  contact_name: string
  contact_email: string
}

interface TeamContact {
  id: string
  name: string
  role: string | null
  email: string | null
}

interface TaskResult {
  ok: boolean
  error?: string
}

interface RowResult {
  rowTitle: string
  task: TaskResult
}

function uid() {
  return '_' + Math.random().toString(36).slice(2, 9)
}

function emptyRow(): Row {
  return {
    id: uid(),
    title: '',
    assignee: '',
    deadline: '',
    description: '',
    audience: '',
    style: '',
    assets: [],
    notes: '',
    open: false,
  }
}

function fmtDate(dateStr: string) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function buildCopyText(row: Row): string {
  const lines: string[] = []
  lines.push(`BRIEFING: ${row.title}`)
  lines.push('')
  if (row.assignee) lines.push(`Voor: ${row.assignee}`)
  if (row.deadline) lines.push(`Deadline: ${fmtDate(row.deadline)}`)
  if (row.assignee || row.deadline) lines.push('')

  if (row.description.trim()) {
    lines.push('Opdracht:')
    lines.push(row.description.trim())
    lines.push('')
  }
  if (row.audience.trim()) {
    lines.push('Doelgroep / Context:')
    lines.push(row.audience.trim())
    lines.push('')
  }
  if (row.style.trim()) {
    lines.push('Stijl / Tone of voice:')
    lines.push(row.style.trim())
    lines.push('')
  }
  if (row.assets.length > 0) {
    lines.push('Assets:')
    row.assets.forEach(a => {
      lines.push(a.label ? `${a.label}: ${a.url}` : a.url)
    })
    lines.push('')
  }
  if (row.notes.trim()) {
    lines.push('Opmerkingen:')
    lines.push(row.notes.trim())
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

export default function BriefingBuilder({
  clientId,
  isAdmin,
}: {
  clientId: string
  isAdmin: boolean
}) {
  const STORAGE_KEY = `bb_rows_${clientId}`

  const [activeTab, setActiveTab] = useState<'taken' | 'briefings' | 'config'>('taken')
  const [rows, setRows] = useState<Row[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [config, setConfig] = useState<{ asana_project_gid: string; asana_extra_project_gids: { gid: string; label: string }[] } | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  const [pushing, setPushing] = useState(false)
  const [pushResults, setPushResults] = useState<RowResult[] | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)

  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Config state
  const [teamContacts, setTeamContacts] = useState<TeamContact[]>([])
  const [selectedEmail, setSelectedEmail] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [asanaProjects, setAsanaProjects] = useState<{ gid: string; name: string }[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [asanaGidInput, setAsanaGidInput] = useState('')
  const [savingGid, setSavingGid] = useState(false)
  const [savedGid, setSavedGid] = useState(false)
  const [extraProjects, setExtraProjects] = useState<{ gid: string; label: string }[]>([])
  const [newProjectSelectedGid, setNewProjectSelectedGid] = useState('')
  const [newProjectGid, setNewProjectGid] = useState('')
  const [newProjectLabel, setNewProjectLabel] = useState('')
  const [savingExtra, setSavingExtra] = useState(false)
  const [removingExtraIndex, setRemovingExtraIndex] = useState<number | null>(null)

  // Load rows from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setRows(JSON.parse(saved))
      } else {
        setRows(Array.from({ length: 4 }, emptyRow))
      }
    } catch {
      setRows(Array.from({ length: 4 }, emptyRow))
    }
  }, [STORAGE_KEY])

  // Persist rows to localStorage
  useEffect(() => {
    if (rows.length === 0) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)) } catch {}
  }, [rows, STORAGE_KEY])

  // Fetch members + config
  useEffect(() => {
    async function load() {
      setLoadingData(true)
      try {
        const [mRes, cRes] = await Promise.all([
          fetch(`/api/briefing-builder/members?clientId=${clientId}`),
          fetch(`/api/briefing-builder/config?clientId=${clientId}`),
        ])
        if (mRes.ok) setMembers(await mRes.json())
        if (cRes.ok) {
          const cfg = await cRes.json()
          setConfig(cfg)
          setAsanaGidInput(cfg?.asana_project_gid ?? '')
          setExtraProjects(cfg?.asana_extra_project_gids ?? [])
        }
      } finally {
        setLoadingData(false)
      }
    }
    load()
  }, [clientId])

  // Fetch team contacts for config tab
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/team/members')
      .then(r => r.json())
      .then(setTeamContacts)
      .catch(() => {})
  }, [isAdmin])

  // Fetch Asana projects when config tab opens
  useEffect(() => {
    if (activeTab !== 'config' || !isAdmin || asanaProjects.length > 0) return
    setLoadingProjects(true)
    fetch('/api/content-planner/asana-projects')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAsanaProjects(data) })
      .catch(() => {})
      .finally(() => setLoadingProjects(false))
  }, [activeTab, isAdmin, asanaProjects.length])

  const filledRows = rows.filter(r => r.title.trim())
  const pushableRows = rows.filter(r => r.title.trim() && r.assignee)
  const memberEmails = new Set(members.map(m => m.contact_email))
  const availableContacts = teamContacts.filter(c => c.email && !memberEmails.has(c.email))
  const canPush = !!config?.asana_project_gid && pushableRows.length > 0

  function updateRow(id: string, field: keyof Row, value: string | boolean | Asset[]) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function addAsset(rowId: string) {
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, assets: [...r.assets, { label: '', url: '' }] } : r
    ))
  }

  function updateAsset(rowId: string, index: number, field: 'label' | 'url', value: string) {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      const assets = r.assets.map((a, i) => i === index ? { ...a, [field]: value } : a)
      return { ...r, assets }
    }))
  }

  function removeAsset(rowId: string, index: number) {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      return { ...r, assets: r.assets.filter((_, i) => i !== index) }
    }))
  }

  function clearAll() {
    if (!confirm('Ben je zeker dat je alle taken wil wissen?')) return
    setRows(Array.from({ length: 4 }, emptyRow))
    setPushResults(null)
    setPushError(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  async function copyBriefing(row: Row) {
    const txt = buildCopyText(row)
    await navigator.clipboard.writeText(txt)
    setCopiedId(row.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handlePush() {
    if (!canPush) return
    setPushing(true)
    setPushResults(null)
    setPushError(null)
    try {
      const res = await fetch('/api/briefing-builder/asana-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          rows: pushableRows.map(r => ({
            title: r.title,
            assignee: r.assignee,
            deadline: r.deadline,
            description: r.description,
            audience: r.audience,
            style: r.style,
            assets: r.assets.filter(a => a.url.trim()),
            notes: r.notes,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setPushError(data.error ?? 'Er is iets misgelopen.')
      } else {
        setPushResults(data.results)
      }
    } catch {
      setPushError('Verbindingsfout. Probeer opnieuw.')
    } finally {
      setPushing(false)
    }
  }

  // Config: members
  async function handleAddMember() {
    if (!selectedEmail) return
    const contact = teamContacts.find(c => c.email === selectedEmail)
    if (!contact?.email) return
    setAddingMember(true)
    try {
      const res = await fetch('/api/briefing-builder/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, contact_name: contact.name, contact_email: contact.email }),
      })
      if (res.ok) {
        const newMember = await res.json()
        setMembers(prev => [...prev, newMember])
        setSelectedEmail('')
      }
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(id: string) {
    setRemovingId(id)
    try {
      await fetch(`/api/briefing-builder/members?id=${id}`, { method: 'DELETE' })
      setMembers(prev => prev.filter(m => m.id !== id))
    } finally {
      setRemovingId(null)
    }
  }

  // Config: Asana
  async function handleSaveGid() {
    setSavingGid(true)
    try {
      await fetch('/api/briefing-builder/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, asana_project_gid: asanaGidInput.trim(), asana_extra_project_gids: extraProjects }),
      })
      setConfig(prev => prev ? { ...prev, asana_project_gid: asanaGidInput.trim(), asana_extra_project_gids: extraProjects } : prev)
      setSavedGid(true)
      setTimeout(() => setSavedGid(false), 2200)
    } finally {
      setSavingGid(false)
    }
  }

  async function saveExtraProjects(updated: { gid: string; label: string }[]) {
    await fetch('/api/briefing-builder/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        asana_project_gid: config?.asana_project_gid ?? asanaGidInput.trim(),
        asana_extra_project_gids: updated,
      }),
    })
  }

  async function handleAddExtraProject() {
    const gid = newProjectSelectedGid || newProjectGid.trim()
    if (!gid) return
    const matched = asanaProjects.find(p => p.gid === gid)
    const entry = { gid, label: newProjectLabel.trim() || matched?.name || '' }
    const updated = [...extraProjects, entry]
    setSavingExtra(true)
    try {
      await saveExtraProjects(updated)
      setExtraProjects(updated)
      setNewProjectGid('')
      setNewProjectLabel('')
      setNewProjectSelectedGid('')
    } finally {
      setSavingExtra(false)
    }
  }

  async function handleRemoveExtraProject(index: number) {
    setRemovingExtraIndex(index)
    try {
      const updated = extraProjects.filter((_, i) => i !== index)
      await saveExtraProjects(updated)
      setExtraProjects(updated)
    } finally {
      setRemovingExtraIndex(null)
    }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={20} className="animate-spin text-zinc-600" />
      </div>
    )
  }

  const tabs: { key: 'taken' | 'briefings' | 'config'; label: string }[] = [
    { key: 'taken', label: 'Taken' },
    { key: 'briefings', label: 'Briefings' },
    ...(isAdmin ? [{ key: 'config' as const, label: 'Config' }] : []),
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-white">Briefing Builder</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              {filledRows.length} {filledRows.length === 1 ? 'taak' : 'taken'} ingevuld
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-zinc-900'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Taken ── */}
        {activeTab === 'taken' && (
          <>
            {pushResults ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white mb-4">
                  {pushResults.every(r => r.task.ok)
                    ? '✅ Taken aangemaakt in Asana'
                    : '⚠️ Resultaat — sommige taken zijn niet aangemaakt'}
                </h3>
                <div className="space-y-2 mb-6">
                  {pushResults.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${r.task.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-zinc-300 flex-1">{r.rowTitle}</span>
                      {!r.task.ok && <span className="text-red-400 text-xs">{r.task.error}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setRows(Array.from({ length: 4 }, emptyRow))
                      setPushResults(null)
                      setPushError(null)
                      try { localStorage.removeItem(STORAGE_KEY) } catch {}
                    }}
                    className="px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-100 transition-colors"
                  >
                    Alles resetten
                  </button>
                  <button
                    onClick={() => { setPushResults(null); setPushError(null) }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    Behouden
                  </button>
                </div>
              </div>
            ) : (
              <>
                {isAdmin && !config?.asana_project_gid && (
                  <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <span>Stel eerst een Asana Project in via het Config-tabblad.</span>
                  </div>
                )}

                {pushError && (
                  <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <span>{pushError}</span>
                  </div>
                )}

                <div className="space-y-2 mb-4">
                  {rows.map(row => (
                    <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      {/* Compact header row */}
                      <div className="flex items-center gap-2 px-4 py-3">
                        <button
                          onClick={() => updateRow(row.id, 'open', !row.open)}
                          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {row.open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>

                        <input
                          type="text"
                          value={row.title}
                          onChange={e => updateRow(row.id, 'title', e.target.value)}
                          placeholder="Taaknaam…"
                          className="flex-1 bg-transparent text-zinc-200 text-sm outline-none placeholder:text-zinc-600 font-medium"
                        />

                        <select
                          value={row.assignee}
                          onChange={e => updateRow(row.id, 'assignee', e.target.value)}
                          className="bg-transparent text-zinc-400 text-sm outline-none appearance-none cursor-pointer text-right min-w-0 max-w-[140px] truncate"
                        >
                          <option value="">Geen persoon</option>
                          {members.map(m => (
                            <option key={m.id} value={m.contact_name}>{m.contact_name}</option>
                          ))}
                        </select>

                        <input
                          type="date"
                          value={row.deadline}
                          onChange={e => updateRow(row.id, 'deadline', e.target.value)}
                          className="bg-transparent text-zinc-400 text-sm outline-none [color-scheme:dark] w-[130px] flex-shrink-0"
                        />

                        <button
                          onClick={() => deleteRow(row.id)}
                          className="flex-shrink-0 text-zinc-700 hover:text-red-400 hover:bg-red-400/10 p-1 rounded transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>

                      {/* Expanded briefing fields */}
                      {row.open && (
                        <div className="border-t border-zinc-800 px-4 pb-4 pt-3 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Wat moet er gemaakt worden?</label>
                            <textarea
                              value={row.description}
                              onChange={e => updateRow(row.id, 'description', e.target.value)}
                              placeholder="Beschrijf de opdracht zo concreet mogelijk…"
                              rows={3}
                              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 px-3 py-2 outline-none focus:border-zinc-600 resize-none transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Doelgroep / Context</label>
                            <textarea
                              value={row.audience}
                              onChange={e => updateRow(row.id, 'audience', e.target.value)}
                              placeholder="Voor wie is dit? Wat is de context?"
                              rows={2}
                              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 px-3 py-2 outline-none focus:border-zinc-600 resize-none transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Stijl / Tone of voice</label>
                            <textarea
                              value={row.style}
                              onChange={e => updateRow(row.id, 'style', e.target.value)}
                              placeholder="Tone of voice, huisstijl-richtlijnen, voorbeelden…"
                              rows={2}
                              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 px-3 py-2 outline-none focus:border-zinc-600 resize-none transition-colors"
                            />
                          </div>

                          {/* Assets */}
                          <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Assets</label>
                            {row.assets.length > 0 && (
                              <div className="space-y-1.5 mb-1.5">
                                {row.assets.map((asset, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={asset.label}
                                      onChange={e => updateAsset(row.id, i, 'label', e.target.value)}
                                      placeholder="Label (optioneel)"
                                      className="w-36 flex-shrink-0 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 px-2.5 py-1.5 outline-none focus:border-zinc-600 transition-colors"
                                    />
                                    <input
                                      type="url"
                                      value={asset.url}
                                      onChange={e => updateAsset(row.id, i, 'url', e.target.value)}
                                      placeholder="https://…"
                                      className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 px-2.5 py-1.5 outline-none focus:border-zinc-600 transition-colors"
                                    />
                                    <button
                                      onClick={() => removeAsset(row.id, i)}
                                      className="flex-shrink-0 text-zinc-600 hover:text-red-400 transition-colors"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => addAsset(row.id)}
                              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              <Plus size={12} /> Asset toevoegen
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Opmerkingen</label>
                            <textarea
                              value={row.notes}
                              onChange={e => updateRow(row.id, 'notes', e.target.value)}
                              placeholder="Extra info, links, opmerkingen…"
                              rows={2}
                              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 px-3 py-2 outline-none focus:border-zinc-600 resize-none transition-colors"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add row */}
                <button
                  onClick={() => setRows(prev => [...prev, emptyRow()])}
                  className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
                >
                  <Plus size={14} /> Taak toevoegen
                </button>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePush}
                    disabled={!canPush || pushing}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {pushing ? 'Bezig…' : 'Push naar Asana'}
                  </button>
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 size={14} /> Alles wissen
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Briefings ── */}
        {activeTab === 'briefings' && (
          <div className="space-y-4">
            {filledRows.length === 0 ? (
              <p className="text-sm text-zinc-600">Vul eerst taken in op de Taken-tab.</p>
            ) : (
              filledRows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <div>
                      <p className="text-sm font-semibold text-white">{row.title}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {[row.assignee, row.deadline ? fmtDate(row.deadline) : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      onClick={() => copyBriefing(row)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
                    >
                      {copiedId === row.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === row.id ? 'Gekopieerd!' : 'Kopieer'}
                    </button>
                  </div>
                  <div className="px-4 py-3 space-y-3 text-sm">
                    {row.description.trim() && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500 mb-0.5">Opdracht</p>
                        <p className="text-zinc-300 whitespace-pre-wrap">{row.description.trim()}</p>
                      </div>
                    )}
                    {row.audience.trim() && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500 mb-0.5">Doelgroep / Context</p>
                        <p className="text-zinc-300 whitespace-pre-wrap">{row.audience.trim()}</p>
                      </div>
                    )}
                    {row.style.trim() && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500 mb-0.5">Stijl / Tone of voice</p>
                        <p className="text-zinc-300 whitespace-pre-wrap">{row.style.trim()}</p>
                      </div>
                    )}
                    {row.assets.filter(a => a.url.trim()).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500 mb-1">Assets</p>
                        <div className="space-y-1">
                          {row.assets.filter(a => a.url.trim()).map((a, i) => (
                            <a
                              key={i}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors text-xs"
                            >
                              <Link size={11} />
                              {a.label || a.url}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {row.notes.trim() && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500 mb-0.5">Opmerkingen</p>
                        <p className="text-zinc-300 whitespace-pre-wrap">{row.notes.trim()}</p>
                      </div>
                    )}
                    {!row.description.trim() && !row.audience.trim() && !row.style.trim() && row.assets.filter(a => a.url.trim()).length === 0 && !row.notes.trim() && (
                      <p className="text-zinc-600 text-xs">Geen briefing-inhoud ingevuld.</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Config ── */}
        {activeTab === 'config' && isAdmin && (
          <div className="space-y-8">

            {/* Team members */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">Teamleden voor dit project</h3>
              <p className="text-xs text-zinc-500 mb-3">
                Deze personen verschijnen als keuze bij het toewijzen van taken.
              </p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-3">
                {members.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-zinc-600">Nog geen teamleden toegevoegd.</p>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300">
                            {m.contact_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm text-zinc-200">{m.contact_name}</p>
                            <p className="text-xs text-zinc-500">{m.contact_email}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          disabled={removingId === m.id}
                          className="text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          {removingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedEmail}
                  onChange={e => setSelectedEmail(e.target.value)}
                  className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 appearance-none"
                >
                  <option value="">Kies een teamlid…</option>
                  {availableContacts.map(c => (
                    <option key={c.id} value={c.email ?? ''}>{c.name}{c.role ? ` — ${c.role}` : ''}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!selectedEmail || addingMember}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {addingMember ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                  Toevoegen
                </button>
              </div>
            </div>

            {/* Asana Hoofdproject */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">Asana Hoofdproject</h3>
              <p className="text-xs text-zinc-500 mb-3">Alle taken worden aan dit project toegevoegd.</p>
              <div className="flex items-center gap-2">
                {loadingProjects ? (
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-500">
                    <Loader2 size={13} className="animate-spin" /> Projecten ophalen…
                  </div>
                ) : asanaProjects.length > 0 ? (
                  <select
                    value={asanaGidInput}
                    onChange={e => setAsanaGidInput(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 appearance-none"
                  >
                    <option value="">Kies een project…</option>
                    {asanaProjects.map(p => (
                      <option key={p.gid} value={p.gid}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={asanaGidInput}
                    onChange={e => setAsanaGidInput(e.target.value)}
                    placeholder="bv. 1234567890123456"
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                )}
                <button
                  onClick={handleSaveGid}
                  disabled={savingGid || !asanaGidInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[88px] justify-center"
                >
                  {savingGid ? <Loader2 size={13} className="animate-spin" /> : savedGid ? <Check size={13} /> : null}
                  {savedGid ? 'Opgeslagen' : 'Opslaan'}
                </button>
              </div>
            </div>

            {/* Extra Asana projecten */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">Extra Asana-projecten</h3>
              <p className="text-xs text-zinc-500 mb-3">
                Taken worden toegevoegd aan het hoofdproject én aan elk extra project hieronder.
              </p>

              {extraProjects.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-3">
                  <div className="divide-y divide-zinc-800">
                    {extraProjects.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <div>
                          {p.label && <p className="text-sm text-zinc-200">{p.label}</p>}
                          <p className={`font-mono text-xs ${p.label ? 'text-zinc-500' : 'text-zinc-300'}`}>{p.gid}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveExtraProject(i)}
                          disabled={removingExtraIndex === i}
                          className="text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          {removingExtraIndex === i ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {asanaProjects.length > 0 ? (
                  <select
                    value={newProjectSelectedGid}
                    onChange={e => setNewProjectSelectedGid(e.target.value)}
                    className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 appearance-none"
                  >
                    <option value="">Kies een project…</option>
                    {asanaProjects
                      .filter(p => p.gid !== asanaGidInput && !extraProjects.some(e => e.gid === p.gid))
                      .map(p => (
                        <option key={p.gid} value={p.gid}>{p.name}</option>
                      ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newProjectGid}
                    onChange={e => setNewProjectGid(e.target.value)}
                    placeholder="Project GID"
                    className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                )}
                <button
                  onClick={handleAddExtraProject}
                  disabled={(!newProjectSelectedGid && !newProjectGid.trim()) || savingExtra}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {savingExtra ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Toevoegen
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
