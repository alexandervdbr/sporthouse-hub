'use client'

import { useState, useEffect } from 'react'
import { BookOpen } from 'lucide-react'
import KennisbankWizard from '@/components/clients/KennisbankWizard'
import { QUESTION_COUNT } from '@/lib/kennisbank-questions'

// Zit naast de favorietenster in de klantkop, dus op elke tool-pagina van die
// klant bereikbaar. De teller laat meteen zien of er nog werk aan is.
export default function KennisbankButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false)
  const [answered, setAnswered] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/kennisbank?clientId=${clientId}`)
      .then(r => r.json())
      .then(d => setAnswered(Object.values(d.answers ?? {}).filter(a => String(a).trim()).length))
      .catch(() => setAnswered(null))
  }, [clientId])

  const complete = answered !== null && answered >= QUESTION_COUNT

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Kennisbank van deze klant"
        className={`flex items-center gap-2 h-9 px-2.5 sm:px-3 flex-shrink-0 rounded-lg border text-xs transition-colors ${
          complete
            ? 'border-[#3A913F]/40 bg-[#3A913F]/10 text-[#5ab660] hover:bg-[#3A913F]/15'
            : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/60'
        }`}
      >
        <BookOpen size={15} />
        <span className="hidden sm:inline">Kennisbank</span>
        {answered !== null && (
          <span className="font-medium tabular-nums">{answered}/{QUESTION_COUNT}</span>
        )}
      </button>

      {open && (
        <KennisbankWizard
          clientId={clientId}
          clientName={clientName}
          onClose={() => setOpen(false)}
          onSaved={setAnswered}
        />
      )}
    </>
  )
}
