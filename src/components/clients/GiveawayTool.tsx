'use client'

import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { Upload, Trophy, RefreshCw, Save, Trash2, Check, ChevronDown, ChevronUp, Loader2, Users, FileText } from 'lucide-react'

interface Comment {
  comment_id: string
  created_at: string
  profile_pic_url: string
  text: string
  user_id: string
  username: string
}

interface Giveaway {
  id: string
  title: string
  question: string | null
  correct_answer: string
  winner_username: string | null
  total_comments: number
  eligible_count: number
  created_by: string | null
  created_at: string
}

function isCorrect(text: string, answers: string[]): boolean {
  const normalized = text.toLowerCase().trim()
  return answers.some(ans => normalized.includes(ans.toLowerCase().trim()))
}

function WinnerAnimation({ candidates, onDone }: { candidates: Comment[], onDone: (w: Comment) => void }) {
  const [current, setCurrent] = useState(candidates[0].username)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speedRef = useRef(60)
  const iterRef = useRef(0)
  const maxIter = 40

  useEffect(() => {
    const winner = candidates[Math.floor(Math.random() * candidates.length)]

    function tick() {
      iterRef.current++
      const rand = candidates[Math.floor(Math.random() * candidates.length)]
      setCurrent(rand.username)

      if (iterRef.current >= maxIter) {
        clearInterval(intervalRef.current!)
        setCurrent(winner.username)
        setTimeout(() => onDone(winner), 600)
        return
      }

      // Slow down gradually
      if (iterRef.current > 25) {
        clearInterval(intervalRef.current!)
        speedRef.current += 40
        intervalRef.current = setInterval(tick, speedRef.current)
      }
    }

    intervalRef.current = setInterval(tick, speedRef.current)
    return () => clearInterval(intervalRef.current!)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3A913F22', border: '2px solid #3A913F' }}>
        <Trophy size={28} style={{ color: '#3A913F' }} />
      </div>
      <p className="text-2xl font-bold text-sh-grey font-mono tracking-wide">@{current}</p>
      <p className="text-xs text-zinc-600">Winnaar aan het kiezen…</p>
    </div>
  )
}

export default function GiveawayTool({ clientId }: { clientId: string }) {
  const [step, setStep] = useState<'setup' | 'filter' | 'winner' | 'done'>('setup')

  // Setup
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  // Filter
  const [eligible, setEligible] = useState<Comment[]>([])
  const [showAll, setShowAll] = useState(false)

  // Winner
  const [picking, setPicking] = useState(false)
  const [winner, setWinner] = useState<Comment | null>(null)

  // History
  const [history, setHistory] = useState<Giveaway[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadHistory() {
    const res = await fetch(`/api/giveaways?clientId=${clientId}`)
    const data = await res.json()
    setHistory(Array.isArray(data) ? data : [])
    setLoadingHistory(false)
  }

  useEffect(() => { loadHistory() }, [clientId])

  function handleFile(f: File) {
    setFile(f)
    setParseError(null)
    Papa.parse<Comment>(f, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const rows = results.data as Comment[]
        // Validate expected columns
        if (rows.length > 0 && !('username' in rows[0])) {
          setParseError('Kolom "username" niet gevonden. Controleer het bestandsformaat.')
          return
        }
        if (rows.length > 0 && !('text' in rows[0])) {
          setParseError('Kolom "text" niet gevonden. Controleer het bestandsformaat.')
          return
        }
        setComments(rows)
      },
      error(err) {
        setParseError(`Fout bij verwerken: ${err.message}`)
      },
    })
  }

  function handleFilter() {
    const answers = correctAnswer.split(',').filter(a => a.trim())
    const matched = comments.filter(c => isCorrect(c.text, answers))
    // Deduplicate by username (keep first comment)
    const seen = new Set<string>()
    const deduped = matched.filter(c => {
      if (seen.has(c.username.toLowerCase())) return false
      seen.add(c.username.toLowerCase())
      return true
    })
    setEligible(deduped)
    setStep('filter')
  }

  function handlePickWinner() {
    setPicking(true)
    setStep('winner')
  }

  function handleWinnerDone(w: Comment) {
    setWinner(w)
    setPicking(false)
    setStep('done')
  }

  async function handleSave() {
    if (!winner) return
    setSaving(true)
    await fetch('/api/giveaways', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        title: title || `Giveaway ${new Date().toLocaleDateString('nl-BE')}`,
        question,
        correctAnswer,
        winnerUsername: winner.username,
        totalComments: comments.length,
        eligibleCount: eligible.length,
      }),
    })
    setSaved(true)
    await loadHistory()
    setSaving(false)
  }

  function handleReset() {
    setStep('setup')
    setTitle('')
    setQuestion('')
    setCorrectAnswer('')
    setFile(null)
    setComments([])
    setEligible([])
    setWinner(null)
    setSaved(false)
    setPicking(false)
    setParseError(null)
    setShowAll(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/giveaways?id=${id}`, { method: 'DELETE' })
    await loadHistory()
    setDeletingId(null)
  }

  const visibleEligible = showAll ? eligible : eligible.slice(0, 8)

  return (
    <div className="space-y-8">

      {/* ── TOOL ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {/* Header tabs */}
        <div className="flex border-b border-zinc-800">
          {(['setup', 'filter', 'winner', 'done'] as const).map((s, i) => {
            const labels = ['1. Instellen', '2. Filteren', '3. Winnaar', '4. Klaar']
            const reached = ['setup', 'filter', 'winner', 'done'].indexOf(step) >= i
            return (
              <div
                key={s}
                className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${
                  step === s ? 'text-sh-grey border-b-2 border-sh-green' :
                  reached ? 'text-zinc-500' : 'text-zinc-700'
                }`}
                style={step === s ? { borderColor: '#3A913F' } : {}}
              >
                {labels[i]}
              </div>
            )
          })}
        </div>

        <div className="p-4 sm:p-6">

          {/* STEP 1: SETUP */}
          {step === 'setup' && (
            <div className="space-y-5 max-w-xl">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Titel giveaway</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={`Giveaway ${new Date().toLocaleDateString('nl-BE')}`}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Vraag <span className="text-zinc-700">(optioneel)</span></label>
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Welke speler scoorde het winnende doelpunt?"
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">
                  Correct antwoord <span className="text-zinc-700">— meerdere variaties? Scheid met komma</span>
                </label>
                <input
                  value={correctAnswer}
                  onChange={e => setCorrectAnswer(e.target.value)}
                  placeholder="Ronaldo, Cristiano, CR7"
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">CSV-bestand van scraper</label>
                <label className="flex flex-col items-center gap-3 px-6 py-8 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors">
                  <Upload size={22} className="text-zinc-600" />
                  <div className="text-center">
                    <p className="text-sm text-zinc-400">
                      {file ? file.name : 'Klik om CSV te uploaden'}
                    </p>
                    {comments.length > 0 && (
                      <p className="text-xs text-zinc-600 mt-1">{comments.length} reacties ingeladen</p>
                    )}
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </label>
                {parseError && <p className="text-xs text-red-400 mt-2">{parseError}</p>}
              </div>

              <button
                onClick={handleFilter}
                disabled={!correctAnswer.trim() || comments.length === 0}
                className="w-full py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40"
                style={{ backgroundColor: '#3A913F' }}
              >
                Filteren op correct antwoord
              </button>
            </div>
          )}

          {/* STEP 2: FILTER */}
          {step === 'filter' && (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Totaal reacties', value: comments.length, icon: FileText },
                  { label: 'Correct antwoord', value: eligible.length, icon: Check },
                  { label: 'Antwoord gezocht', value: correctAnswer, icon: Users },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
                    <p className="text-xs text-zinc-500 mb-1">{label}</p>
                    <p className="text-sm font-semibold text-sh-grey truncate">{value}</p>
                  </div>
                ))}
              </div>

              {eligible.length === 0 ? (
                <div className="py-8 text-center border border-zinc-800 rounded-xl">
                  <p className="text-sm text-zinc-500">Geen reacties gevonden met het correcte antwoord.</p>
                  <button onClick={() => setStep('setup')} className="text-xs text-zinc-600 hover:text-zinc-400 mt-2 transition-colors">← Terug</button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {visibleEligible.map((c, i) => (
                      <div key={c.comment_id || i} className="flex items-start gap-3 px-4 py-2.5 bg-zinc-800/40 border border-zinc-800 rounded-lg">
                        <span className="text-xs text-zinc-600 w-5 flex-shrink-0 mt-0.5">{i + 1}</span>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-sh-grey">@{c.username}</span>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">{c.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {eligible.length > 8 && (
                    <button
                      onClick={() => setShowAll(v => !v)}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {showAll ? 'Minder tonen' : `Nog ${eligible.length - 8} deelnemers tonen`}
                    </button>
                  )}

                  <button
                    onClick={handlePickWinner}
                    className="w-full py-2.5 text-sm font-medium text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#3A913F' }}
                  >
                    <Trophy size={15} />
                    Kies een winnaar
                  </button>
                </>
              )}
            </div>
          )}

          {/* STEP 3: ANIMATION */}
          {step === 'winner' && picking && (
            <WinnerAnimation candidates={eligible} onDone={handleWinnerDone} />
          )}

          {/* STEP 4: DONE */}
          {step === 'done' && winner && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-4 py-8 border border-zinc-800 rounded-xl">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3A913F22', border: '2px solid #3A913F' }}>
                  <Trophy size={28} style={{ color: '#3A913F' }} />
                </div>
                <div className="text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Winnaar</p>
                  <p className="text-2xl font-bold text-sh-grey">@{winner.username}</p>
                  <p className="text-xs text-zinc-600 mt-2 max-w-xs mx-auto">&ldquo;{winner.text}&rdquo;</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || saved}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
                  style={{ backgroundColor: saved ? '#2d7a31' : '#3A913F' }}
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {saved ? 'Opgeslagen' : 'Opslaan in geschiedenis'}
                </button>

                <button
                  onClick={() => { setWinner(null); setPicking(true); setStep('winner'); setTimeout(() => setPicking(false), 50); handlePickWinner() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-sh-grey bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
                >
                  <RefreshCw size={13} />
                  Opnieuw kiezen
                </button>

                <button
                  onClick={handleReset}
                  className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors px-2"
                >
                  Nieuwe giveaway
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── HISTORY ── */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Geschiedenis</h3>

        {loadingHistory ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>
        ) : history.length === 0 ? (
          <p className="text-sm text-zinc-600 py-4">Nog geen giveaways opgeslagen.</p>
        ) : (
          <div className="space-y-2">
            {history.map(g => (
              <div key={g.id} className="flex items-center gap-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
                <Trophy size={14} style={{ color: '#3A913F' }} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sh-grey truncate">{g.title}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Winnaar: <span className="text-zinc-400">@{g.winner_username ?? '—'}</span>
                    {' · '}{g.eligible_count} correct van {g.total_comments}
                    {' · '}{new Date(g.created_at).toLocaleDateString('nl-BE')}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(g.id)}
                  disabled={deletingId === g.id}
                  className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  {deletingId === g.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
