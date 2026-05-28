'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Sparkles, Send, Copy, Check, Plus, Trash2,
  BookOpen, Wand2, Loader2, RotateCcw,
} from 'lucide-react'

// ─── Per-client copy types config ─────────────────────────────────────────────
// Add or extend types here per client name.

const CLIENT_COPY_TYPES: Record<string, string[]> = {
  'Unibet Experts': ['Titel + Caption'],
}


// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface CopyExample {
  id: string
  content: string
  platform: string | null
  copy_type_name: string | null
  created_at: string
}

interface Props {
  clientId: string
  clientName: string
  canManageExamples?: boolean
}

// ─── Copy block ───────────────────────────────────────────────────────────────

function CopyBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Detect Titel + Caption format
  const titelMatch = content.match(/\*\*TITEL:\*\*\s*(.+)/i)
  const captionMatch = content.match(/\*\*CAPTION:\*\*\s*([\s\S]+)/i)
  const isCombined = titelMatch && captionMatch

  return (
    <div className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
      {isCombined ? (
        <div>
          <div className="px-4 py-3 border-b border-zinc-800" style={{ background: 'rgba(58,145,63,0.06)' }}>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Titel</p>
            <p className="text-sm font-semibold text-zinc-100 leading-snug pr-8">{titelMatch[1].trim()}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Caption</p>
            <p className="text-sm text-sh-grey leading-relaxed whitespace-pre-wrap pr-8">{captionMatch[1].trim()}</p>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <p className="text-sm text-sh-grey leading-relaxed whitespace-pre-wrap pr-8">{content}</p>
        </div>
      )}
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all hover:bg-zinc-700"
      >
        {copied
          ? <Check size={12} style={{ color: '#3A913F' }} />
          : <Copy size={12} className="text-zinc-400" />
        }
      </button>
    </div>
  )
}

