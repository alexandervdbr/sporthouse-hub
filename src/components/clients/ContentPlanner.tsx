'use client'

import { useState, useEffect, Fragment } from 'react'
import { Plus, Trash2, Send, Copy, Check, Loader2, UserPlus, X, AlertCircle } from 'lucide-react'

interface Row {
  id: string
  date: string
  title: string
  designer: string
  notes: string
  notesOpen: boolean
}

interface Member {
  id: string
  contact_name: string
  contact_email: string
  role: 'pm' | 'designer'
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
  pm: TaskResult
  designer: TaskResult
}

function uid() {
  return '_' + Math.random().toString(36).slice(2, 9)
}

function emptyRow(defaultDesigner = ''): Row {
  return { id: uid(), date: '', title: '', designer: defaultDesigner, notes: '', notesOpen: false }
}

function fmtDateShort(d: string) {
  if (!d) return '??/??'
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function getDayName(dateStr: string) {
  const days = ['ZONDAG', 'MAANDAG', 'DINSDAG', 'WOENSDAG', 'DONDERDAG', 'VRIJDAG', 'ZATERDAG']
  const d = new Date(dateStr)
  return `${days[d.getDay()]} ${fmtDateShort(dateStr)}`
}

function getWeekRange(rows: Row[]) {
  const dates = rows.filter(r => r.date).map(r => r.date).sort()
  if (!dates.length) return ''
  const first = new Date(dates[0])
  const day = first.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(first)
  mon.setDate(first.getDate() + diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${fmt(mon)} – ${fmt(sun)}`
}

export default function ContentPlanner({
  clientId,
  clientName,
  isAdmin,
}: {
  clientId: string
  clientName: string
  isAdmin: boolean
}) {
  const STORAGE_KEY = `cp_rows_${clientId}`

  const [activeTab, setActiveTab] = useState<'planning' | 'whatsapp' | 'config'>('planning')
  const [rows, setRows] = useState<Row[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [config, setConfig] = useState<{ asana_project_gid: string; asana_extra_project_gids: { gid: string; label: string }[] } | null>(null)
  const [extraProjects, setExtraProjects] = useState<{ gid: string; label: string }[]>([])
  const [newProjectGid, setNewProjectGid] = useState('')
  const [newProjectLabel, setNewProjectLabel] = useState('')
  const [savingExtra, setSavingExtra] = useState(false)
  const [removingExtraIndex, setRemovingExtraIndex] = useState<number | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  const [pushing, setPushing] = useState(false)
  const [pushResults, setPushResults] = useState<RowResult[] | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)

  const [waCopied, setWaCopied] = useState(false)

  const [teamContacts, setTeamContacts] = useState<TeamContact[]>([])
  const [selectedEmail, setSelectedEmail] = useState('')
  const [selectedRole, setSelectedRole] = useState<'pm' | 'designer'>('designer')
  const [addingMember, setAddingMember] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [asanaGidInput, setAsanaGidInput] = useState('')
  const [savingGid, setSavingGid] = useState(false)
  const [savedGid, setSavedGid] = useState(false)
  const [asanaProjects, setAsanaProjects] = useState<{ gid: string; name: string }[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [newProjectSelectedGid, setNewProjectSelectedGid] = useState('')

  // Load rows from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setRows(JSON.parse(saved))
      } else {
        setRows(Array.from({ length: 6 }, () => emptyRow()))
      }
    } catch {
      setRows(Array.from({ length: 6 }, () => emptyRow()))
    }
  }, [STORAGE_KEY])

  // Persist rows to localStorage
  useEffect(() => {
    if (rows.length === 0) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
    } catch {}
  }, [rows, STORAGE_KEY])

  // Fetch members + config
  useEffect(() => {
    async function load() {
      setLoadingData(true)
      try {
        const [mRes, cRes] = await Promise.all([
          fetch(`/api/content-planner/members?clientId=${clientId}`),
          fetch(`/api/content-planner/config?clientId=${clientId}`),
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

  // Derived
  const designers = members.filter(m => m.role === 'designer')
  const sortedRows = [...rows].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })
  const filledRows = rows.filter(r => r.title.trim())
  const pushableRows = rows.filter(r => r.title.trim() && r.date)
  const memberEmails = new Set(members.map(m => m.contact_email))
  const availableContacts = teamContacts.filter(c => c.email && !memberEmails.has(c.email))
  const canPush =
    !!config?.asana_project_gid &&
    members.some(m => m.role === 'pm') &&
    pushableRows.length > 0

  function defaultDesigner() {
    return designers[0]?.contact_name ?? ''
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow(defaultDesigner())])
  }

  function addRows5() {
    const d = defaultDesigner()
    setRows(prev => [...prev, ...Array.from({ length: 5 }, () => emptyRow(d))])
  }

  function updateRow(id: string, field: keyof Row, value: string | boolean) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)))
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function clearPlanning() {
    if (!confirm('Ben je zeker dat je de planning wil wissen?')) return
    const d = defaultDesigner()
    setRows(Array.from({ length: 6 }, () => emptyRow(d)))
    setPushResults(null)
    setPushError(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  // WhatsApp
  function buildWAText() {
    const filled = sortedRows.filter(r => r.date && r.title.trim())
    if (!filled.length) return ''
    const week = getWeekRange(filled)
    let txt = `📅 PLANNING ${clientName} — week van ${week}\n`
    const grouped: Record<string, string[]> = {}
    filled.forEach(r => {
      if (!grouped[r.date]) grouped[r.date] = []
      grouped[r.date].push(r.title.trim())
    })
    Object.keys(grouped).sort().forEach(date => {
      txt += `\n${getDayName(date)}\n`
      grouped[date].forEach(title => { txt += `${title}\n` })
    })
    txt += `\n✅ Totaal: ${filled.length} posts`
    return txt
  }

  async function copyWA() {
    const txt = buildWAText()
    if (!txt) return
    await navigator.clipboard.writeText(txt)
    setWaCopied(true)
    setTimeout(() => setWaCopied(false), 2000)
  }

  // Asana push
  async function handlePush() {
    if (!canPush) return
    setPushing(true)
    setPushResults(null)
    setPushError(null)
    try {
      const res = await fetch('/api/content-planner/asana-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          rows: pushableRows.map(r => ({
            date: r.date,
            title: r.title,
            designer: r.designer,
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

  function resetRows() {
    const d = defaultDesigner()
    setRows(Array.from({ length: 6 }, () => emptyRow(d)))
    setPushResults(null)
    setPushError(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  function handleReset() {
    resetRows()
  }

  // Config: members
  async function handleAddMember() {
    if (!selectedEmail) return
    const contact = teamContacts.find(c => c.email === selectedEmail)
    if (!contact?.email) return
    setAddingMember(true)
    try {
      const res = await fetch('/api/content-planner/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          contact_name: contact.name,
          contact_email: contact.email,
          role: selectedRole,
        }),
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
      await fetch(`/api/content-planner/members?id=${id}`, { method: 'DELETE' })
      setMembers(prev => prev.filter(m => m.id !== id))
    } finally {
      setRemovingId(null)
    }
  }

  // Config: Asana GID
  async function handleSaveGid() {
    setSavingGid(true)
    try {
      await fetch('/api/content-planner/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, asana_project_gid: asanaGidInput.trim(), asana_extra_project_gids: extraProjects }),
      })
      setConfig({ asana_project_gid: asanaGidInput.trim(), asana_extra_project_gids: extraProjects })
      setSavedGid(true)
      setTimeout(() => setSavedGid(false), 2200)
    } finally {
      setSavingGid(false)
    }
  }

  async function saveExtraProjects(updated: { gid: string; label: string }[]) {
    await fetch('/api/content-planner/config', {
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
    const matchedProject = asanaProjects.find(p => p.gid === gid)
    const entry = {
      gid,
      label: newProjectLabel.trim() || matchedProject?.name || '',
    }
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

  const tabs: { key: 'planning' | 'whatsapp' | 'config'; label: string }[] = [
    { key: 'planning', label: 'Planning' },
    { key: 'whatsapp', label: 'WhatsApp' },
    ...(isAdmin ? [{ key: 'config' as const, label: 'Config' }] : []),
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-white">Content Planner</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              {filledRows.length} {filledRows.length === 1 ? 'post' : 'posts'} ingevuld
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

        {/* ── Planning ── */}
        {activeTab === 'planning' && (
          <>
            {pushResults ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white mb-4">
                  {pushResults.every(r => r.pm.ok && r.designer.ok)
                    ? '✅ Taken aangemaakt in Asana'
                    : '⚠️ Resultaat — sommige taken zijn niet aangemaakt'}
                </h3>
                <div className="space-y-2 mb-6">
                  {pushResults.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                          r.pm.ok && r.designer.ok ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <span className="text-zinc-300 flex-1">{r.rowTitle}</span>
                      {(!r.pm.ok || !r.designer.ok) && (
                        <span className="text-red-400 text-xs">
                          {r.pm.error || r.designer.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-100 transition-colors"
                  >
                    Planning resetten
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
                {/* Config warnings (admin only) */}
                {isAdmin && (!config?.asana_project_gid || !members.some(m => m.role === 'pm')) && (
                  <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <span>
                      {!config?.asana_project_gid && !members.some(m => m.role === 'pm')
                        ? 'Stel eerst een PM en een Asana Project GID in via het Config-tabblad.'
                        : !config?.asana_project_gid
                        ? 'Stel het Asana Project GID in via het Config-tabblad.'
                        : 'Voeg een PM toe via het Config-tabblad.'}
                    </span>
                  </div>
                )}

                {pushError && (
                  <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <span>{pushError}</span>
                  </div>
                )}

                {/* Table */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="w-8 px-3 py-2.5 text-left text-xs font-medium text-zinc-600 uppercase tracking-wide">#</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide" style={{ minWidth: 130 }}>Datum</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Titel / insteek</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide" style={{ minWidth: 120 }}>Designer</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Notities</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, i) => (
                        <Fragment key={row.id}>
                          <tr className="group border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                            <td className="px-3 py-1 text-xs text-zinc-600 text-center">{i + 1}</td>
                            <td className="px-1">
                              <input
                                type="date"
                                value={row.date}
                                onChange={e => updateRow(row.id, 'date', e.target.value)}
                                className="w-full bg-transparent text-zinc-200 text-sm px-2 py-2 outline-none focus:bg-zinc-800/50 rounded transition-colors [color-scheme:dark]"
                              />
                            </td>
                            <td className="px-1">
                              <input
                                type="text"
                                value={row.title}
                                onChange={e => updateRow(row.id, 'title', e.target.value)}
                                placeholder="Schrijf de titel / insteek…"
                                className="w-full bg-transparent text-zinc-200 text-sm px-2 py-2 outline-none focus:bg-zinc-800/50 rounded transition-colors placeholder:text-zinc-500"
                              />
                            </td>
                            <td className="px-1">
                              <select
                                value={row.designer}
                                onChange={e => updateRow(row.id, 'designer', e.target.value)}
                                className="w-full bg-transparent text-zinc-200 text-sm px-2 py-2 outline-none focus:bg-zinc-800/50 rounded transition-colors appearance-none cursor-pointer"
                              >
                                <option value="">—</option>
                                {designers.map(d => (
                                  <option key={d.id} value={d.contact_name}>
                                    {d.contact_name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1 text-center">
                              <button
                                onClick={() => updateRow(row.id, 'notesOpen', !row.notesOpen)}
                                title="Notities"
                                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-colors mx-auto ${
                                  row.notes
                                    ? 'text-blue-400'
                                    : row.notesOpen
                                    ? 'bg-zinc-700 text-zinc-300'
                                    : 'text-zinc-600 hover:text-zinc-400'
                                }`}
                              >
                                {row.notesOpen ? '▾' : '+'}
                              </button>
                            </td>
                            <td className="px-1 text-center">
                              <button
                                onClick={() => deleteRow(row.id)}
                                className="w-6 h-6 rounded flex items-center justify-center text-zinc-700 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 mx-auto"
                              >
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                          {row.notesOpen && (
                            <tr className="border-b border-zinc-800/40">
                              <td colSpan={6} className="px-4 pb-3 pt-1">
                                <textarea
                                  value={row.notes}
                                  onChange={e => updateRow(row.id, 'notes', e.target.value)}
                                  placeholder="Extra info, links, opmerkingen…"
                                  rows={2}
                                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 px-3 py-2 outline-none focus:border-zinc-600 resize-none transition-colors"
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-2.5 border-t border-zinc-800 flex gap-4">
                    <button
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <Plus size={14} /> Rij toevoegen
                    </button>
                    <button
                      onClick={addRows5}
                      className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <Plus size={14} /> 5 rijen
                    </button>
                  </div>
                </div>

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
                    onClick={clearPlanning}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 size={14} /> Planning wissen
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── WhatsApp ── */}
        {activeTab === 'whatsapp' && (
          <div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4 font-mono text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap min-h-36">
              {buildWAText() || (
                <span className="text-zinc-600">Vul eerst posts in op de Planning tab.</span>
              )}
            </div>
            <button
              onClick={copyWA}
              disabled={!buildWAText()}
              className="flex items-center gap-2 px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {waCopied ? <Check size={14} /> : <Copy size={14} />}
              {waCopied ? 'Gekopieerd!' : 'Kopieer tekst'}
            </button>
          </div>
        )}

        {/* ── Config (admin only) ── */}
        {activeTab === 'config' && isAdmin && (
          <div className="space-y-8">

            {/* Team members */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">Teamleden voor dit project</h3>
              <p className="text-xs text-zinc-500 mb-3">
                Enkel deze personen verschijnen als keuze in de dropdown en worden gekoppeld aan Asana-taken.
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
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              m.role === 'pm'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            {m.role === 'pm' ? 'PM' : 'Designer'}
                          </span>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            disabled={removingId === m.id}
                            className="text-zinc-600 hover:text-red-400 transition-colors"
                          >
                            {removingId === m.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <X size={13} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add member */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedEmail}
                  onChange={e => setSelectedEmail(e.target.value)}
                  className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 appearance-none"
                >
                  <option value="">Kies een teamlid…</option>
                  {availableContacts.map(c => (
                    <option key={c.id} value={c.email ?? ''}>
                      {c.name}{c.role ? ` — ${c.role}` : ''}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as 'pm' | 'designer')}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 appearance-none"
                >
                  <option value="designer">Designer</option>
                  <option value="pm">PM</option>
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!selectedEmail || addingMember}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {addingMember ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <UserPlus size={13} />
                  )}
                  Toevoegen
                </button>
              </div>
            </div>

            {/* Asana Hoofdproject */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">Asana Hoofdproject</h3>
              <p className="text-xs text-zinc-500 mb-3">
                Alle taken worden altijd aan dit project toegevoegd.
              </p>
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
                  {savingGid ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : savedGid ? (
                    <Check size={13} />
                  ) : null}
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
                          {removingExtraIndex === i ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <X size={13} />
                          )}
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
