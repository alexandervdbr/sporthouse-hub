'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp } from 'lucide-react'
import { Button, ErrorLine, Select, send, textareaCls } from '@/components/materiaal/ui'
import { Modal } from '@/components/poolwagens/ui'
import { analyze, buildPlan, COLUMNS, type Analysis, type Decision, type Existing } from '@/features/freelancers/lib/spreadsheet'
import { IMPORT_MAX_ROWS } from '@/features/freelancers/lib/schemas'
import type { Discipline, Freelancer } from './types'
import { RATE_UNIT_LABEL, STATUS_LABEL } from './logic'

// Importeren (alleen beheren): CSV kiezen of plakken → voorbeeld per rij met
// de mapping, waarschuwingen en dubbels → bevestigen → samenvatting.
// Het bestand blijft in de browser; de server krijgt alleen de bevestigde
// rijen, in één verzoek, en valideert ze opnieuw.

type Result = { toegevoegd: number; bijgewerkt: number; disciplines: number; fouten: { line: number; message: string }[] }

/** UTF-8, en als dat mislukt (Excel op Windows) Windows-1252. */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

export default function Import({ disciplines, onClose, onDone }: { disciplines: Discipline[]; onClose: () => void; onDone: () => void }) {
  const [existing, setExisting] = useState<Existing[] | null>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [accepted, setAccepted] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Iedereen, ook gearchiveerden: om dubbels te herkennen.
  useEffect(() => {
    send<Freelancer[]>('/api/freelancers?archief=1', 'GET').then(setExisting).catch(e => setError(e instanceof Error ? e.message : 'Kon de freelancers niet ophalen.'))
  }, [])

  const plan = useMemo(() => (analysis && existing ? buildPlan(analysis, decisions, accepted, existing) : null), [analysis, decisions, accepted, existing])
  const labels = useMemo(() => Object.fromEntries(disciplines.map(d => [d.key, d.label])), [disciplines])

  function preview(t = text) {
    setError('')
    if (!existing) return
    const a = analyze(t, disciplines, existing)
    if (a.error) { setError(a.error); return }
    if (a.rows.length > IMPORT_MAX_ROWS) { setError(`Hooguit ${IMPORT_MAX_ROWS} rijen per keer; dit bestand heeft er ${a.rows.length}.`); return }
    if (!a.rows.length) { setError('Geen rijen gevonden onder de kolomnamen.'); return }
    setAnalysis(a)
    setDecisions({})
    setAccepted(a.proposals.map(p => p.label))
  }

  async function run() {
    if (!plan) return
    setBusy(true); setError('')
    try {
      const r = await send<Result>('/api/freelancers/import', 'POST', {
        new_disciplines: plan.newDisciplines,
        create: plan.create,
        update: plan.update,
      })
      setResult(r)
    } catch (e) { setError(e instanceof Error ? e.message : 'Importeren lukte niet.') } finally { setBusy(false) }
  }

  const todo = plan ? plan.create.length + plan.update.length : 0

  // ── Klaar ──
  if (result && plan) {
    const skipped = plan.skipped.length + result.fouten.length
    return (
      <Modal title="Import klaar" onClose={onDone} wide footer={<Button variant="primary" data-primary onClick={onDone}>Sluiten</Button>}>
        <p className="flex items-center gap-2 text-sm text-zinc-200"><CheckCircle2 size={16} className="text-emerald-400" />
          {result.toegevoegd} toegevoegd · {result.bijgewerkt} bijgewerkt · {skipped} overgeslagen{result.disciplines ? ` · ${result.disciplines} nieuwe ${result.disciplines === 1 ? 'discipline' : 'disciplines'}` : ''}</p>
        {(result.fouten.length > 0 || plan.skipped.length > 0) && (
          <ul className="space-y-1 text-sm text-zinc-400">
            {[...result.fouten.map(f => ({ line: f.line, reason: f.message })), ...plan.skipped].sort((a, b) => a.line - b.line).map(s => <li key={s.line}>Rij {s.line}: {s.reason}</li>)}
          </ul>
        )}
      </Modal>
    )
  }

  // ── Bron ──
  if (!analysis) {
    return (
      <Modal title="Importeren" onClose={onClose} wide footer={<><Button onClick={onClose}>Annuleren</Button>
        <Button variant="primary" data-primary disabled={!text.trim() || !existing} onClick={() => preview()}>Voorbeeld tonen</Button></>}>
        <p className="text-sm text-zinc-400">Een CSV met de kolommen van de spreadsheet: <span className="text-zinc-300">{COLUMNS.join(', ')}</span>. De eerste regel bevat de kolomnamen. Er wordt niets opgeslagen voor je het voorbeeld bevestigt.</p>
        <div>
          <Button onClick={() => input.current?.click()} className="max-md:!h-11"><FileUp size={14} /> CSV kiezen</Button>
          {fileName && <span className="ml-2 text-sm text-zinc-400">{fileName}</span>}
          <input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="CSV-bestand"
            onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              if (f.size > 3 * 1024 * 1024) { setError('Dit bestand is te groot (hooguit 3 MB).'); return }
              const t = await readText(f); setFileName(f.name); setText(t); preview(t)
            }} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Of plak hier (ook rechtstreeks uit de spreadsheet)</span>
          <textarea value={text} onChange={e => { setText(e.target.value); setFileName('') }} className={`${textareaCls} min-h-[10rem] font-mono !text-base md:!text-xs`} placeholder={COLUMNS.join(';')} />
        </label>
        {!existing && !error && <p className="text-sm text-zinc-500">De huidige lijst wordt geladen…</p>}
        {error && <ErrorLine>{error}</ErrorLine>}
      </Modal>
    )
  }

  // ── Voorbeeld ──
  const byLine = new Map<number, { kind: 'nieuw' | 'bijwerken' | 'overslaan'; reason?: string }>()
  plan?.create.forEach(c => byLine.set(c.line, { kind: 'nieuw' }))
  plan?.update.forEach(u => byLine.set(u.line, { kind: 'bijwerken' }))
  plan?.skipped.forEach(s => byLine.set(s.line, { kind: 'overslaan', reason: s.reason }))
  const warnCount = analysis.rows.filter(r => r.warnings.length).length
  const dupCount = analysis.rows.filter(r => r.match || r.dupOf).length

  return (
    <Modal title="Importeren — voorbeeld" onClose={onClose} wide footer={<>
      <span className="mr-auto text-xs text-zinc-500">{plan ? `${plan.create.length} nieuw · ${plan.update.length} bijwerken · ${plan.skipped.length} overslaan` : ''}</span>
      <Button onClick={() => setAnalysis(null)}>Terug</Button>
      <Button variant="primary" data-primary disabled={!todo} busy={busy} onClick={run}>{todo === 1 ? '1 rij verwerken' : `${todo} rijen verwerken`}</Button></>}>
      <p className="text-sm text-zinc-300">{analysis.rows.length} rijen · {warnCount} met waarschuwingen · {dupCount} dubbels</p>
      {analysis.ignoredColumns.length > 0 && <p className="text-xs text-zinc-500">Kolommen zonder eigen veld (komen in de notities): {analysis.ignoredColumns.join(', ')}</p>}
      {analysis.proposals.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-2 text-sm text-amber-200">Onbekend in Wat? — toevoegen als discipline?</p>
          <div className="space-y-1">
            {analysis.proposals.map(p => {
              const on = accepted.includes(p.label)
              return (
                <label key={p.label} className="flex min-h-[44px] items-center gap-2.5 text-sm text-zinc-200 md:min-h-[32px]">
                  <input type="checkbox" checked={on} onChange={() => setAccepted(on ? accepted.filter(x => x !== p.label) : [...accepted, p.label])} className="h-4 w-4 accent-[#3A913F]" />
                  <span>“{p.label}”</span><span className="text-xs text-zinc-500">rij {p.lines.join(', ')}</span>
                </label>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Niet aangevinkt: de waarde komt in de notities.</p>
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {analysis.rows.map(r => {
          const st = byLine.get(r.line)
          const d = r.data
          const wat = [...d.disciplines.map(k => labels[k] ?? k), ...d.unknown.map(u => `${u}${accepted.includes(u) ? ' (nieuw)' : ' ⚠'}`)].join(', ')
          const price = d.price.amount != null && d.price.unit ? `€${d.price.amount.toLocaleString('nl-BE')}/${RATE_UNIT_LABEL[d.price.unit]}${d.price.note ? ` (+ notitie)` : ''}` : d.price.note ? `notitie: “${d.price.note}”` : '—'
          return (
            <li key={r.line} className="grid gap-x-3 gap-y-1 px-3 py-2 text-sm md:grid-cols-[2.5rem_minmax(0,1.3fr)_minmax(0,1.3fr)_7rem_minmax(0,1.2fr)_3.5rem_9rem] md:items-start">
              <span className="text-xs text-zinc-500 md:pt-0.5">#{r.line}</span>
              <span className="font-medium text-zinc-100">{d.name || <em className="text-red-400">geen naam</em>}{d.email && <span className="block truncate text-xs font-normal text-zinc-500">{d.email}</span>}</span>
              <span className="text-zinc-300"><span className="text-xs text-zinc-500 md:hidden">Wat: </span>{wat || '—'}</span>
              <span className="text-zinc-300"><span className="text-xs text-zinc-500 md:hidden">Status: </span>{d.statusGiven || !r.match ? STATUS_LABEL[d.status] : <span className="text-zinc-500">leeg (blijft)</span>}</span>
              <span className="text-zinc-300"><span className="text-xs text-zinc-500 md:hidden">Tarief: </span>{price}</span>
              <span className="text-zinc-300"><span className="text-xs text-zinc-500 md:hidden">Beoordeling: </span>{d.overall_rating ?? '—'}</span>
              <span>
                {r.match && !r.error && !r.dupOf
                  ? <>
                      <span className="block text-xs text-amber-300">Bestaat al ({r.match.by}){r.match.archived ? ', gearchiveerd' : ''}</span>
                      <Select value={decisions[r.line] ?? 'overslaan'} onChange={e => setDecisions({ ...decisions, [r.line]: e.target.value as Decision })}
                        aria-label={`Rij ${r.line}: wat met de dubbel?`} className="!h-11 !text-base md:!h-8 md:!text-xs">
                        <option value="overslaan">Overslaan</option><option value="bijwerken">Bijwerken</option>
                      </Select>
                    </>
                  : st?.kind === 'nieuw' ? <span className="text-emerald-400">Nieuw</span>
                  : <span className="text-zinc-400">Overslaan{st?.reason ? <span className="block text-xs text-zinc-500">{st.reason}</span> : null}</span>}
              </span>
              {r.warnings.length > 0 && (
                <ul className="space-y-0.5 md:col-span-6 md:col-start-2">
                  {r.warnings.map(w => <li key={w} className="flex items-start gap-1.5 text-xs text-amber-300"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{w}</li>)}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
