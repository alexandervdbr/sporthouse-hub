'use client'

import { ArrowLeft, Download, File, FileImage, FileText, FileVideo, Mail } from 'lucide-react'
import { api, type Detail } from './api'
import { fileSize, longDate, money, relativeDeadline, STATUS_TEXT } from './format'
import DeliveryUpload from './DeliveryUpload'

// Eén opdracht: titel, klant, deadline, bedrag, briefing (witregels blijven
// staan), bijlagen (tik = downloaden), de feedback van het team (nieuwste
// bovenaan) en wie je kan contacteren. De acties staan in de vaste balk
// onderaan (ActionBar), de opleverzone in de pagina zelf.

function TypeIcon({ type }: { type: string | null }) {
  const Icon = type?.startsWith('image/') ? FileImage : type?.startsWith('video/') ? FileVideo
    : type?.includes('pdf') || type?.startsWith('text/') ? FileText : File
  return <Icon size={20} className="flex-shrink-0 text-zinc-400" aria-hidden />
}

function Files({ title, files }: { title: string; files: Detail['files'] }) {
  if (!files.length) return null
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      <ul className="space-y-2">
        {files.map(f => (
          <li key={f.id}>
            <a href={api.fileUrl(f.id)} rel="noreferrer"
              className="flex min-h-[52px] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2
                hover:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A913F]/50">
              <TypeIcon type={f.type} />
              <span className="min-w-0 flex-1 truncate text-base text-zinc-200">{f.name}</span>
              <span className="text-sm text-zinc-500">{fileSize(f.size)}</span>
              <Download size={18} className="text-zinc-400" aria-label="Downloaden" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function AssignmentDetail({ a, onBack, onUploaded }: { a: Detail; onBack: () => void; onUploaded: () => void }) {
  const deadline = a.deadline ? relativeDeadline(a.deadline) : null
  const canUpload = a.status === 'geaccepteerd' || a.status === 'opgeleverd'

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack}
        className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-base text-zinc-300 hover:text-white
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A913F]/50">
        <ArrowLeft size={18} aria-hidden /> Alle opdrachten
      </button>

      <header>
        <p className="text-sm font-medium text-zinc-400">{STATUS_TEXT[a.status] ?? a.status}{a.feedback ? ' · feedback ontvangen' : ''}</p>
        <h1 className="mt-1 text-2xl font-semibold text-white break-words">{a.title}</h1>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-base sm:grid-cols-3">
          {a.client && <div><dt className="text-sm text-zinc-500">Klant</dt><dd className="text-zinc-200">{a.client}</dd></div>}
          {a.deadline && deadline && (
            <div>
              <dt className="text-sm text-zinc-500">Deadline</dt>
              <dd className={deadline.late && (a.status === 'gedeeld' || a.status === 'geaccepteerd') ? 'font-medium text-red-400' : 'text-zinc-200'}>
                {longDate(a.deadline)}{(a.status === 'gedeeld' || a.status === 'geaccepteerd') && <span className="text-zinc-500"> ({deadline.text})</span>}
              </dd>
            </div>
          )}
          {a.agreedAmount != null && <div><dt className="text-sm text-zinc-500">Bedrag</dt><dd className="text-zinc-200">{money(a.agreedAmount)}</dd></div>}
        </dl>
      </header>

      {a.messages.length > 0 && (
        <section aria-label="Berichten" className="space-y-2">
          {a.messages.map((m, i) => (
            <div key={i} className={`rounded-xl px-4 py-3 ${m.kind === 'feedback' ? 'border border-amber-500/30 bg-amber-500/10' : 'border border-zinc-800 bg-zinc-900/60'}`}>
              <p className="text-sm font-medium text-zinc-400">
                {m.kind === 'feedback' ? 'Feedback van ons team' : m.kind === 'weigering' ? 'Jouw reden' : 'Bericht'} · {longDate(m.at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-base text-zinc-100">{m.message}</p>
            </div>
          ))}
        </section>
      )}

      {a.briefing && (
        <section aria-label="Briefing">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">Briefing</h2>
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-zinc-200">{a.briefing}</p>
        </section>
      )}

      <Files title="Bijlagen" files={a.files.filter(f => !f.fromYou)} />
      <Files title="Jouw bestanden" files={a.files.filter(f => f.fromYou)} />
      {canUpload && <DeliveryUpload assignmentId={a.id} onUploaded={onUploaded} />}

      {(a.contact.name || a.contact.email) && (
        <section aria-label="Contact" className="rounded-2xl border border-zinc-800 px-4 py-3 text-base text-zinc-300">
          Vragen? {a.contact.name && <span className="text-white">{a.contact.name}</span>}
          {a.contact.email && (
            <a href={`mailto:${a.contact.email}`} className="mt-1 flex min-h-[44px] min-w-0 items-center gap-2 text-[#5fbf64] underline-offset-2 hover:underline">
              <Mail size={16} className="flex-shrink-0" aria-hidden />
              <span className="min-w-0 break-all">{a.contact.email}</span>
            </a>
          )}
        </section>
      )}
    </div>
  )
}
