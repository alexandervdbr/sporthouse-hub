'use client'

import { useState, useEffect, useRef } from 'react'
import { FileText, Sheet, Presentation, Plus, ExternalLink, Trash2, Loader2, Pencil, X, Check, Eye } from 'lucide-react'

interface DriveFile {
  id: string
  client_id: string
  drive_file_id: string
  name: string
  mime_type: string
  created_by: string | null
  created_at: string
}

interface Props {
  clientId: string
  clientName: string
}

type DocType = 'document' | 'spreadsheet' | 'presentation'

const DOC_TYPES: { type: DocType; label: string; icon: React.ElementType; color: string; bg: string; editBase: string }[] = [
  { type: 'document',     label: 'Document',      icon: FileText,      color: 'text-blue-400',   bg: 'bg-blue-950/60',   editBase: 'https://docs.google.com/document/d/' },
  { type: 'spreadsheet',  label: 'Spreadsheet',   icon: Sheet,         color: 'text-emerald-400', bg: 'bg-emerald-950/60', editBase: 'https://docs.google.com/spreadsheets/d/' },
  { type: 'presentation', label: 'Presentatie',   icon: Presentation,  color: 'text-amber-400',  bg: 'bg-amber-950/60',  editBase: 'https://docs.google.com/presentation/d/' },
]

function getMeta(mimeType: string) {
  if (mimeType.includes('spreadsheet'))  return DOC_TYPES[1]
  if (mimeType.includes('presentation')) return DOC_TYPES[2]
  return DOC_TYPES[0]
}

