'use client'

import { usePreview } from '@/lib/preview-context'
import { Eye, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function PreviewBanner() {
  const { preview, setPreview } = usePreview()
  const router = useRouter()

  if (!preview) return null

  function exitPreview() {
    setPreview(null)
    router.refresh()
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 text-xs font-medium"
      style={{
        backgroundColor: '#451a03',
        borderBottom: '1px solid #92400e60',
        color: '#fbbf24',
      }}
    >
      <Eye size={13} className="flex-shrink-0" />
      <span className="flex-1 truncate">
        Je bekijkt het platform als <span className="font-bold">{preview.name || preview.email}</span>
        {' '}<span className="opacity-60">({preview.email})</span>
        {preview.isFreelancer && <span className="ml-1 opacity-70">— Freelancer</span>}
        {!preview.permissions && !preview.isFreelancer && <span className="ml-1 opacity-70">— Volledige toegang</span>}
      </span>
      <button
        onClick={exitPreview}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors hover:bg-amber-800/40 flex-shrink-0"
        title="Preview stoppen"
      >
        <X size={11} />
        Stoppen
      </button>
    </div>
  )
}
