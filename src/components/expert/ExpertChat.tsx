'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import {
  Send, Loader2, MessageSquare, AlertTriangle, PenSquare,
  FolderOpen, Trash2, Pencil,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'meta'
  content: string
  created_at?: string
}

interface Session {
  session_id: string
  title: string
  customTitle?: string
  created_at: string
}

interface Props {
  clientId: string
  clientName: string
  clientLogoUrl: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Vandaag'
  if (diffDays === 1) return 'Gisteren'
  if (diffDays < 7) return `${diffDays} dagen geleden`
  return date.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="expert-prose prose prose-invert max-w-none
      prose-p:text-[15px] prose-p:leading-[1.85] prose-p:my-4 prose-p:text-zinc-200
      prose-headings:font-semibold prose-headings:text-zinc-100 prose-headings:tracking-normal
      prose-h1:text-[17px] prose-h1:mt-8 prose-h1:mb-3
      prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-2.5
      prose-h3:text-[14px] prose-h3:mt-6 prose-h3:mb-2
      prose-ul:my-4 prose-ul:pl-5
      prose-ol:my-4 prose-ol:pl-5
      prose-li:text-[15px] prose-li:leading-[1.85] prose-li:text-zinc-200 prose-li:my-1.5
      prose-strong:text-zinc-100 prose-strong:font-semibold
      prose-em:text-zinc-300 prose-em:italic
      prose-code:text-emerald-300 prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-zinc-800/70 prose-pre:border prose-pre:border-zinc-700/60 prose-pre:rounded-lg prose-pre:text-[13px] prose-pre:my-5
      prose-blockquote:border-l-2 prose-blockquote:border-zinc-600 prose-blockquote:text-zinc-400 prose-blockquote:not-italic prose-blockquote:pl-4 prose-blockquote:my-5
      prose-hr:border-zinc-700/60 prose-hr:my-6
      prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExpertChat({ clientId, clientName }: Props) {
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (typeof window === 'undefined') return crypto.randomUUID()
    const stored = localStorage.getItem(`expert-session-${clientId}`)
    if (stored) return stored
    const id = crypto.randomUUID()
    localStorage.setItem(`expert-session-${clientId}`, id)
    return id
  })

  const [sessions, setSessions] = useState<Session[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [noApiKey, setNoApiKey] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [fileCount, setFileCount] = useState(0)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // ── Load sessions ─────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from('expert_messages')
      .select('session_id, content, created_at, role')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })

    const map = new Map<string, Session>()
    const customTitles: Record<string, string> = {}

    for (const msg of data ?? []) {
      // Parse custom titles from meta messages
      if (msg.role === 'meta') {
        try { customTitles[msg.session_id] = JSON.parse(msg.content).title } catch { /* ignore */ }
        continue
      }
      if (!map.has(msg.session_id)) {
        map.set(msg.session_id, {
          session_id: msg.session_id,
          title: msg.role === 'user' ? msg.content : '…',
          created_at: msg.created_at,
        })
      } else {
        const s = map.get(msg.session_id)!
        if (s.title === '…' && msg.role === 'user') s.title = msg.content
        s.created_at = msg.created_at
      }
    }

    const sorted = Array.from(map.values())
      .map(s => ({ ...s, customTitle: customTitles[s.session_id] }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setSessions(sorted)
  }, [clientId])

  // ── Load messages for a session ───────────────────────────
  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true)
    const { data } = await supabase
      .from('expert_messages')
      .select('*')
      .eq('client_id', clientId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages(((data as ChatMessage[]) ?? []).filter(m => m.role !== 'meta'))
    setLoadingMessages(false)
  }, [clientId])

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [, { count }] = await Promise.all([
        loadSessions(),
        supabase.from('files').select('*', { count: 'exact', head: true }).eq('client_id', clientId),
      ])
      setFileCount(count ?? 0)
    }
    init()
  }, [clientId])

  useEffect(() => {
    loadMessages(currentSessionId)
  }, [currentSessionId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // ── Session management ────────────────────────────────────
  function switchSession(sessionId: string) {
    if (sessionId === currentSessionId || isStreaming) return
    setCurrentSessionId(sessionId)
    localStorage.setItem(`expert-session-${clientId}`, sessionId)
    setMessages([])
    setStreamingContent('')
    setInput('')
  }

  function handleNewSession() {
    if (isStreaming) return
    const id = crypto.randomUUID()
    localStorage.setItem(`expert-session-${clientId}`, id)
    setCurrentSessionId(id)
    setMessages([])
    setStreamingContent('')
    setInput('')
  }

  async function handleDeleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDeletingSessionId(sessionId)
    await supabase.from('expert_messages').delete()
      .eq('client_id', clientId)
      .eq('session_id', sessionId)
    setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    if (sessionId === currentSessionId) handleNewSession()
    setDeletingSessionId(null)
  }

  // ── Rename session ────────────────────────────────────────
  async function saveRename(sessionId: string) {
    const title = renameValue.trim()
    setRenamingId(null)
    if (!title) return

    setSessions(prev => prev.map(s =>
      s.session_id === sessionId ? { ...s, customTitle: title } : s
    ))

    const { data: existing } = await supabase
      .from('expert_messages')
      .select('id')
      .eq('client_id', clientId)
      .eq('session_id', sessionId)
      .eq('role', 'meta')
      .maybeSingle()

    if (existing) {
      await supabase.from('expert_messages')
        .update({ content: JSON.stringify({ title }) })
        .eq('id', existing.id)
    } else {
      await supabase.from('expert_messages')
        .insert({ client_id: clientId, session_id: sessionId, role: 'meta', content: JSON.stringify({ title }) })
    }
  }

  // ── Send message ──────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return

    const isFirstMessage = messages.length === 0
    const userMsg: ChatMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')
    setNoApiKey(false)

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('expert_messages').insert({
      client_id: clientId,
      session_id: currentSessionId,
      role: 'user',
      content: text,
      created_by: user?.email,
    })

    if (isFirstMessage) {
      setSessions(prev => [{
        session_id: currentSessionId,
        title: text,
        created_at: new Date().toISOString(),
      }, ...prev.filter(s => s.session_id !== currentSessionId)])
    }

    try {
      const res = await fetch('/api/expert/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientName,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (res.status === 402) {
        setNoApiKey(true)
        setIsStreaming(false)
        setStreamingContent('')
        return
      }

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

      await supabase.from('expert_messages').insert({
        client_id: clientId,
        session_id: currentSessionId,
        role: 'assistant',
        content: full,
        created_by: null,
      })
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Er is een fout opgetreden. Controleer de verbinding en probeer opnieuw.',
      }])
      setStreamingContent('')
    } finally {
      setIsStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div
      className="flex h-full min-h-0"
      style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      {/* ── Sessions sidebar ──────────────────────────────── */}
      <div
        className="flex-shrink-0 flex flex-col w-[200px] h-full min-h-0"
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* New chat */}
        <div className="flex-shrink-0 p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={handleNewSession}
            disabled={isStreaming}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors disabled:opacity-40"
          >
            <PenSquare size={12} />
            Nieuw gesprek
          </button>
        </div>

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {sessions.length === 0 ? (
            <p className="text-[11px] text-zinc-700 text-center mt-6 px-3">
              Nog geen gesprekken
            </p>
          ) : (
            sessions.map(s => {
              const isActive = s.session_id === currentSessionId
              return (
                <button
                  key={s.session_id}
                  onClick={() => switchSession(s.session_id)}
                  className="group w-full text-left px-3 py-2.5 relative transition-colors"
                  style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full" style={{ backgroundColor: '#3A913F' }} />
                  )}
                  <div className="flex items-start justify-between gap-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      {renamingId === s.session_id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => saveRename(s.session_id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveRename(s.session_id)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-full bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-[12px] text-zinc-100 focus:outline-none focus:border-zinc-400"
                        />
                      ) : (
                        <p className={`text-[12px] leading-snug truncate ${isActive ? 'text-zinc-200' : 'text-zinc-400'}`}>
                          {(() => { const t = s.customTitle ?? s.title; return t.length > 45 ? t.slice(0, 45) + '…' : t })()}
                        </p>
                      )}
                      <p className="text-[10px] text-zinc-600 mt-0.5">{formatRelative(s.created_at)}</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={e => { e.stopPropagation(); setRenamingId(s.session_id); setRenameValue(s.customTitle ?? s.title) }}
                        className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                        title="Hernoemen"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSession(s.session_id, e)}
                        disabled={deletingSessionId === s.session_id}
                        className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors"
                        title="Verwijderen"
                      >
                        {deletingSessionId === s.session_id
                          ? <Loader2 size={10} className="animate-spin" />
                          : <Trash2 size={10} />
                        }
                      </button>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Files badge */}
        <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border"
            style={fileCount > 0
              ? { color: '#3A913F', backgroundColor: '#3A913F10', borderColor: '#3A913F28' }
              : { color: '#52525b', backgroundColor: 'transparent', borderColor: '#27272a' }
            }
          >
            <FolderOpen size={10} />
            <span>
              {fileCount > 0
                ? `${fileCount} ${fileCount === 1 ? 'bestand' : 'bestanden'}`
                : 'Geen bestanden'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main chat area ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        {/* No API key banner */}
        {noApiKey && (
          <div className="flex-shrink-0 flex items-start gap-3 mx-6 mt-4 p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-400">API-sleutel niet geconfigureerd</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Voeg <code className="bg-amber-950/50 px-1 rounded font-mono">ANTHROPIC_API_KEY</code> toe aan <code className="bg-amber-950/50 px-1 rounded font-mono">.env.local</code>.
              </p>
            </div>
          </div>
        )}

        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="flex items-center gap-2 text-xs text-zinc-600 pt-12 justify-center">
              <Loader2 size={13} className="animate-spin" />
              Laden...
            </div>
          ) : messages.length === 0 && !streamingContent ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center px-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <MessageSquare size={20} className="text-zinc-700" />
              </div>
              <div>
                <p className="text-[15px] font-medium text-zinc-400">{clientName} Expert AI</p>
                <p className="text-[13px] text-zinc-600 mt-1 max-w-xs leading-relaxed">
                  Stel een vraag of vraag om een concept, caption, strategie of briefing.
                  {fileCount > 0 && ` De AI heeft ${fileCount} ${fileCount === 1 ? 'bestand' : 'bestanden'} als context.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
              {messages.map((msg, i) => (
                <div key={msg.id ?? i}>
                  {msg.role === 'user' ? (
                    /* User message — right aligned bubble */
                    <div className="flex justify-end">
                      <div
                        className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm text-[14px] leading-relaxed text-zinc-200"
                        style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* Assistant message — full width, no bubble */
                    <div className="flex gap-3 items-start">
                      {/* AI indicator dot */}
                      <div
                        className="flex-shrink-0 mt-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#3A913F18', border: '1px solid #3A913F40' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3A913F' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <AssistantMessage content={msg.content} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming response */}
              {streamingContent && (
                <div className="flex gap-3 items-start">
                  <div
                    className="flex-shrink-0 mt-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#3A913F18', border: '1px solid #3A913F40' }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#3A913F' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <AssistantMessage content={streamingContent} />
                  </div>
                </div>
              )}

              {/* Thinking indicator */}
              {isStreaming && !streamingContent && (
                <div className="flex gap-3 items-start">
                  <div
                    className="flex-shrink-0 mt-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#3A913F18', border: '1px solid #3A913F40' }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#3A913F' }} />
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 px-6 pb-6 pt-3">
          <div className="max-w-3xl mx-auto">
            <div
              className="flex items-end gap-3 px-4 py-3 rounded-2xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Vraag iets aan ${clientName} Expert AI...`}
                rows={1}
                disabled={isStreaming}
                className="flex-1 bg-transparent text-[14px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 leading-relaxed"
                style={{
                  minHeight: '24px',
                  maxHeight: '160px',
                  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
                }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-30 transition-all"
                style={{ backgroundColor: '#3A913F' }}
              >
                {isStreaming
                  ? <Loader2 size={13} className="animate-spin text-white" />
                  : <Send size={13} className="text-white" />
                }
              </button>
            </div>
            <p className="text-[11px] text-zinc-700 mt-2 text-center">
              Enter om te versturen · Shift+Enter voor nieuwe regel
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
