'use client'

import { useState, useRef } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { isAllowedTextDocExt, ALLOWED_TEXT_DOC_HINT } from '@/lib/upload-policy'

interface Props {
  clientId: string
}

export default function DocumentUpload({ clientId }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(file: File) {
    if (!file) return

    if (!isAllowedTextDocExt(file.name)) {
      setError(`Dit bestandstype wordt niet ondersteund. Toegestaan: ${ALLOWED_TEXT_DOC_HINT}.`)
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Bestand mag niet groter zijn dan 10 MB.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('clientId', clientId)

    const response = await fetch('/api/documents', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Fout bij uploaden.')
    } else {
      setSuccess(`"${result.title}" succesvol geüpload.`)
      router.refresh()
    }

    setLoading(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${isDragging
            ? 'border-zinc-500 bg-zinc-800/50'
            : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50'
          }
        `}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.csv,.rtf"
          onChange={handleChange}
          className="hidden"
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="text-zinc-400 animate-spin" />
            <p className="text-sm text-zinc-400">Document verwerken...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Upload size={18} className="text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Sleep een bestand of klik om te uploaden</p>
              <p className="text-xs text-zinc-500 mt-1">{ALLOWED_TEXT_DOC_HINT} — max 10 MB</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 px-4 py-3 bg-red-950/50 border border-red-900/50 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-3 px-4 py-3 bg-emerald-950/50 border border-emerald-900/50 rounded-lg">
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}
    </div>
  )
}
