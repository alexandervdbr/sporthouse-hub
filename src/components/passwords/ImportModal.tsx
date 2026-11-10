'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Upload, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseImport, buildImportRow, credentialKey, type ImportRow, type LoginMethod } from '@/lib/credential-import'

// Import uit een spreadsheet. De tabel wordt in de browser gelezen en rij
// per rij via upsert_credential() opgeslagen — dezelfde route als handmatig
// toevoegen, dus versleuteling en rechten blijven in de database. Niets van
// de inhoud wordt gelogd; bij sluiten verdwijnt alles uit het geheugen
// (de component unmount).

type Step = 'input' | 'preview' | 'importing' | 'done'

interface Failure { line: number; platform: string }

export default function ImportModal({
  existing,
  onClose,
  onImported,
}: {
  existing: { platform: string; username: string }[]
  onClose: () => void
  onImported: () => void
}) {
  const [step, setStep] = useState<Step>('input')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState(0)
  const [failures, setFailures] = useState<Failure[]>([])
  const [imported, setImported] = useState(0)

  const busy = step === 'importing'

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Bestaat al = zelfde platform + login als een bestaande login, of als een
  // eerdere rij in dezelfde import.
  const duplicates = useMemo(() => {
    const seen = new Set(existing.map(c => credentialKey(c.platform, c.username)))
    const dup = new Set<number>()
    for (const r of rows) {
      const key = credentialKey(r.platform, r.username)
      if (seen.has(key)) dup.add(r.line)
      else seen.add(key)
    }
    return dup
  }, [rows, existing])

  async function readFile(file: File) {
    setText(await file.text())
  }

  function toPreview() {
    const parsed = parseImport(text)
    const dup = new Set(existing.map(c => credentialKey(c.platform, c.username)))
    const initial = new Set<number>()
    for (const r of parsed) {
      const key = credentialKey(r.platform, r.username)
      if (!r.issue && !dup.has(key)) initial.add(r.line)
      dup.add(key)
    }
    setRows(parsed)
    setSelected(initial)
    setText('') // de ruwe tekst is niet meer nodig
    setStep('preview')
  }

  function toggle(line: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }

  function setMethod(row: ImportRow, method: LoginMethod) {
    const updated = buildImportRow(row.raw, row.line, method)
    setRows(prev => prev.map(r => (r.line === row.line ? updated : r)))
    if (updated.issue) setSelected(prev => { const n = new Set(prev); n.delete(row.line); return n })
  }

  async function runImport() {
    const todo = rows.filter(r => selected.has(r.line) && !r.issue)
    const supabase = createClient()
    const failed: Failure[] = []
    setStep('importing')
    setProgress(0)

    // Eén voor één: een eenmalige import van hooguit enkele honderden rijen,
    // en zo kan een fout per rij gemeld worden.
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i]
      const { error } = await supabase.rpc('upsert_credential', {
        p_id: null,
        p_platform: r.platform,
        p_url: r.url || null,
        p_username: r.username,
        p_password: r.login_method === 'password' ? r.password : null,
        p_notes: r.notes || null,
        p_login_method: r.login_method,
      })
      if (error) {
        console.error(`Import regel ${r.line} mislukt:`, error.message)
        failed.push({ line: r.line, platform: r.platform })
      }
      setProgress(i + 1)
    }

    setImported(todo.length - failed.length)
    setFailures(failed)
    setRows([]) // wachtwoorden niet langer dan nodig in het geheugen
    setStep('done')
    onImported()
  }

  const selectable = rows.filter(r => selected.has(r.line) && !r.issue)
  const total = selectable.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div
        className="relative w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">Wachtwoorden importeren</h2>
          {!busy && (
            <button onClick={onClose} aria-label="Sluiten" title="Sluiten" className="text-zinc-500 hover:text-zinc-200 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {step === 'input' && (
          <>
            <div className="overflow-y-auto flex-1 px-6 space-y-4">
              <p className="text-sm text-zinc-400">
                Kopieer de rijen in je spreadsheet (met de kopregel) en plak ze hieronder, of kies een CSV-bestand.
                Eerste kolom = platform, daarna <span className="text-zinc-300">login</span> en <span className="text-zinc-300">wachtwoord</span>.
                Kolommen <span className="text-zinc-300">url</span> en <span className="text-zinc-300">notitie</span> mogen ook.
                Het bestand wordt alleen in je browser gelezen.
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={10}
                spellCheck={false}
                autoComplete="off"
                placeholder={'\tlogin\twachtwoord\nInstagram\tsporthouse\t…'}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition-colors resize-y"
              />
              <label className="inline-flex items-center gap-2 text-sm text-zinc-300 cursor-pointer hover:text-white transition-colors">
                <Upload size={14} />
                CSV-bestand kiezen
                <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }} />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-6 pt-4 pb-6 flex-shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Annuleren</button>
              <button
                onClick={toPreview}
                disabled={!text.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#3A913F', color: '#fff' }}
              >
                Voorbeeld bekijken
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="overflow-auto flex-1 px-6">
              {rows.length === 0 ? (
                <p className="text-sm text-zinc-400 py-8 text-center">Geen rijen gevonden.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: '#1a1a1a' }}>
                    <tr className="text-left text-[10px] text-zinc-500 uppercase tracking-widest">
                      <th className="py-2 pr-2 w-8"><span className="sr-only">Importeren</span></th>
                      <th className="py-2 pr-3">Platform</th>
                      <th className="py-2 pr-3">Login</th>
                      <th className="py-2 pr-3">Aanmelden</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const dup = duplicates.has(r.line)
                      return (
                        <tr key={r.line} className="border-t border-zinc-800 align-top">
                          <td className="py-2 pr-2">
                            <input
                              type="checkbox"
                              checked={selected.has(r.line)}
                              disabled={!!r.issue}
                              onChange={() => toggle(r.line)}
                              aria-label={`Regel ${r.line} importeren`}
                              className="accent-[#3A913F]"
                            />
                          </td>
                          <td className="py-2 pr-3 text-zinc-200">{r.platform || <span className="text-zinc-600">—</span>}</td>
                          <td className="py-2 pr-3 text-zinc-300 break-all">{r.username || <span className="text-zinc-600">—</span>}</td>
                          <td className="py-2 pr-3">
                            <select
                              value={r.login_method}
                              onChange={e => setMethod(r, e.target.value as LoginMethod)}
                              aria-label={`Aanmeldmethode regel ${r.line}`}
                              className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                            >
                              <option value="password">Wachtwoord {r.password ? '••••' : '(leeg)'}</option>
                              <option value="google">Met Google</option>
                            </select>
                          </td>
                          <td className="py-2 pr-3 text-xs whitespace-nowrap">
                            {r.issue
                              ? <span className="text-red-400">{r.issue}</span>
                              : dup
                                ? <span className="text-amber-400">Bestaat al</span>
                                : <span className="text-zinc-500">Nieuw</span>}
                            <span className="block text-zinc-600">regel {r.line}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-4 pb-6 flex-shrink-0">
              <button onClick={() => { setRows([]); setStep('input') }} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Terug
              </button>
              <button
                onClick={runImport}
                disabled={total === 0}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#3A913F', color: '#fff' }}
              >
                {total === 1 ? '1 login importeren' : `${total} logins importeren`}
              </button>
            </div>
          </>
        )}

        {step === 'importing' && (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-zinc-300 mb-3">Importeren… {progress} / {total}</p>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${total ? (progress / total) * 100 : 0}%`, background: '#3A913F' }} />
            </div>
            <p className="text-xs text-zinc-600 mt-3">Sluit dit venster niet.</p>
          </div>
        )}

        {step === 'done' && (
          <>
            <div className="overflow-y-auto flex-1 px-6 space-y-4">
              <p className="text-sm text-zinc-200">
                {imported === 1 ? '1 login geïmporteerd.' : `${imported} logins geïmporteerd.`}
              </p>
              {failures.length > 0 && (
                <div className="text-sm text-red-400">
                  <p className="mb-1">{failures.length} mislukt — voeg deze handmatig toe:</p>
                  <ul className="list-disc pl-5 text-red-300/80">
                    {failures.map(f => <li key={f.line}>regel {f.line}: {f.platform}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-2.5 rounded-lg p-3 text-sm text-amber-200/90" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-400" />
                <div className="space-y-1.5">
                  <p>Wie welke login ziet, stel je per persoon in via Beheer → Gebruikers.</p>
                  <p>Verwijder nu de spreadsheet en het CSV-bestand, ook uit Downloads en de prullenbak.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end px-6 pt-4 pb-6 flex-shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ background: '#3A913F', color: '#fff' }}>
                Klaar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
