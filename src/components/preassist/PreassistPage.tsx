'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, Download, Trash2, X, Plus, Loader2,
  ImageIcon, Film, Layers, Settings, ChevronDown, ArrowLeft, User,
} from 'lucide-react'
import JSZip from 'jszip'
import { Client } from '@/types/database'
import { DriveThumbnail, DrivePreviewModal } from '@/components/shared/DrivePreview'
import { putFileToDrive } from '@/lib/drive-upload-client'
import { rememberUpload, forgetUpload } from '@/lib/pending-uploads'
import {
  isAllowedPreassistExt, ALLOWED_PREASSIST_HINT, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL,
} from '@/lib/upload-policy'
import { MAX_ZIP_BYTES, MAX_ZIP_LABEL, saveZip, uniqueZipPath } from '@/lib/zip-download'
import { preassistRequiresClient } from '@/lib/preassist-upload'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Edition {
  id: string
  title: string
  active: boolean
  created_at: string
}

interface Submission {
  id: string
  edition_id: string
  section: 'content' | 'inspiratie'
  title: string | null
  file_url: string
  file_name: string
  file_type: string
  file_size: number | null
  submitted_by_id: string
  submitted_by_name: string
  client_id: string | null
  client_name: string | null
  created_at: string
  signedUrl?: string
  storage_provider?: 'supabase' | 'drive'
  drive_file_id?: string | null
  web_view_link?: string | null
  thumbnail_link?: string | null
}

type Section = 'content' | 'inspiratie'

