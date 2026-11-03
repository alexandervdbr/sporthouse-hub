'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertCircle, FlaskConical, Check } from 'lucide-react'
import { DEV_TOOLS, DEFAULT_DEV_MESSAGE, type ToolStatusMap } from '@/lib/tool-status'
import { useToolStatus } from '@/contexts/ToolStatusContext'

// Beheer → Tools: per tool live of in ontwikkeling. Opslaan geldt meteen
// voor wie de pagina (her)laadt; een tabblad dat al openstond, merkt het pas
// na herladen (zie src/lib/tool-status.ts).
export default function ToolStatusPage() {
  const { setStatus: setSharedStatus } = useToolStatus()
  const [status,   setStatus]   = useState<ToolStatusMap>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/tool-status').then(async r => {
      if (r.ok) {
        const map: ToolStatusMap = await r.json()
        setStatus(map)
        setMessages(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.message ?? ''])))
      } else {
        setError(r.status === 500
          ? 'Kon de toolstatus niet laden. Staat migratie 0069 (tool_status) al in de database?'
          : await r.text())
      }
      setLoading(false)
    })
  }, [])

  async function save(key: string, inDevelopment: boolean) {
    setSaving(key)
    setError(null)
    const r = await fetch('/api/admin/tool-status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: key, in_development: inDevelopment, message: messages[key] ?? '' }),
    })
    if (r.ok) {
      const entry = await r.json()
      const next = { ...status, [key]: entry }
      setStatus(next)
      // Zijbalk en poort in dit tabblad meteen bijwerken, zonder het hele
      // layout (gebruiker + klanten) opnieuw op te halen.
      setSharedStatus(next)
      setSavedKey(key)
      setTimeout(() => setSavedKey(k => (k === key ? null : k)), 1500)
    } else {
      setError(await r.text())
    }
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-zinc-600">
        <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold text-zinc-100">Tools</h1>
        <p className="text-sm text-zinc-500 mb-4">
          Zet een tool in ontwikkeling om eraan te werken terwijl het platform live staat.
          Admins zien hem gewoon; alle anderen krijgen een melding.
        </p>

        <div className="flex items-start gap-2 px-3 py-2.5 mb-5 bg-amber-950/30 border border-amber-900/40 rounded-lg">
          <AlertCircle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-300/90">
            Dit verbergt de tool, niet de data: wat je test, gebeurt in de live database.
            Gebruik testgegevens, en hou migraties additief zolang de tool in ontwikkeling staat.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 mb-4 bg-red-950/30 border border-red-900/40 rounded-lg">
            <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div className="border border-zinc-800 rounded-xl divide-y divide-zinc-900">
          {DEV_TOOLS.map(t => {
            const entry = status[t.key]
            const dev = entry?.in_development === true
            const busy = saving === t.key
            const messageChanged = (messages[t.key] ?? '') !== (entry?.message ?? '')
            return (
              <div key={t.key} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">{t.label}</span>
                      {dev && (
                        <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: '#431407', color: '#fdba74' }}>
                          <FlaskConical size={10} /> DEV
                        </span>
                      )}
                      {savedKey === t.key && <Check size={13} className="text-green-500" />}
                    </div>
                    <p className="text-xs text-zinc-600 truncate">
                      {t.path}
                      {dev && entry?.updated_by && <> · aangezet door {entry.updated_by}</>}
                    </p>
                  </div>
                  <button
                    onClick={() => save(t.key, !dev)}
                    disabled={busy}
                    role="switch"
                    aria-checked={dev}
                    aria-label={`${t.label} in ontwikkeling`}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${dev ? 'bg-orange-600' : 'bg-zinc-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${dev ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>

                {dev && (
                  <div className="mt-3 flex gap-2 items-start">
                    <textarea
                      value={messages[t.key] ?? ''}
                      onChange={e => setMessages(m => ({ ...m, [t.key]: e.target.value }))}
                      placeholder={DEFAULT_DEV_MESSAGE}
                      rows={2}
                      maxLength={500}
                      className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
                    />
                    <button
                      onClick={() => save(t.key, true)}
                      disabled={busy || !messageChanged}
                      className="px-3 py-2 text-sm font-medium text-zinc-200 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : 'Melding opslaan'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
