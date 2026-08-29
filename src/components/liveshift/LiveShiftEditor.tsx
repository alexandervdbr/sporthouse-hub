'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TEMPLATES, type TemplateConfig, type TextSlot, type LogoSlot } from '@/lib/liveshift-templates'
import { PRO_LEAGUE_CLUBS } from '@/lib/clubs'
import { Post } from '@/types/database'
import { Download, Save, Check, Loader2, ChevronLeft, Upload, X, Clock, Lock, ChevronDown } from 'lucide-react'
import EmbargoChecker from './EmbargoChecker'

// ─── Types ────────────────────────────────────────────────────────────────────

type FormData = Record<string, string | null>

interface Props {
  clientId: string
  initialPosts: Post[]
  currentUserEmail: string | null
}

// ─── Canvas utilities ─────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = img.naturalWidth * scale
  const sh = img.naturalHeight * scale
  ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh)
}

function drawLogoCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  logo: HTMLImageElement | null,
) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  if (logo) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2)
    ctx.clip()
    const s = r * 1.7
    ctx.drawImage(logo, cx - s / 2, cy - s / 2, s, s)
    ctx.restore()
  }
}

async function renderToCanvas(
  canvas: HTMLCanvasElement,
  tpl: TemplateConfig,
  formData: FormData,
) {
  if (!tpl.file) return
  const W = tpl.width
  const H = tpl.height
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  await document.fonts.ready
  ctx.clearRect(0, 0, W, H)

  // 1 — Dark fallback background
  ctx.fillStyle = '#1a0820'
  ctx.fillRect(0, 0, W, H)

  // 2 — Player photo (behind template overlay)
  const photoSlot = tpl.slots.find(s => s.type === 'photo')
  if (photoSlot && formData[photoSlot.key]) {
    try {
      const img = await loadImage(formData[photoSlot.key]!)
      drawCover(ctx, img, W, H)
    } catch {}
  }

  // 3 — Template PNG overlay
  try {
    const tplImg = await loadImage(tpl.file)
    ctx.drawImage(tplImg, 0, 0, W, H)
  } catch {
    ctx.fillStyle = 'rgba(255,100,100,0.8)'
    ctx.font = `bold ${W * 0.04}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('Template niet gevonden', W / 2, H / 2)
    return
  }

  // 4 — Text slots
  const textSlots = tpl.slots.filter((s): s is TextSlot => s.type === 'text')
  for (const slot of textSlots) {
    const value = formData[slot.key]
    if (!value?.trim()) continue

    const family = slot.fontFamily ?? "'Kurdis','Arial Black',Impact,sans-serif"
    const weight = slot.fontWeight ?? 'bold'
    let fontSize = W * slot.fontSize

    // Cover placeholder text with a background rect
    ctx.save()
    ctx.font = `${weight} ${fontSize}px ${family}`
    const metrics = ctx.measureText(value)
    const textH = fontSize * 1.2
    const maxW = slot.maxWidth ? W * slot.maxWidth : W * 0.9
    const rectW = Math.min(metrics.width + W * 0.04, maxW + W * 0.04)
    const x = slot.align === 'center' ? W * slot.x - rectW / 2
      : slot.align === 'right' ? W * slot.x - rectW
      : W * slot.x
    ctx.fillStyle = '#1a0820'
    ctx.fillRect(x, H * slot.y - textH * 0.85, rectW, textH)
    ctx.restore()

    // Auto-shrink font to fit maxWidth
    if (slot.maxWidth) {
      while (fontSize > 14) {
        ctx.font = `${weight} ${fontSize}px ${family}`
        if (ctx.measureText(value).width <= W * slot.maxWidth) break
        fontSize -= 2
      }
    }

    ctx.font = `${weight} ${fontSize}px ${family}`
    ctx.fillStyle = slot.color ?? '#ffffff'
    ctx.textAlign = slot.align ?? 'center'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = W * 0.008
    ctx.fillText(value, W * slot.x, H * slot.y)
    ctx.shadowBlur = 0
    ctx.textAlign = 'left'
  }

  // 5 — Logo slots
  const logoSlots = tpl.slots.filter((s): s is LogoSlot => s.type === 'logo')
  for (const slot of logoSlots) {
    const logoData = formData[slot.key]
    let logoImg: HTMLImageElement | null = null
    if (logoData) {
      try { logoImg = await loadImage(logoData) } catch {}
    }
    drawLogoCircle(ctx, W * slot.cx, H * slot.cy, W * slot.radius, logoImg)
  }
}

// ─── File helper ──────────────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise(res => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(file)
  })
}

// ─── Club Selector ────────────────────────────────────────────────────────────

function ClubSelector({ label, value, onChange }: {
  label: string
  value: string | null
  onChange: (logoPath: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = PRO_LEAGUE_CLUBS.find(c => c.logo === value) ?? null

  return (
    <div className="relative">
      <label className="block text-xs text-zinc-500 mb-1.5">{label}</label>

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors text-left"
      >
        {selected ? (
          <>
            <img src={selected.logo} alt={selected.name} className="w-7 h-7 object-contain rounded" />
            <span className="flex-1 text-sm text-sh-grey">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-sm text-zinc-600">Selecteer club...</span>
        )}
        <ChevronDown size={13} className="text-zinc-600 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 grid grid-cols-4 gap-2">
          <button
            onClick={() => { onChange(null); setOpen(false) }}
            className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors text-xs ${
              !value ? 'border-zinc-600 bg-zinc-800 text-zinc-300' : 'border-transparent text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <X size={12} className="text-zinc-600" />
            </div>
            <span>Geen</span>
          </button>

          {PRO_LEAGUE_CLUBS.map(club => (
            <button
              key={club.id}
              onClick={() => { onChange(club.logo); setOpen(false) }}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors text-xs ${
                value === club.logo
                  ? 'border-zinc-500 bg-zinc-800 text-sh-grey'
                  : 'border-transparent text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
              }`}
            >
              <img src={club.logo} alt={club.name} className="w-8 h-8 object-contain" />
              <span className="text-center leading-tight line-clamp-2">{club.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Photo Input ──────────────────────────────────────────────────────────────

function PhotoInput({ label, value, onChange }: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1.5">{label}</label>
      {value ? (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
          <img src={value} alt="" className="w-9 h-9 object-cover rounded bg-zinc-800" />
          <span className="text-xs text-zinc-400 flex-1 truncate">Foto geladen</span>
          <button onClick={() => onChange(null)} className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <Upload size={12} />
          {label} uploaden
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0]
          if (f) onChange(await readFileAsDataUrl(f))
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function LiveShiftEditor({ clientId, initialPosts }: Props) {
  const [selected, setSelected] = useState<TemplateConfig | null>(null)
  const [formData, setFormData] = useState<FormData>({})
  const [isExporting, setIsExporting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [rendering, setRendering] = useState(false)

  const previewRef = useRef<HTMLCanvasElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setField = useCallback((key: string, value: string | null) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }, [])

  // ── Live preview ──────────────────────────────────────────
  useEffect(() => {
    if (!selected?.file || !previewRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      if (!previewRef.current || !selected) return
      setRendering(true)
      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = selected.width
      previewCanvas.height = selected.height
      await renderToCanvas(previewCanvas, selected, formData)

      const scale = 400 / selected.width
      const prev = previewRef.current
      prev.width = Math.round(selected.width * scale)
      prev.height = Math.round(selected.height * scale)
      const pCtx = prev.getContext('2d')!
      pCtx.drawImage(previewCanvas, 0, 0, prev.width, prev.height)
      setRendering(false)
    }, 100)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [formData, selected])

  // ── Export ────────────────────────────────────────────────
  async function handleExport() {
    if (!selected?.file) return
    setIsExporting(true)
    try {
      const c = document.createElement('canvas')
      await renderToCanvas(c, selected, formData)
      await new Promise<void>(res => c.toBlob(blob => {
        if (!blob) { res(); return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const name = formData['playerName'] ?? formData['title'] ?? selected.label
        a.href = url
        a.download = `${selected.label.replace(/\s+/g, '_')}_${name.replace(/\s+/g, '_')}.png`
        a.click()
        URL.revokeObjectURL(url)
        res()
      }, 'image/png'))
    } finally {
      setIsExporting(false)
    }
  }

  // ── Save to history ───────────────────────────────────────
  async function handleSave() {
    if (!selected) return
    setIsSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      let thumbnailUrl: string | null = null
      if (previewRef.current) {
        const blob = await new Promise<Blob | null>(res => previewRef.current!.toBlob(res, 'image/jpeg', 0.8))
        if (blob) {
          const path = `${clientId}/${Date.now()}-${selected.id}.jpg`
          const { error } = await supabase.storage.from('posts').upload(path, blob, { contentType: 'image/jpeg' })
          if (!error) {
            const { data: signed } = await supabase.storage.from('posts')
              .createSignedUrl(path, 60 * 60 * 24 * 365)
            thumbnailUrl = signed?.signedUrl ?? null
          }
        }
      }

      const homeClub = PRO_LEAGUE_CLUBS.find(c => c.logo === formData['homeLogo'])
      const awayClub = PRO_LEAGUE_CLUBS.find(c => c.logo === formData['awayLogo'])

      const { data } = await supabase.from('posts').insert({
        client_id: clientId,
        template: selected.id,
        home_team: homeClub?.name ?? null,
        away_team: awayClub?.name ?? null,
        player_name: formData['playerName'] ?? null,
        match_day: formData['matchDay'] ?? null,
        thumbnail_url: thumbnailUrl,
        created_by: user?.email,
      }).select().single()

      if (data) setPosts(prev => [data as Post, ...prev])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setIsSaving(false)
    }
  }

  function selectTemplate(tpl: TemplateConfig) {
    setSelected(tpl)
    setFormData({})
    setSaved(false)
  }

  // ── Template selector ─────────────────────────────────────
  if (!selected) {
    const available = TEMPLATES.filter(t => t.file !== null)
    const locked = TEMPLATES.filter(t => t.file === null)

    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Beschikbare templates
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {available.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => selectTemplate(tpl)}
                className="group flex flex-col gap-0 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all text-left"
              >
                <div className="relative aspect-[4/5] bg-zinc-800 overflow-hidden">
                  <img
                    src={tpl.file!}
                    alt={tpl.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-xs font-semibold text-sh-grey">{tpl.label}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{tpl.description}</p>
                </div>
              </button>
            ))}

            {locked.map(tpl => (
              <div
                key={tpl.id}
                className="flex flex-col gap-0 bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden opacity-40"
              >
                <div className="aspect-[4/5] bg-zinc-900 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <span className="text-3xl">{tpl.emoji}</span>
                    <Lock size={14} className="text-zinc-600 mx-auto" />
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-xs font-semibold text-zinc-500">{tpl.label}</p>
                  <p className="text-xs text-zinc-700 mt-0.5">Binnenkort</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <EmbargoChecker clientId={clientId} />

        {posts.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
              <Clock size={11} /> Recente posts
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
              {posts.map(p => (
                <div key={p.id} className="space-y-1.5">
                  <div className="aspect-[4/5] bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    {p.thumbnail_url
                      ? <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <span className="text-xl">{TEMPLATES.find(t => t.id === p.template)?.emoji ?? '📸'}</span>
                        </div>
                    }
                  </div>
                  <p className="text-xs text-zinc-600 truncate">
                    {TEMPLATES.find(t => t.id === p.template)?.label ?? p.template}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Editor view ───────────────────────────────────────────
  const photoSlot = selected.slots.find(s => s.type === 'photo')
  const textSlots = selected.slots.filter((s): s is TextSlot => s.type === 'text')
  const logoSlots = selected.slots.filter((s): s is LogoSlot => s.type === 'logo')

  return (
    <div className="space-y-6">
      <button
        onClick={() => setSelected(null)}
        className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <ChevronLeft size={13} />
        Terug naar templates
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">

        {/* ── Form ───────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="flex items-center gap-2.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg w-fit">
            <span className="text-base">{selected.emoji}</span>
            <span className="text-sm font-medium text-sh-grey">{selected.label}</span>
          </div>

          {photoSlot && (
            <PhotoInput
              label={photoSlot.label}
              value={formData[photoSlot.key] ?? null}
              onChange={v => setField(photoSlot.key, v)}
            />
          )}

          {textSlots.map(slot => (
            <div key={slot.key}>
              <label className="block text-xs text-zinc-500 mb-1.5">{slot.label}</label>
              <input
                type="text"
                value={formData[slot.key] ?? ''}
                onChange={e => setField(slot.key, e.target.value || null)}
                placeholder={slot.placeholder}
                className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>
          ))}

          {logoSlots.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {logoSlots.map(slot => (
                <ClubSelector
                  key={slot.key}
                  label={slot.label}
                  value={formData[slot.key] ?? null}
                  onChange={v => setField(slot.key, v)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Preview + actions ───────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-8">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Preview</p>
            {rendering && <Loader2 size={12} className="animate-spin text-zinc-600" />}
          </div>

          <div
            className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900"
            style={{ aspectRatio: `${selected.width} / ${selected.height}` }}
          >
            <canvas
              ref={previewRef}
              className="w-full h-full"
              style={{ display: 'block' }}
            />
          </div>

          <EmbargoChecker clientId={clientId} />

          <button
            onClick={handleExport}
            disabled={isExporting || !selected.file}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            {isExporting
              ? <><Loader2 size={14} className="animate-spin" /> Exporteren...</>
              : <><Download size={14} /> Download PNG</>
            }
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || saved}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 disabled:opacity-50 transition-colors"
          >
            {saved
              ? <><Check size={14} style={{ color: '#3A913F' }} /> Opgeslagen</>
              : isSaving
                ? <><Loader2 size={14} className="animate-spin" /> Opslaan...</>
                : <><Save size={14} /> Opslaan in geschiedenis</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