function parseOptions(text: string): string[] {
  const parts = text.split(/(?=^[1-9]\.\s)/m).filter(p => p.trim())
  if (parts.length >= 2) return parts.map(p => p.replace(/^[1-9]\.\s*/, '').trim())
  return [text.trim()]
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CopyGenerator({ clientId, clientName, canManageExamples = false }: Props) {
  const types = CLIENT_COPY_TYPES[clientName] ?? []
  const hasTypes = types.length > 0
  const singleType = types.length === 1 ? types[0] : null

  const [tab, setTab] = useState<'generate' | 'examples'>('generate')
  const [selectedType, setSelectedType] = useState<string | null>(singleType)

  // Generate state
  const [brief, setBrief] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Examples state
  const [examples, setExamples] = useState<CopyExample[]>([])
  const [newExample, setNewExample] = useState('')
  const [loadingExamples, setLoadingExamples] = useState(true)
  const [savingExample, setSavingExample] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoadingExamples(true)
      let query = supabase
        .from('copy_examples')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

      if (selectedType) {
        query = query.eq('copy_type_name', selectedType)
      } else {
        query = query.is('copy_type_name', null)
      }

      const { data } = await query
      setExamples((data as CopyExample[]) ?? [])
      setLoadingExamples(false)
    }
    load()
  }, [clientId, selectedType])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  function switchType(type: string | null) {
    setSelectedType(type)
    setMessages([])
    setBrief('')
    setStreamingContent('')
  }

  async function streamResponse(messagesToSend: Message[], isFirst: boolean, briefText: string) {
    setIsStreaming(true)
    setStreamingContent('')
    try {
      const res = await fetch('/api/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientName,
          messages: isFirst ? [] : messagesToSend,
          brief: briefText,
          copyTypeName: selectedType,
        }),
      })
      if (!res.ok || !res.body) throw new Error('API fout')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamingContent(full)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: full }])
      setStreamingContent('')
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Er is een fout opgetreden. Probeer opnieuw.' }])
      setStreamingContent('')
    } finally {
      setIsStreaming(false)
    }
  }

  async function handleGenerate() {
    if (!brief.trim()) return
    const userMsg: Message = {
      role: 'user',
      content: `${selectedType ? `Type: ${selectedType}\n` : ''}Brief: ${brief}`,
    }
    setMessages([userMsg])
    await streamResponse([userMsg], true, brief)
  }

  async function handleChat() {
    if (!chatInput.trim() || isStreaming) return
    const userMsg: Message = { role: 'user', content: chatInput }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setChatInput('')
    await streamResponse(updated, false, brief)
  }

  function handleReset() {
    setMessages([])
    setBrief('')
    setChatInput('')
    setStreamingContent('')
  }

  async function handleSaveExample() {
    if (!newExample.trim()) return
    setSavingExample(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('copy_examples').insert({
      client_id: clientId,
      content: newExample.trim(),
      platform: null,
      copy_type_name: selectedType || null,
      created_by: user?.email,
    }).select().single()
    if (data) {
      setExamples(prev => [data as CopyExample, ...prev])
      setNewExample('')
    }
    setSavingExample(false)
  }

  async function handleDeleteExample(id: string) {
    await supabase.from('copy_examples').delete().eq('id', id)
    setExamples(prev => prev.filter(e => e.id !== id))
  }

  const hasGenerated = messages.some(m => m.role === 'assistant')

  return (
    <div className="space-y-6">

      {/* ── Type selector ─────────────────────────────────── */}
      {hasTypes && !singleType && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => switchType(null)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              selectedType === null
                ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                : 'text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            Algemeen
          </button>
          {types.map(type => (
            <button
              key={type}
              onClick={() => switchType(type)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                selectedType === type
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
        <button
          onClick={() => setTab('generate')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'generate' ? 'bg-zinc-800 text-sh-grey' : 'text-zinc-500 hover:text-zinc-400'
          }`}
        >
          <Wand2 size={12} />
          Genereren
        </button>
        <button
          onClick={() => setTab('examples')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'examples' ? 'bg-zinc-800 text-sh-grey' : 'text-zinc-500 hover:text-zinc-400'
          }`}
        >
          <BookOpen size={12} />
          Stijlvoorbeelden
          {examples.length > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400 text-[10px]">
              {examples.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Generate tab ──────────────────────────────────── */}
      {tab === 'generate' && (
        <div className="space-y-6">
          {!hasGenerated && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">
                  Brief <span className="text-zinc-700">— Waarover gaat de copy?</span>
                </label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder="bv. Post over de 3-0 overwinning van Club Brugge tegen Standard. Highlight de hattrick van Jutgla."
                  rows={4}
                  className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors resize-none"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={!brief.trim() || isStreaming}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#3A913F' }}
              >
                {isStreaming
                  ? <><Loader2 size={14} className="animate-spin" /> Genereren...</>
                  : <><Sparkles size={14} /> Genereer{selectedType ? ` ${selectedType}` : ' copy'}</>
                }
              </button>
            </div>
          )}

          {(hasGenerated || isStreaming) && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-600 mb-0.5 flex items-center gap-2">
                    {selectedType && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-medium uppercase tracking-wide">
                        {selectedType}
                      </span>
                    )}
                    <span>Brief</span>
                  </p>
                  <p className="text-sm text-zinc-400 truncate">{brief}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 bg-zinc-800 rounded-lg flex-shrink-0 transition-colors"
                >
                  <RotateCcw size={11} />
                  Opnieuw
                </button>
              </div>

              <div className="space-y-4">
                {messages.map((msg, i) => {
                  if (msg.role === 'user' && i === 0) return null
                  if (msg.role === 'user') {
                    return (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-lg px-4 py-2.5 bg-zinc-800 rounded-xl text-sm text-sh-grey">
                          {msg.content}
                        </div>
                      </div>
                    )
                  }
                  const options = parseOptions(msg.content)
                  const isMultiple = options.length > 1
                  return (
                    <div key={i} className="space-y-3">
                      {isMultiple && <p className="text-xs text-zinc-600">{options.length} opties gegenereerd</p>}
                      {options.map((opt, j) => (
                        <div key={j}>
                          {isMultiple && <p className="text-xs text-zinc-600 mb-1.5">Optie {j + 1}</p>}
                          <CopyBlock content={opt} />
                        </div>
                      ))}
                    </div>
                  )
                })}

                {streamingContent && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-sm text-sh-grey leading-relaxed whitespace-pre-wrap">{streamingContent}</p>
                    <Loader2 size={12} className="animate-spin text-zinc-600 mt-2" />
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {hasGenerated && !isStreaming && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-600">Niet tevreden? Geef feedback of vraag een aanpassing.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChat()}
                      placeholder="bv. Maak optie 2 korter en voeg 3 hashtags toe..."
                      className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
                    />
                    <button
                      onClick={handleChat}
                      disabled={!chatInput.trim() || isStreaming}
                      className="px-4 py-2.5 rounded-lg disabled:opacity-40 transition-colors text-white"
                      style={{ backgroundColor: '#3A913F' }}
                    >
                      <Send size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Examples tab ──────────────────────────────────── */}
      {tab === 'examples' && (
        <div className="space-y-6 max-w-2xl">
          <div>
            <p className="text-sm text-sh-grey">
              Stijlvoorbeelden{selectedType ? ` — ${selectedType}` : ''}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {selectedType
                ? `Voorbeelden die de AI gebruikt bij het genereren van ${selectedType}.`
                : 'Algemene stijlvoorbeelden voor de AI.'
              }
            </p>
          </div>

          {canManageExamples && (
            <div className="space-y-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
              <p className="text-xs font-medium text-zinc-400">Nieuw voorbeeld toevoegen</p>
              <textarea
                value={newExample}
                onChange={e => setNewExample(e.target.value)}
                placeholder={`Plak hier een voorbeeld${selectedType ? ` van ${selectedType.toLowerCase()}` : ''} voor ${clientName}...`}
                rows={4}
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors resize-none"
              />
              <button
                onClick={handleSaveExample}
                disabled={!newExample.trim() || savingExample}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#3A913F' }}
              >
                {savingExample
                  ? <><Loader2 size={11} className="animate-spin" /> Opslaan...</>
                  : <><Plus size={11} /> Toevoegen</>
                }
              </button>
            </div>
          )}

          {loadingExamples ? (
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <Loader2 size={12} className="animate-spin" /> Laden...
            </div>
          ) : examples.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">
              <BookOpen size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nog geen stijlvoorbeelden</p>
              <p className="text-xs mt-1">
                {selectedType ? `Voeg voorbeelden toe voor ${selectedType}.` : `Voeg copy toe zodat de AI de stijl van ${clientName} leert.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-600">{examples.length} {examples.length === 1 ? 'voorbeeld' : 'voorbeelden'}</p>
              {examples.map(ex => (
                <div key={ex.id} className="group relative p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap pr-8">{ex.content}</p>
                  {canManageExamples && (
                    <button
                      onClick={() => handleDeleteExample(ex.id)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-900/40 hover:text-red-400 text-zinc-600"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
