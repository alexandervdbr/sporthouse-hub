'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Check, ChevronLeft, ChevronRight, BookOpen, Plus, Trash2 } from 'lucide-react'
import { KENNISBANK_BLOCKS, QUESTION_COUNT, newCustomKey, type KennisbankSection } from '@/lib/kennisbank-questions'

interface Props {
  clientId: string
  clientName: string
  onClose: () => void
  onSaved: (answeredCount: number) => void
}

export default function KennisbankWizard({ clientId, clientName, onClose, onSaved }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [sections, setSections] = useState<KennisbankSection[]>([])
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Wat er nog niet is weggeschreven. Bijhouden in een ref zodat de timer altijd
  // de laatste stand meeneemt zonder telkens opnieuw gezet te worden.
  const pending = useRef<Record<string, string>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sectionsRef = useRef<KennisbankSection[]>([])
  useEffect(() => { sectionsRef.current = sections }, [sections])

  useEffect(() => {
    fetch(`/api/kennisbank?clientId=${clientId}`)
      .then(r => r.json())
      .then(data => {
        setAnswers(data.answers ?? {})
        setSections(data.sections ?? [])
        setCanEdit(!!data.canEdit)
      })
      .catch(() => setError('Kon de kennisbank niet laden.'))
      .finally(() => setLoading(false))
  }, [clientId])

  const flush = useCallback(async () => {
    const batch = pending.current
    if (Object.keys(batch).length === 0) return
    pending.current = {}
    setSaving(true)
    try {
      const res = await fetch('/api/kennisbank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, answers: batch, sections: sectionsRef.current }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Opslaan mislukt')
      setSavedAt(new Date())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
      // Terug in de wachtrij, zodat een mislukte poging niet stilzwijgend
      // verdwijnt en de volgende wijziging hem meeneemt.
      pending.current = { ...batch, ...pending.current }
    }
    setSaving(false)
  }, [clientId])

  function update(key: string, value: string) {
    setAnswers(prev => ({ ...prev, [key]: value }))
    pending.current[key] = value
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 900)
  }

  function updateSection(key: string, patch: Partial<KennisbankSection>) {
    setSections(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s))
    // Een sectie heeft geen eigen sleutel in de wachtrij; markeer dat er iets
    // te bewaren is zodat de timer afgaat.
    pending.current.__sections = '1'
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 900)
  }

  function addSection() {
    setSections(prev => [...prev, {
      key: newCustomKey(),
      title: '',
      answer: '',
      sort_order: prev.length,
    }])
  }

  async function removeSection(key: string) {
    const s = sections.find(x => x.key === key)
    if (s && (s.title.trim() || s.answer.trim()) && !confirm('Deze sectie verwijderen?')) return
    setSections(prev => prev.filter(x => x.key !== key))
    await fetch(`/api/kennisbank?clientId=${clientId}&key=${encodeURIComponent(key)}`, { method: 'DELETE' })
  }

  // Niets verliezen bij sluiten of wisselen van blok.
  async function close() {
    if (timer.current) clearTimeout(timer.current)
    await flush()
    onSaved(Object.values(answers).filter(a => a.trim()).length)
    onClose()
  }

  async function goto(next: number) {
    if (timer.current) clearTimeout(timer.current)
    await flush()
    setStep(next)
  }

  const block = KENNISBANK_BLOCKS[step]
  const answeredTotal = Object.values(answers).filter(a => a.trim()).length
  const answeredHere = block?.questions.filter(q => answers[q.key]?.trim()).length ?? 0

  // Via een portal naar body: de klantkop waarin de knop staat heeft een
  // backdrop-filter, en zo'n element wordt het referentiekader voor alles wat
  // position: fixed is. Zonder portal viel inset-0 dus samen met die balk in
  // plaats van met het scherm — vandaar de half verduisterde achtergrond en
  // het venster dat over de kaarten heen lag.
  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4" onClick={close}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[88dvh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
      >
        {/* Kop */}
        <div className="px-4 sm:px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <BookOpen size={14} className="text-zinc-500 flex-shrink-0" />
              <span className="truncate">Kennisbank — {clientName}</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {answeredTotal} van {QUESTION_COUNT} vragen ingevuld
            </p>
          </div>
          <button onClick={close} aria-label="Sluiten" className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-zinc-500 hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>

        {/* Voortgang per blok */}
        <div className="px-4 sm:px-5 pt-3 flex-shrink-0">
          <div className="flex gap-1">
            {KENNISBANK_BLOCKS.map((b, i) => {
              const done = b.questions.filter(q => answers[q.key]?.trim()).length
              const full = done === b.questions.length
              return (
                <button
                  key={b.key}
                  onClick={() => goto(i)}
                  title={`${b.title} — ${done}/${b.questions.length}`}
                  className="flex-1 group"
                >
                  <span className={`block h-1 rounded-full transition-colors ${
                    i === step ? 'bg-zinc-300' : full ? 'bg-[#3A913F]' : done > 0 ? 'bg-zinc-600' : 'bg-zinc-800'
                  }`} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Vragen */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-zinc-600">
              <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
            </div>
          ) : block ? (
            <>
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-widest text-zinc-600">
                  Blok {step + 1} van {KENNISBANK_BLOCKS.length} · {answeredHere}/{block.questions.length}
                </p>
                <h3 className="text-base font-semibold text-zinc-100 mt-0.5">{block.title}</h3>
                {block.intro && <p className="text-xs text-zinc-500 mt-1">{block.intro}</p>}
              </div>

              <div className="space-y-4">
                {block.key === 'aanvullend' && (
                  <p className="text-xs text-zinc-500 -mt-1">
                    Voor afspraken met een eigen naam — embargo&rsquo;s, een workflow, merkregels —
                    maak je hieronder een aparte sectie aan.
                  </p>
                )}
                {block.questions.map(q => (
                  <div key={q.key}>
                    <label className="block text-sm text-zinc-300 mb-1.5">
                      <span className="text-zinc-600 mr-1.5">{q.number}.</span>
                      {q.question}
                      {q.hint && <span className="block text-xs text-zinc-600 mt-0.5 ml-5">{q.hint}</span>}
                    </label>
                    <textarea
                      value={answers[q.key] ?? ''}
                      onChange={e => update(q.key, e.target.value)}
                      disabled={!canEdit}
                      rows={q.long ? 4 : 2}
                      placeholder={canEdit ? 'Nog niet ingevuld…' : '—'}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 resize-y disabled:opacity-60"
                    />
                  </div>
                ))}

                {block.key === 'aanvullend' && (
                  <div className="pt-2 space-y-3">
                    {sections.map(sec => (
                      <div key={sec.key} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={sec.title}
                            onChange={e => updateSection(sec.key, { title: e.target.value })}
                            disabled={!canEdit}
                            placeholder="Titel, bv. Embargo's"
                            className="flex-1 min-w-0 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-medium text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 disabled:opacity-60"
                          />
                          {canEdit && (
                            <button
                              onClick={() => removeSection(sec.key)}
                              aria-label="Sectie verwijderen"
                              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <textarea
                          value={sec.answer}
                          onChange={e => updateSection(sec.key, { answer: e.target.value })}
                          disabled={!canEdit}
                          rows={5}
                          placeholder="Wat moet iedereen hierover weten?"
                          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 resize-y disabled:opacity-60"
                        />
                        {!sec.title.trim() && sec.answer.trim() && (
                          <p className="text-[11px] text-amber-400">Geef deze sectie een titel, anders wordt ze niet bewaard.</p>
                        )}
                      </div>
                    ))}

                    {canEdit && (
                      <button
                        onClick={addSection}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 w-full justify-center"
                      >
                        <Plus size={14} /> Eigen sectie toevoegen
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Voet */}
        <div className="px-4 sm:px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2 flex-shrink-0">
          <button
            onClick={() => goto(Math.max(0, step - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Vorige
          </button>

          <span className="text-xs text-zinc-600 mx-auto text-center">
            {!canEdit ? 'Alleen lezen' :
              error ? <span className="text-red-400">{error}</span> :
              saving ? <span className="flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Opslaan…</span> :
              savedAt ? <span className="flex items-center gap-1.5 text-zinc-500"><Check size={11} /> Opgeslagen</span> :
              'Wijzigingen worden vanzelf bewaard'}
          </span>

          {step < KENNISBANK_BLOCKS.length - 1 ? (
            <button
              onClick={() => goto(step + 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: '#3A913F' }}
            >
              Volgende <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={close}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: '#3A913F' }}
            >
              <Check size={14} /> Klaar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