export default function DriveManager({ clientId, clientName }: Props) {
  const [files,       setFiles]       = useState<DriveFile[]>([])
  const [loading,     setLoading]     = useState(true)
  const [configured,  setConfigured]  = useState(true)
  const [showNew,     setShowNew]     = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newType,     setNewType]     = useState<DocType>('document')
  const [creating,    setCreating]    = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [renamingId,  setRenamingId]  = useState<string | null>(null)
  const [renameVal,   setRenameVal]   = useState('')
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadFiles() }, [clientId])

  async function loadFiles() {
    setLoading(true)
    const r = await fetch(`/api/drive?clientId=${clientId}`)
    if (r.status === 503) { setConfigured(false); setLoading(false); return }
    if (r.ok) setFiles(await r.json())
    setLoading(false)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true); setCreateError(null)
    const r = await fetch('/api/drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientName, type: newType, name: newName.trim() }),
    })
    if (!r.ok) { setCreateError(await r.text()); setCreating(false); return }
    const created: DriveFile = await r.json()
    setFiles(prev => [created, ...prev])
    setNewName(''); setShowNew(false); setCreating(false)
  }

  async function handleDelete(file: DriveFile) {
    if (!confirm(`"${file.name}" verwijderen?`)) return
    setDeletingId(file.id)
    await fetch(`/api/drive?id=${file.id}`, { method: 'DELETE' })
    setFiles(prev => prev.filter(f => f.id !== file.id))
    setDeletingId(null)
  }

  async function handleRename(file: DriveFile) {
    if (!renameVal.trim() || renameVal.trim() === file.name) { setRenamingId(null); return }
    const r = await fetch('/api/drive', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id, name: renameVal.trim() }),
    })
    if (r.ok) {
      const updated: DriveFile = await r.json()
      setFiles(prev => prev.map(f => f.id === updated.id ? updated : f))
    }
    setRenamingId(null)
  }

  if (!configured) return null

  return (
    <div className="px-8 pt-8 pb-2 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {/* Google G icon */}
          <svg width="16" height="16" viewBox="0 0 48 48" className="flex-shrink-0">
            <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.85l6.08-6.08C34.46 3.19 29.54 1 24 1 14.82 1 7.05 6.48 3.6 14.27l7.08 5.5C12.37 13.69 17.69 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.1 24.5c0-1.64-.15-3.22-.42-4.74H24v9h12.42c-.54 2.9-2.18 5.36-4.65 7.03l7.18 5.58C43.04 37.4 46.1 31.4 46.1 24.5z"/>
            <path fill="#FBBC05" d="M10.68 28.23A14.57 14.57 0 0 1 9.5 24c0-1.48.25-2.91.68-4.23L3.1 14.27A23.5 23.5 0 0 0 .5 24c0 3.77.88 7.34 2.6 10.46l7.58-6.23z"/>
            <path fill="#34A853" d="M24 46.5c5.54 0 10.2-1.84 13.6-4.99l-7.18-5.58c-1.85 1.26-4.22 2.01-6.42 2.01-6.31 0-11.63-4.19-13.32-9.77l-7.58 6.23C7.05 41.52 14.82 46.5 24 46.5z"/>
          </svg>
          <h2 className="text-sm font-semibold text-zinc-200">Google Documenten</h2>
          {files.length > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{files.length}</span>
          )}
        </div>
        <button
          onClick={() => { setShowNew(true); setCreateError(null); setTimeout(() => nameRef.current?.focus(), 50) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: '#1a73e8' }}
        >
          <Plus size={13} />
          Nieuw document
        </button>
      </div>

      {/* New document form */}
      {showNew && (
        <div className="mb-4 p-4 bg-zinc-900/60 border border-zinc-700 rounded-xl space-y-3">
          {/* Type selector */}
          <div className="flex gap-2">
            {DOC_TYPES.map(dt => {
              const Icon = dt.icon
              const active = newType === dt.type
              return (
                <button
                  key={dt.type}
                  onClick={() => setNewType(dt.type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    active ? `${dt.bg} ${dt.color} border-transparent` : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Icon size={13} />
                  {dt.label}
                </button>
              )
            })}
          </div>
          {/* Name input */}
          <div className="flex gap-2">
            <input
              ref={nameRef}
              type="text"
              placeholder="Naam van het document..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowNew(false); setNewName('') } }}
              className="flex-1 px-3 py-2 bg-zinc-800/60 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#1a73e8' }}
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Aanmaken
            </button>
            <button
              onClick={() => { setShowNew(false); setNewName(''); setCreateError(null) }}
              aria-label="Annuleren"
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-zinc-600" />
        </div>
      ) : files.length === 0 && !showNew ? (
        <div className="py-8 text-center border border-dashed border-zinc-800 rounded-xl mb-4">
          <p className="text-sm text-zinc-500">Nog geen Google documenten.</p>
          <p className="text-xs text-zinc-600 mt-1">Klik op &quot;Nieuw document&quot; om te beginnen.</p>
        </div>
      ) : (
        <div className="space-y-1.5 mb-4">
          {files.map(file => {
            const meta = getMeta(file.mime_type)
            const Icon = meta.icon
            const editUrl = `${meta.editBase}${file.drive_file_id}/edit`
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={15} className={meta.color} />
                </div>

                <div className="flex-1 min-w-0">
                  {renamingId === file.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(file); if (e.key === 'Escape') setRenamingId(null) }}
                        className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white outline-none"
                      />
                      <button onClick={() => handleRename(file)} aria-label="Bevestigen" className="text-emerald-400 hover:text-emerald-300 p-1"><Check size={12} /></button>
                      <button onClick={() => setRenamingId(null)} aria-label="Annuleren" className="text-zinc-500 hover:text-zinc-300 p-1"><X size={12} /></button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  )}
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {meta.label} · {new Date(file.created_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {file.created_by && ` · ${file.created_by}`}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setPreviewFile(file)}
                    title="Voorbeeld"
                    className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                  >
                    <Eye size={13} />
                  </button>
                  <a
                    href={editUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Openen in Google"
                    className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <button
                    onClick={() => { setRenamingId(file.id); setRenameVal(file.name) }}
                    title="Hernoemen"
                    className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.id}
                    title="Verwijderen"
                    className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
                  >
                    {deletingId === file.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="w-full flex flex-col rounded-2xl overflow-hidden"
            style={{
              maxWidth: '1100px',
              height: '90vh',
              background: 'rgba(18,18,18,0.98)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              {(() => { const meta = getMeta(previewFile.mime_type); const Icon = meta.icon; return <Icon size={15} className={meta.color} /> })()}
              <p className="flex-1 text-sm font-semibold text-white truncate">{previewFile.name}</p>
              <a
                href={`${getMeta(previewFile.mime_type).editBase}${previewFile.drive_file_id}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg mr-2 transition-colors"
                style={{ backgroundColor: '#1a73e8' }}
              >
                <ExternalLink size={12} />
                Bewerken in Google
              </a>
              <button
                onClick={() => setPreviewFile(null)}
                aria-label="Sluiten"
                className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={`https://drive.google.com/file/d/${previewFile.drive_file_id}/preview`}
                className="w-full h-full border-0"
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
