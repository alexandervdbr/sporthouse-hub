'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, Send, Trash2, Loader2, FileText, BookOpen, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Doc {
  id: string
  filename: string
  page_count: number | null
  uploaded_by: string | null
  created_at: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function BiocartisChat({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<'chat' | 'docs'>('chat')
  const [docs, setDocs] = useState<Doc[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadDocs() {
    const res = await fetch(`/api/biocartis/documents?clientId=${clientId}`)
    const data = await res.json()
    setDocs(Array.isArray(data) ? data : [])
    setLoadingDocs(false)
  }

  useEffect(() => { loadDocs() }, [clientId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('clientId', clientId)

    const res = await fetch('/api/biocartis/upload', { method: 'POST', body: form })
    const data = await res.json()

    if (!res.ok) {
      setUploadError(data.error)
    } else {
      await loadDocs()
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/biocartis/documents?id=${id}`, { method: 'DELETE' })
    await loadDocs()
    setDeletingId(null)
  }

  async function handleSend() {
    if (!input.trim() || streaming) return
    if (docs.length === 0) {
      setChatError('Upload eerst een PDF-document via het tabblad "Documenten".')
      return
    }

    const question = input.trim()
    setInput('')
    setChatError(null)
    setMessages(m => [...m, { role: 'user', content: question }])
    setStreaming(true)

    let answer = ''
    setMessages(m => [...m, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/biocartis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, question }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        answer += decoder.decode(value, { stream: true })
        setMessages(m => {
          const updated = [...m]
          updated[updated.length - 1] = { role: 'assistant', content: answer }
          return updated
        })
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Er is een fout opgetreden.')
      setMessages(m => m.slice(0, -1))
    }

    setStreaming(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800 flex-shrink-0">
        {([['chat', 'Chat', BookOpen], ['docs', 'Documenten', FileText]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-wider transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'text-sh-grey border-sh-green'
                : 'text-zinc-600 border-transparent hover:text-zinc-400'
            }`}
            style={tab === key ? { borderColor: '#3A913F' } : {}}
          >
            <Icon size={12} />
            {label}
            {key === 'docs' && docs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                {docs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* CHAT TAB */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {docs.length === 0 && !loadingDocs && (
            <div className="flex items-center gap-2.5 mx-4 mt-4 px-4 py-3 bg-amber-950/30 border border-amber-900/40 rounded-lg">
              <span className="text-amber-400 text-xs">⚠</span>
              <p className="text-xs text-amber-400">
                Nog geen documenten geüpload. Ga naar het tabblad &ldquo;Documenten&rdquo; om een PDF toe te voegen.
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                <div className="w-12 h-12 rounded-xl bg-zinc-800/60 flex items-center justify-center">
                  <BookOpen size={20} className="text-zinc-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-400">Stel een vraag over de werkinstructies</p>
                  <p className="text-xs text-zinc-600 mt-1">Bijv. &ldquo;Hoe verwerk ik een nieuwe staalname?&rdquo;</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm text-white" style={{ backgroundColor: '#3A913F' }}>
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[85%] px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm text-sm text-zinc-300 leading-relaxed">
                    {msg.content
                      ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                      : <span className="flex gap-1">
                          {[0,1,2].map(i => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </span>
                    }
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Error */}
          {chatError && (
            <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-red-950/40 border border-red-900/40 rounded-lg">
              <p className="text-xs text-red-400 flex-1">{chatError}</p>
              <button onClick={() => setChatError(null)} aria-label="Foutmelding sluiten"><X size={12} className="text-red-400" /></button>
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 px-4 pb-4">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Stel een vraag over de instructies…"
                rows={1}
                className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors resize-none"
                style={{ minHeight: 42, maxHeight: 120 }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                aria-label="Verstuur bericht"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-white transition-colors disabled:opacity-40 flex-shrink-0"
                style={{ backgroundColor: '#3A913F' }}
              >
                {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCS TAB */}
      {tab === 'docs' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Upload */}
          <label className={`flex flex-col items-center gap-3 px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            uploading ? 'border-zinc-700 opacity-60 cursor-not-allowed' : 'border-zinc-700 hover:border-zinc-600'
          }`}>
            {uploading
              ? <Loader2 size={22} className="animate-spin text-zinc-500" />
              : <Upload size={22} className="text-zinc-600" />
            }
            <div className="text-center">
              <p className="text-sm text-zinc-400">{uploading ? 'PDF verwerken…' : 'Klik om PDF te uploaden'}</p>
              <p className="text-xs text-zinc-600 mt-1">Maximaal 20MB · Tekst-gebaseerde PDF</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>

          {uploadError && (
            <div className="px-4 py-3 bg-red-950/40 border border-red-900/40 rounded-lg">
              <p className="text-sm text-red-400">{uploadError}</p>
            </div>
          )}

          {/* Document list */}
          {loadingDocs ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-4">Nog geen documenten geüpload.</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
                  <FileText size={16} className="text-zinc-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sh-grey truncate">{doc.filename}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {doc.page_count ? `${doc.page_count} pagina's` : ''}
                      {doc.page_count && doc.uploaded_by ? ' · ' : ''}
                      {doc.uploaded_by ?? ''}
                      {' · '}{new Date(doc.created_at).toLocaleDateString('nl-BE')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    aria-label="Verwijder document"
                    className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    {deletingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