const CATEGORY_LABEL: Record<string, string> = {
  klant: 'Klanten', atleet: 'Atleten', intern: 'Intern', podcast: 'Podcasts',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isVideo(type: string) { return type.startsWith('video/') }

// Namen van afgekeurde bestanden, afgekapt zodat een map van veertig foto's
// geen melding van tien regels oplevert.
function namesOf(files: File[], max = 3) {
  const names = files.slice(0, max).map(f => f.name).join(', ')
  return files.length > max ? `${names} en ${files.length - max} andere` : names
}

// ─── Submission card ──────────────────────────────────────────────────────────

function SubmissionCard({ sub, canDelete, onDelete }: {
  sub: Submission
  canDelete: boolean
  onDelete: (id: string, filePath: string, provider?: string) => void
}) {
  const video = isVideo(sub.file_type)
  const isDrive = sub.storage_provider === 'drive'
  const [previewOpen, setPreviewOpen] = useState(false)

  // Drive thumbnails are generated async by Google and may briefly be null
  // right after upload — fall back to the (legacy) signed URL, then to an icon.
  // The image itself comes from our own proxy: Google's thumbnail_link is
  // session-bound and 403s within about a day, so the stored link only ever
  // worked right after upload. The row's link still tells us whether Drive
  // managed to render one at all.
  const previewSrc = isDrive
    ? (sub.thumbnail_link ? `/api/preassist/thumbnail?id=${sub.id}&size=small` : undefined)
    : sub.signedUrl
  const openLink = isDrive ? sub.web_view_link ?? undefined : sub.signedUrl
  const downloadHref = isDrive ? `/api/preassist/download?id=${sub.id}` : sub.signedUrl

  return (
    <div className="group relative rounded-xl overflow-hidden"
      style={{ background: 'rgba(22,22,22,0.98)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="relative aspect-video bg-zinc-900 overflow-hidden">
        {previewSrc ? (
          video && !isDrive ? (
            <video src={previewSrc} className="w-full h-full object-cover" preload="metadata" muted
              onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
              onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
          ) : isDrive ? (
            <DriveThumbnail src={previewSrc} alt={sub.title ?? sub.file_name} video={video} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt={sub.title ?? sub.file_name} className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            {video ? <Film size={28} /> : <ImageIcon size={28} />}
          </div>
        )}
        {video && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-zinc-300 flex items-center gap-1">
            <Film size={10} /> Video
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {isDrive && sub.drive_file_id ? (
            <button onClick={() => setPreviewOpen(true)}
              aria-label="Voorbeeld bekijken"
              className="tap-target p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
              {video ? <Film size={15} /> : <ImageIcon size={15} />}
            </button>
          ) : openLink && (
            <a href={openLink}
              className="tap-target p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
              {video ? <Film size={15} /> : <ImageIcon size={15} />}
            </a>
          )}
          {downloadHref && (
            <a href={downloadHref} download={sub.file_name}
              className="tap-target p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Download size={15} />
            </a>
          )}
          {canDelete && (
            <button onClick={() => onDelete(sub.id, sub.file_url, sub.storage_provider)}
              aria-label="Verwijderen"
              className="tap-target p-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-white transition-colors">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-2.5">
        {sub.title && <p className="text-sm text-zinc-200 font-medium truncate mb-1.5">{sub.title}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <User size={11} className="text-zinc-500 flex-shrink-0" />
            <p className="text-xs text-zinc-300 font-medium truncate">{sub.submitted_by_name}</p>
          </div>
          {sub.file_size && <p className="text-xs text-zinc-600 flex-shrink-0">{formatSize(sub.file_size)}</p>}
        </div>
      </div>

      {previewOpen && isDrive && sub.drive_file_id && (
        <DrivePreviewModal driveFileId={sub.drive_file_id} title={sub.title ?? sub.file_name}
          webViewLink={sub.web_view_link} downloadHref={downloadHref} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

interface FileEntry {
  file: File
  clientId: string
  clientName: string
  // Waarom je dit instuurt. De kolom (title) en de weergave op het kaartje
  // bestonden al, maar de upload zette hem hard op null — bij een tab die
  // "Inspiratie" heet is dat juist het stuk dat ontbrak.
  title: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

function UploadModal({ section, editionId, onClose, onUploaded }: {
  section: Section
  editionId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const supabase = createClient()
  const [entries,   setEntries]   = useState<FileEntry[]>([])
  const [clients,   setClients]   = useState<Client[]>([])
  const [uploading, setUploading] = useState(false)
  const [done,      setDone]      = useState(false)
  const [rejected,  setRejected]  = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Inspiratie hangt niet aan een klant: wat iemand opvalt hoort niet per se
  // bij werk voor iemand. De toelichting is daar wat het verhaal vertelt.
  const needsClient = preassistRequiresClient(section)

  useEffect(() => {
    if (!needsClient) return
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients((data ?? []) as Client[]))
  }, [needsClient])

  const groupedClients = Object.entries(
    clients.reduce<Record<string, Client[]>>((acc, c) => {
      const label = CATEGORY_LABEL[c.category] ?? c.category
      ;(acc[label] ??= []).push(c)
      return acc
    }, {})
  )

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const defaultClient = needsClient ? clients[0] : undefined
    const all = Array.from(incoming)
    // Op extensie, niet op het MIME-type dat de browser erbij verzint — zelfde
    // allowlist als de server aanhoudt, zodat een bestand hier wordt
    // tegengehouden en niet pas na een upload van een halve gigabyte.
    const wrongType = all.filter(f => !isAllowedPreassistExt(f.name))
    const tooBig    = all.filter(f => isAllowedPreassistExt(f.name) && f.size > MAX_UPLOAD_BYTES)

    // Mét de namen erbij, en beide redenen tegelijk. Het was een ternary die
    // alleen de grootte meldde, dus wie één te grote video en één pdf sleepte
    // hoorde niets over die pdf — en in geen van beide gevallen welk bestand.
    const reasons = [
      tooBig.length    ? `groter dan ${MAX_UPLOAD_LABEL}: ${namesOf(tooBig)}` : null,
      wrongType.length ? `verkeerd type: ${namesOf(wrongType)}` : null,
    ].filter(Boolean)

    setRejected(
      reasons.length
        ? `Overgeslagen — ${reasons.join('; ')}. Toegestaan: ${ALLOWED_PREASSIST_HINT}.`
        : null
    )

    const newEntries: FileEntry[] = all
      .filter(f => isAllowedPreassistExt(f.name) && f.size <= MAX_UPLOAD_BYTES)
      .map(file => ({
        file,
        clientId:   defaultClient?.id   ?? '',
        clientName: defaultClient?.name ?? '',
        title: '',
        status: 'pending' as const,
        progress: 0,
      }))
    setEntries(prev => [...prev, ...newEntries])
  }

  function updateEntry(index: number, clientId: string, clientName: string) {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, clientId, clientName } : e))
  }

  function updateTitle(index: number, title: string) {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, title } : e))
  }

  function removeEntry(index: number) {
    setEntries(prev => prev.filter((_, i) => i !== index))
  }

  async function handleUpload(retryOnly = false) {
    if (!entries.length || (needsClient && entries.some(e => !e.clientId))) return
    setUploading(true)
    setDone(false)
    // Bij opnieuw proberen alleen de mislukte bestanden. De File-objecten
    // zitten nog in entries, dus niemand hoeft ze opnieuw aan te wijzen.
    const todo = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => retryOnly ? e.status === 'error' : e.status !== 'done')

    // Drie tegelijk in plaats van allemaal. Het waren Promise.all-uploads van
    // het hele bestand; nu gaat elk bestand in blokken naar Google en helpt
    // vijftien tegelijk niemand.
    const CONCURRENCY = 3
    let cursor = 0
    let errorCount = 0
    const queue = todo

    async function worker() {
      while (cursor < queue.length) {
        const { e: entry, i } = queue[cursor++]
        setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'uploading', progress: 0, error: undefined } : e))
        try {
          // 1. Een Drive-sessie openen. Klein en snel: hier gaat geen byte
          // van het bestand door.
          const sessionRes = await fetch('/api/preassist/upload-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              editionId,
              section,
              clientId: entry.clientId || null,
              filename: entry.file.name,
              mimeType: entry.file.type || 'application/octet-stream',
              fileSize: entry.file.size,
            }),
          })
          if (!sessionRes.ok) {
            const { error } = await sessionRes.json().catch(() => ({ error: `Upload mislukt (${sessionRes.status}).` }))
            throw new Error(error ?? 'Upload mislukt.')
          }
          const { uploadUrl } = await sessionRes.json()

          // Onthouden vóór de eerste byte vertrekt, zodat een tabblad dat
          // halverwege sluit iets achterlaat om op terug te komen: Drive houdt
          // de sessie ongeveer een week vast en weet hoeveel er al binnen is.
          rememberUpload({
            uploadUrl,
            filename: entry.file.name,
            fileSize: entry.file.size,
            folderId: null,
            scope: 'preassist',
            startedAt: Date.now(),
          })

          // 2. De bytes rechtstreeks naar Drive. Ze raken onze server niet
          // aan — dat is wat een video van 500 MB weer mogelijk maakt, en
          // tegelijk van de transferrekening haalt.
          await putFileToDrive(entry.file, uploadUrl, (pct) => {
            setEntries(prev => prev.map((e, j) => j === i ? { ...e, progress: pct } : e))
          })

          // 3. De sessie aan onze server geven, die bij Drive navraagt wat
          // het geworden is en de rij wegschrijft. Het id moet daarvandaan
          // komen: het antwoord op het laatste blok is hier onleesbaar.
          const finalizeRes = await fetch('/api/preassist/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              editionId,
              section,
              clientId: entry.clientId || null,
              uploadUrl,
              fileName: entry.file.name,
              fileSize: entry.file.size,
              title: entry.title.trim() || null,
            }),
          })
          if (!finalizeRes.ok) {
            const { error } = await finalizeRes.json().catch(() => ({ error: `Opslaan mislukt (${finalizeRes.status}).` }))
            throw new Error(error ?? 'Opslaan mislukt.')
          }

          forgetUpload(uploadUrl)
          setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'done', progress: 100 } : e))
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err)
          // "Failed to fetch" is wat een browser zegt als een verzoek de
          // machine niet eens uit kwam. Correct en nutteloos; noem de oorzaak.
          const msg = raw === 'Failed to fetch' || raw === 'NETWORK_ERROR'
            ? 'Geen verbinding — upload afgebroken.'
            : raw
          setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'error', error: msg } : e))
          errorCount++
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

    setUploading(false)
    setDone(true)

    // Alleen wegklappen als er niets mislukt is. Hij sloot altijd na 800 ms,
    // dus wie drie bestanden zag falen kreeg "3 mislukt" een halve seconde te
    // zien en daarna een leeg scherm — niet te onderscheiden van een upload
    // die gewoon gelukt was.
    onUploaded()
    if (errorCount === 0) setTimeout(onClose, 800)
  }

  const allAssigned  = entries.length > 0 && (!needsClient || entries.every(e => e.clientId))
  const doneCount    = entries.filter(e => e.status === 'done').length
  const errorCount   = entries.filter(e => e.status === 'error').length
  // Gemiddelde van de echte voortgang per bestand in plaats van het aantal
  // afgeronde bestanden: bij één groot bestand sprong die balk van 0 naar 100.
  const totalProgress = entries.length
    ? Math.round(entries.reduce((sum, e) => sum + (e.status === 'done' ? 100 : e.progress), 0) / entries.length)
    : 0

  const selectStyle = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#d4d4d8',
    fontSize: 12,
    borderRadius: 8,
    padding: '4px 8px',
    outline: 'none',
    width: '100%',
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-base font-semibold text-white">
            Toevoegen aan {section === 'content' ? 'Content' : 'Inspiratie'}
          </h2>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Drop zone */}
          <div onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
            className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl cursor-pointer mb-5"
            style={{ border: '2px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
            <Upload size={18} className="text-zinc-500" />
            <p className="text-sm text-zinc-400">Klik of sleep bestanden hier</p>
            <p className="text-xs text-zinc-600">Afbeeldingen &amp; video&apos;s — meerdere tegelijk mogelijk</p>
            <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          </div>

          {rejected && <p className="text-xs text-amber-400 mb-3">{rejected}</p>}

          {/* File rows */}
          {entries.length > 0 && (
            <div className="space-y-2 mb-5 max-h-64 overflow-y-auto pr-1">
              {entries.map((entry, i) => (
                <div key={i} className="rounded-lg overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-3 px-3 py-2">

                    {/* Icon */}
                    {isVideo(entry.file.type)
                      ? <Film size={12} className="text-zinc-500 flex-shrink-0" />
                      : <ImageIcon size={12} className="text-zinc-500 flex-shrink-0" />}

                    {/* File name */}
                    <span className="text-xs text-zinc-300 truncate flex-1 min-w-0">{entry.file.name}</span>

                    {/* Size */}
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 hidden sm:block">
                      {formatSize(entry.file.size)}
                    </span>

                    {/* Client selector — alleen bij Content */}
                    {needsClient && (
                      <div className="flex-shrink-0 w-40">
                        <select
                          value={entry.clientId}
                          disabled={uploading}
                          onChange={e => {
                            const opt = clients.find(c => c.id === e.target.value)
                            if (opt) updateEntry(i, opt.id, opt.name)
                          }}
                          style={selectStyle}
                        >
                          <option value="">— Klant —</option>
                          {groupedClients.map(([cat, items]) => (
                            <optgroup key={cat} label={cat}>
                              {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Status / remove — het resultaat blijft staan nadat het
                        uploaden klaar is, anders verdwijnt het ✗ van een
                        mislukt bestand precies op het moment dat je het nodig
                        hebt. */}
                    {uploading || entry.status === 'done' || entry.status === 'error' ? (
                      <span className="flex-shrink-0 w-4 text-center" style={{
                        color: entry.status === 'done'  ? '#4ade80' :
                               entry.status === 'error' ? '#f87171' : '#a1a1aa',
                        fontSize: 13,
                      }}>
                        {entry.status === 'done'  ? '✓' :
                         entry.status === 'error' ? '✗' :
                         <Loader2 size={12} className="animate-spin inline" />}
                      </span>
                    ) : (
                      <button onClick={() => removeEntry(i)}
                        aria-label="Verwijder uit lijst"
                        className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Echte bytes, niet "bestand 2 van 5". Bij één video van
                      600 MB is dat het verschil tussen iets zien gebeuren en
                      een balk die minuten op 0% staat. */}
                  {!uploading && entry.status !== 'done' && (
                    <input type="text" value={entry.title} maxLength={200}
                      onChange={e => updateTitle(i, e.target.value)}
                      placeholder="Toelichting (optioneel) — waarom stuur je dit in?"
                      className="w-full px-3 pb-2 bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none" />
                  )}

                  {entry.status === 'uploading' && (
                    <div className="h-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full transition-all duration-200"
                        style={{ width: `${entry.progress}%`, backgroundColor: '#3A913F' }} />
                    </div>
                  )}

                  {/* De reden waarom dit bestand niet aankwam. Werd wel
                      opgeslagen maar nergens getoond, dus zag je alleen
                      "1 bestand mislukt" zonder te weten waarom. */}
                  {entry.status === 'error' && entry.error && (
                    <p className="px-3 pb-2 text-[10px] text-red-400 break-words">{entry.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error summary */}
          {errorCount > 0 && (
            <p className="text-xs text-red-400 mb-3">{errorCount} bestand{errorCount !== 1 ? 'en' : ''} mislukt</p>
          )}

          {/* Progress bar when uploading */}
          {(uploading || done) && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-zinc-500">
                  {uploading ? `${doneCount} / ${entries.length} geüpload…`
                    : errorCount > 0 ? `${doneCount} van de ${entries.length} geüpload`
                    : 'Klaar'}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${totalProgress}%`, backgroundColor: '#3A913F' }} />
              </div>
            </div>
          )}

        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs text-zinc-600">
            {entries.length > 0
              ? `${entries.length} bestand${entries.length !== 1 ? 'en' : ''} geselecteerd`
              : 'Nog geen bestanden'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              {done && errorCount > 0 ? 'Sluiten' : 'Annuleren'}
            </button>
            {/* Na een mislukking opnieuw proberen met alleen de bestanden die
                het niet haalden — de File-objecten staan er nog, dus niemand
                hoeft ze opnieuw te gaan zoeken. */}
            {done && errorCount > 0 ? (
              <button onClick={() => handleUpload(true)} disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40 transition-all"
                style={{ background: '#3A913F' }}>
                <Upload size={13} />
                {errorCount} bestand{errorCount !== 1 ? 'en' : ''} opnieuw proberen
              </button>
            ) : (
              <button onClick={() => handleUpload()} disabled={uploading || !allAssigned}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40 transition-all"
                style={{ background: '#3A913F' }}>
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading
                  ? `${doneCount}/${entries.length} klaar`
                  : `${entries.length || 0} bestand${entries.length !== 1 ? 'en' : ''} uploaden`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edition Modal ────────────────────────────────────────────────────────────

function EditionModal({ editions, onClose, onRefresh }: {
  editions: Edition[]
  onClose: () => void
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [newTitle,   setNewTitle]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [busy,       setBusy]       = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [counts,     setCounts]     = useState<Record<string, number> | null>(null)

  // Hoeveel inzendingen er aan elke editie hangen, zodat de bevestiging kan
  // zeggen wat er meegaat. De pagina zelf kent alleen de actieve editie.
  useEffect(() => {
    fetch('/api/preassist/editions')
      .then(r => r.ok ? r.json() : null)
      .then(data => setCounts(data))
      .catch(() => { /* zonder aantallen blijft verwijderen mogelijk, alleen minder expliciet */ })
  }, [])

  async function createEdition() {
    if (!newTitle.trim()) return
    setSaving(true); setError(null)
    const { error } = await supabase.from('preassist_editions').insert({ title: newTitle.trim(), active: false })
    setSaving(false)
    if (error) { setError(`Aanmaken mislukt: ${error.message}`); return }
    setNewTitle(''); onRefresh()
  }

  async function setActive(id: string) {
    setBusy(id); setError(null)
    // Eén statement in plaats van twee losse updates — zie migratie 0057.
    // Het waren er twee zonder foutcontrole, met een moment tussenin waarop
    // er geen enkele actieve editie was.
    const { error } = await supabase.rpc('preassist_set_active_edition', { target: id })
    setBusy(null)
    if (error) { setError(`Activeren mislukt: ${error.message}`); return }
    onRefresh()
  }

  async function deleteEdition(id: string) {
    setBusy(id); setError(null)
    // Via de server, want de bestanden moeten eerst in Drive's prullenbak en
    // daar heeft de browser geen credentials voor.
    try {
      const res = await fetch(`/api/preassist/editions?id=${id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Verwijderen mislukt (${res.status}).`)
      if (body?.warning) setError(body.warning)
      setConfirmDel(null)
      onRefresh()
    } catch (err) {
      // Dit faalde eerder altijd stil: de foreign key hield het tegen, de
      // error werd niet bekeken en onRefresh() zette de editie gewoon terug.
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt.')
    }
    setBusy(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Edities beheren</h2>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="space-y-2 mb-5 max-h-52 overflow-y-auto">
          {editions.map(e => (
            <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', border: e.active ? '1px solid rgba(58,145,63,0.4)' : '1px solid transparent' }}>
              <div className="min-w-0 flex-1">
                <span className="block text-sm text-zinc-200 truncate">{e.title}</span>
                {confirmDel === e.id && (
                  <span className="block text-[10px] text-red-400">
                    {counts?.[e.id]
                      ? `${counts[e.id]} inzending${counts[e.id] !== 1 ? 'en' : ''} gaan mee naar de prullenbak`
                      : 'Deze editie verwijderen?'}
                  </span>
                )}
              </div>
              {e.active ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ color: '#3A913F', background: 'rgba(58,145,63,0.15)' }}>Actief</span>
              ) : (
                <button onClick={() => setActive(e.id)} disabled={busy === e.id}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-50 transition-colors flex-shrink-0">Activeren</button>
              )}
              {confirmDel === e.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => deleteEdition(e.id)} disabled={busy === e.id}
                    className="text-[10px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">
                    {busy === e.id ? 'Bezig…' : 'Zeker?'}
                  </button>
                  <button onClick={() => setConfirmDel(null)} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">Nee</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(e.id)}
                  aria-label="Verwijderen"
                  className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        {error && (
          <p className="mb-3 text-xs text-red-400">{error}</p>
        )}
        <div className="flex gap-2">
          <input type="text" placeholder="bv. Q1 2026" value={newTitle}
            onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createEdition()}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <button onClick={createEdition} disabled={saving || !newTitle.trim()}
            className="px-3 py-2 rounded-lg text-white text-sm disabled:opacity-40 transition-all"
            style={{ background: '#3A913F' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Client group ─────────────────────────────────────────────────────────────

function ClientGroup({ clientName, submissions, currentUserId, isAdmin, canDeleteAll, onDelete }: {
  clientName: string
  submissions: Submission[]
  currentUserId: string
  isAdmin: boolean
  canDeleteAll: boolean
  onDelete: (id: string, filePath: string, provider?: string) => void
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: '#3A913F' }} />
        <h3 className="text-sm font-semibold text-zinc-200">{clientName}</h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full text-zinc-500"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {submissions.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {submissions.map(sub => (
          <SubmissionCard key={sub.id} sub={sub}
            canDelete={isAdmin || canDeleteAll || sub.submitted_by_id === currentUserId}
            onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PreassistPage({ currentUserId, isAdmin, canManageEditions, canAdd, canDeleteAll }: {
  currentUserId: string
  isAdmin: boolean
  canManageEditions: boolean
  canAdd: boolean
  canDeleteAll: boolean
}) {
  const router = useRouter()
  const supabase = createClient()

  const [editions,      setEditions]      = useState<Edition[]>([])
  const [activeEdition, setActiveEdition] = useState<Edition | null>(null)
  // Wat je bekijkt, los van welke editie actief is. Voorheen was dat
  // hetzelfde, en verdween een afgeronde editie dus volledig uit de app op
  // het moment dat de volgende werd geactiveerd — inhoud incluis, want ook
  // downloaden kon alleen van de actieve.
  const [viewedEdition, setViewedEdition] = useState<Edition | null>(null)
  const [submissions,   setSubmissions]   = useState<Submission[]>([])
  const [section,       setSection]       = useState<Section>('content')
  const [loading,       setLoading]       = useState(true)
  const [downloading,   setDownloading]   = useState(false)
  const [showEditions,  setShowEditions]  = useState(false)
  const [showUpload,    setShowUpload]    = useState(false)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [deleteError,   setDeleteError]   = useState<string | null>(null)
  const [zipError,      setZipError]      = useState<string | null>(null)

  const submitters = Array.from(
    new Map(submissions.map(s => [s.submitted_by_id, s.submitted_by_name])).entries()
  ).map(([id, name]) => ({ id, name }))

  const loadEditions = useCallback(async (keepViewedId?: string) => {
    const { data } = await supabase.from('preassist_editions').select('*').order('created_at', { ascending: false })
    const all = (data ?? []) as Edition[]
    setEditions(all)
    const active = all.find(e => e.active) ?? null
    setActiveEdition(active)
    // Blijf staan waar je stond zolang die editie nog bestaat; anders de
    // actieve, en als er geen actieve is de nieuwste.
    const viewed = (keepViewedId ? all.find(e => e.id === keepViewedId) : null) ?? active ?? all[0] ?? null
    setViewedEdition(viewed)
    return viewed
  }, [])

  const loadSubmissions = useCallback(async (edition: Edition) => {
    setLoading(true)
    const { data } = await supabase
      .from('preassist_submissions').select('*')
      .eq('edition_id', edition.id).order('client_name').order('created_at', { ascending: false })

    const subs = (data ?? []) as Submission[]
    const withUrls = await Promise.all(subs.map(async s => {
      if (s.storage_provider === 'drive') return s // thumbnail_link/web_view_link already on the row
      const { data: signed } = await supabase.storage.from('preassist').createSignedUrl(s.file_url, 3600)
      return { ...s, signedUrl: signed?.signedUrl }
    }))
    setSubmissions(withUrls)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadEditions().then(viewed => { if (viewed) loadSubmissions(viewed); else setLoading(false) })
  }, [loadEditions, loadSubmissions])

  function selectEdition(id: string) {
    const next = editions.find(e => e.id === id)
    if (!next) return
    setViewedEdition(next)
    setSubmissions([])
    loadSubmissions(next)
  }

  async function handleDelete(id: string, filePath: string, provider?: string) {
    const removed = submissions.find(s => s.id === id)
    setDeleteError(null)

    // Direct uit de lijst; het wegzetten in Drive is waar het wachten zat.
    setSubmissions(prev => prev.filter(s => s.id !== id))

    try {
      if (provider === 'drive') {
        const res = await fetch(`/api/preassist/upload?id=${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? `Verwijderen mislukt (${res.status}).`)
        }
      } else {
        // Oude inzendingen van vóór Drive, nog in Supabase Storage.
        const { error: storageError } = await supabase.storage.from('preassist').remove([filePath])
        if (storageError) throw new Error(storageError.message)
        const { error } = await supabase.from('preassist_submissions').delete().eq('id', id)
        if (error) throw new Error(error.message)
      }
    } catch (err) {
      // Zette de kaart weg en keek nooit of het gelukt was: bij een 403 of
      // een 500 verdween hij uit de lijst en stond hij na een refresh weer
      // terug, zonder dat iemand iets gezien had.
      if (removed) setSubmissions(prev => prev.some(s => s.id === id) ? prev : [...prev, removed])
      setDeleteError(err instanceof Error ? err.message : 'Verwijderen mislukt.')
    }
  }

  async function downloadZip(userId?: string) {
    if (!viewedEdition) return
    setDownloading(true)
    setZipError(null)

    try {
      // Eerst wegen, en wel op de kolom die we al hebben — dit kost geen
      // enkel verzoek. Zonder dit begon de download gewoon, en liep een
      // editie met een paar video's de tab uit het geheugen.
      const weighed = submissions.filter(s => !userId || s.submitted_by_id === userId)
      const totalBytes = weighed.reduce((sum, s) => sum + (s.file_size ?? 0), 0)

      if (totalBytes > MAX_ZIP_BYTES) {
        setZipError(
          `Deze download is ${formatSize(totalBytes)} en wordt hier in het geheugen ingepakt, wat boven ${MAX_ZIP_LABEL} vastloopt. ` +
          (userId
            ? 'Download losse bestanden via de kaartjes.'
            : 'Download per persoon via hetzelfde menu, of losse bestanden via de kaartjes.')
        )
        setDownloading(false)
        return
      }

      const params = new URLSearchParams({ edition_id: viewedEdition.id, section: 'all' })
      if (userId) params.set('user_id', userId)

      const res = await fetch(`/api/preassist/signed-urls?${params}`)
      if (!res.ok) throw new Error('Kon de bestandslijst niet ophalen.')
      const files = await res.json() as { signedUrl: string | null; fileName: string; section: string; person: string; clientName: string | null }[]

      const zip = new JSZip()
      // JSZip overschrijft een pad dat al bestaat, en deze paden worden hier
      // samengesteld — dezelfde persoon met twee keer dezelfde bestandsnaam
      // onder dezelfde klant leverde één bestand in plaats van twee.
      const taken = new Set<string>()

      await Promise.all(
        files.filter(f => f.signedUrl).map(async f => {
          const blob        = await fetch(f.signedUrl!).then(r => r.blob())
          const sectionName = f.section === 'content' ? 'Content' : 'Inspiratie'
          const clientDir   = f.clientName ?? 'Algemeen'
          const path = uniqueZipPath(taken, `${sectionName}/${clientDir}/${f.person} — ${f.fileName}`)
          zip.file(path, blob)
        })
      )

      await saveZip(zip, `${viewedEdition.title}${userId ? ` — ${files[0]?.person ?? ''}` : ''}.zip`)
    } catch {
      // Stond er niet, en de knop bleef daardoor na één mislukte fetch
      // permanent uitgeschakeld tot iemand de pagina verversde.
      setZipError('Kon de download niet voltooien.')
    }
    setDownloading(false)
  }

  // Group filtered submissions by client
  const filtered = submissions.filter(s => s.section === section)
  const grouped  = filtered.reduce<Record<string, Submission[]>>((acc, s) => {
    const key = s.client_name ?? 'Algemeen'
    ;(acc[key] ??= []).push(s)
    return acc
  }, {})

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">

      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 mb-6 text-sm text-zinc-500 hover:text-zinc-200 transition-colors">
        <ArrowLeft size={14} /> Terug
      </button>

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <Layers size={18} className="text-zinc-400 flex-shrink-0" />
            <h1 className="text-2xl font-bold tracking-tight text-white" style={{ fontFamily: 'var(--font-kurdis)' }}>
              Pré-assist
            </h1>
            {/* Eén editie: een badge zoals voorheen. Meer: een kiezer, zodat
                een afgeronde editie terug te vinden is in plaats van alleen
                nog in Drive te staan. */}
            {editions.length > 1 ? (
              <select value={viewedEdition?.id ?? ''} onChange={e => selectEdition(e.target.value)}
                aria-label="Editie kiezen"
                className="text-sm font-medium px-2.5 py-1 rounded-full flex-shrink-0 focus:outline-none cursor-pointer"
                style={{ background: 'rgba(58,145,63,0.15)', color: '#3A913F', border: '1px solid rgba(58,145,63,0.3)' }}>
                {editions.map(e => (
                  <option key={e.id} value={e.id} style={{ background: '#1e1e1e', color: '#d4d4d8' }}>
                    {e.title}{e.active ? ' — actief' : ''}
                  </option>
                ))}
              </select>
            ) : viewedEdition && (
              <span className="text-sm font-medium px-2.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(58,145,63,0.15)', color: '#3A913F', border: '1px solid rgba(58,145,63,0.3)' }}>
                {viewedEdition.title}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500">
            {viewedEdition && activeEdition && viewedEdition.id !== activeEdition.id
              ? 'Een afgeronde editie — bekijken en downloaden kan, toevoegen gebeurt in de actieve editie'
              : 'Dien content en inspiratie in voor de volgende sessie'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {canManageEditions && (
            <button onClick={() => setShowEditions(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <Settings size={14} /> Edities
            </button>
          )}

          {viewedEdition && submissions.length > 0 && (
            <div className="relative group">
              <button disabled={downloading}
                onClick={() => setDownloadMenuOpen(v => !v)}
                aria-haspopup="true" aria-expanded={downloadMenuOpen}
                className="tap-target flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-zinc-300 hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Downloaden <ChevronDown size={12} />
              </button>
              <div className={`absolute right-0 top-full mt-1 w-52 rounded-xl overflow-hidden shadow-2xl transition-all z-20 group-hover:opacity-100 group-hover:visible ${
                downloadMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
              }`}
                style={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)' }}>
                <button onClick={() => { downloadZip(); setDownloadMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors text-left">
                  <Download size={13} /> Alles downloaden
                </button>
                {submitters.length > 0 && (
                  <>
                    <div className="mx-3 my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
                    <p className="px-4 py-1.5 text-[10px] text-zinc-600 uppercase tracking-widest">Per persoon</p>
                    {submitters.map(s => (
                      <button key={s.id} onClick={() => { downloadZip(s.id); setDownloadMenuOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-colors text-left">
                        <Download size={12} /> {s.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Alleen in de actieve editie: in een afgeronde sessie iets
              bijzetten is nooit de bedoeling, en met een kiezer erbij is dat
              anders één verkeerde keuze. */}
          {viewedEdition && activeEdition && viewedEdition.id === activeEdition.id && canAdd && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
              style={{ background: '#3A913F' }}>
              <Plus size={15} /> Toevoegen
            </button>
          )}
        </div>
      </div>

      {(deleteError || zipError) && (
        <div className="mb-5 flex items-start gap-2 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
          <p className="text-sm text-red-300 flex-1">{deleteError ?? zipError}</p>
          <button onClick={() => { setDeleteError(null); setZipError(null) }} aria-label="Melding sluiten"
            className="text-red-400 hover:text-red-200 transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {!viewedEdition ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Layers size={32} className="text-zinc-700 mb-4" />
          <p className="text-zinc-400 font-medium mb-1">Nog geen editie</p>
          {canManageEditions ? (
            <p className="text-sm text-zinc-600">Maak een editie aan via{' '}
              <button onClick={() => setShowEditions(true)} className="underline hover:text-zinc-400">Edities</button>.
            </p>
          ) : (
            <p className="text-sm text-zinc-600">De beheerder heeft nog geen editie aangemaakt.</p>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-7 p-1 rounded-xl w-full sm:w-fit overflow-x-auto"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['content', 'inspiratie'] as Section[]).map(s => {
              const count = submissions.filter(sub => sub.section === s).length
              return (
                <button key={s} onClick={() => setSection(s)}
                  className="px-5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                  style={section === s ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : { color: '#71717a' }}>
                  {s === 'content' ? 'Content' : 'Inspiratie'}
                  {count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: section === s ? 'rgba(58,145,63,0.3)' : 'rgba(255,255,255,0.08)', color: section === s ? '#4ade80' : '#52525b' }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-zinc-600">
              <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              {section === 'content' ? <ImageIcon size={28} className="text-zinc-700 mb-3" /> : <Layers size={28} className="text-zinc-700 mb-3" />}
              <p className="text-sm text-zinc-500 mb-1">Nog niets ingediend onder {section === 'content' ? 'Content' : 'Inspiratie'}.</p>
              {activeEdition && viewedEdition.id === activeEdition.id && canAdd && (
                <button onClick={() => setShowUpload(true)} className="mt-2 text-sm font-medium" style={{ color: '#3A913F' }}>
                  + Eerste inzending toevoegen
                </button>
              )}
            </div>
          ) : (
            Object.entries(grouped).map(([clientName, subs]) => (
              <ClientGroup key={clientName} clientName={clientName} submissions={subs}
                currentUserId={currentUserId} isAdmin={isAdmin} canDeleteAll={canDeleteAll} onDelete={handleDelete} />
            ))
          )}
        </>
      )}

      {showUpload && activeEdition && (
        <UploadModal section={section} editionId={activeEdition.id}
          onClose={() => setShowUpload(false)} onUploaded={() => loadSubmissions(activeEdition)} />
      )}

      {showEditions && (
        <EditionModal editions={editions} onClose={() => setShowEditions(false)}
          onRefresh={() => loadEditions(viewedEdition?.id).then(v => { if (v) loadSubmissions(v) })} />
      )}
    </div>
  )
}
