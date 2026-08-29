'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2, X,
  AlertCircle, Package, Euro, Calendar, Clock
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Rental {
  id: string
  item_name: string
  supplier: string | null
  start_date: string
  end_date: string
  total_cost: number | null
  project: string | null
  note: string | null
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
]

function rentalDays(r: Rental): number {
  const ms = new Date(r.end_date).getTime() - new Date(r.start_date).getTime()
  return Math.round(ms / 86400000) + 1
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-BE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatEur(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n)
}

// ─── Add Rental Modal ─────────────────────────────────────────────────────────

function AddRentalModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (r: Rental) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [itemName,   setItemName]   = useState('')
  const [supplier,   setSupplier]   = useState('')
  const [startDate,  setStartDate]  = useState(today)
  const [endDate,    setEndDate]    = useState(today)
  const [totalCost,  setTotalCost]  = useState('')
  const [project,    setProject]    = useState('')
  const [note,       setNote]       = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
    return Math.max(0, Math.round(ms / 86400000) + 1)
  }, [startDate, endDate])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit() {
    if (!itemName.trim()) { setError('Geef een naam op.'); return }
    if (endDate < startDate) { setError('Einddatum moet na startdatum zijn.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/external-rentals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: itemName, supplier, start_date: startDate, end_date: endDate, total_cost: totalCost || null, project, note }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Fout bij opslaan')
      onAdded(data)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Externe huur toevoegen</h2>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Item name */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Materiaal *</label>
            <input autoFocus type="text" value={itemName} onChange={e => setItemName(e.target.value)}
              placeholder="bijv. DJI Ronin 4D"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Verhuurder</label>
            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
              placeholder="bijv. Grip House"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Van *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Tot *</label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors" />
            </div>
          </div>
          {days > 0 && (
            <p className="text-xs text-zinc-500 -mt-1">
              <span className="text-zinc-300 font-medium">{days}</span> {days === 1 ? 'dag' : 'dagen'}
            </p>
          )}

          {/* Cost */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Totale kost (€)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
              <input type="number" min="0" step="0.01" value={totalCost} onChange={e => setTotalCost(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Project</label>
            <input type="text" value={project} onChange={e => setProject(e.target.value)}
              placeholder="bijv. Pro League — matchday"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Notitie</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Aanvullende info…"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
              <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Annuleren
          </button>
          <button onClick={handleSubmit} disabled={saving || !itemName.trim()}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#3A913F' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExternalRentals() {
  const now = new Date()
  const [year,    setYear]    = useState(now.getFullYear())
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/external-rentals?year=${year}`)
      setRentals(await r.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    await fetch(`/api/external-rentals/${id}`, { method: 'DELETE' })
    setRentals(prev => prev.filter(r => r.id !== id))
  }

  // Group by month
  const byMonth = useMemo(() => {
    const map = new Map<number, Rental[]>()
    for (const r of rentals) {
      const m = new Date(r.start_date + 'T12:00:00').getMonth()
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(r)
    }
    return map
  }, [rentals])

  // Yearly totals
  const yearTotalCost = rentals.reduce((s, r) => s + (r.total_cost ?? 0), 0)
  const yearTotalDays = rentals.reduce((s, r) => s + rentalDays(r), 0)
  const yearCount     = rentals.length

  const months = Array.from({ length: 12 }, (_, i) => i).filter(m => byMonth.has(m))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/equipment"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors">
            <ChevronLeft size={15} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Externe huur</h1>
            <p className="text-sm text-zinc-400 mt-0.5">{year}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(y => y - 1)} aria-label="Vorig jaar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setYear(y => y + 1)} aria-label="Volgend jaar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors">
            <ChevronRight size={15} />
          </button>
          <div className="w-px h-5 bg-zinc-800" />
          <button onClick={() => setModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#3A913F' }}>
            <Plus size={13} />
            Huur toevoegen
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-zinc-600" />
          </div>
        ) : (
          <>
            {/* Yearly summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SummaryCard icon={Package} label="Huuritems" value={yearCount} color="#3A913F" />
              <SummaryCard icon={Clock}   label="Totaal dagen" value={yearTotalDays} color="#0ea5e9" />
              <SummaryCard icon={Euro}    label="Totale kost" value={formatEur(yearTotalCost || null)} color="#f59e0b" />
            </div>

            {/* Per month */}
            {months.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Package size={32} className="text-zinc-700" />
                <p className="text-sm text-zinc-500">Geen externe huur geregistreerd voor {year}.</p>
                <button onClick={() => setModal(true)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors">
                  Voeg eerste item toe
                </button>
              </div>
            ) : (
              months.map(m => {
                const items    = byMonth.get(m)!
                const mCost    = items.reduce((s, r) => s + (r.total_cost ?? 0), 0)
                const mDays    = items.reduce((s, r) => s + rentalDays(r), 0)

                return (
                  <div key={m}>
                    {/* Month header */}
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-zinc-200">{MONTH_NAMES[m]} {year}</h2>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span><span className="text-zinc-300 font-medium">{items.length}</span> {items.length === 1 ? 'item' : 'items'}</span>
                        <span><span className="text-zinc-300 font-medium">{mDays}</span> {mDays === 1 ? 'dag' : 'dagen'}</span>
                        {mCost > 0 && (
                          <span className="font-medium" style={{ color: '#f59e0b' }}>{formatEur(mCost)}</span>
                        )}
                      </div>
                    </div>

                    {/* Rental rows */}
                    <div className="space-y-1.5">
                      {items.map(r => (
                        <RentalRow key={r.id} rental={r} onDelete={() => handleDelete(r.id)} />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}
      </div>

      {modal && (
        <AddRentalModal
          onClose={() => setModal(false)}
          onAdded={r => setRentals(prev => [r, ...prev])}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="relative rounded-xl p-5 overflow-hidden"
      style={{ background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(255,255,255,0.10)' }}>
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  )
}

function RentalRow({ rental: r, onDelete }: { rental: Rental; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const days = rentalDays(r)

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl group"
      style={{ background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-100 truncate">{r.item_name}</span>
          {r.supplier && (
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
              {r.supplier}
            </span>
          )}
          {r.project && (
            <span className="text-[10px] text-zinc-500 truncate">{r.project}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Calendar size={10} />
            {formatDate(r.start_date)}
            {r.start_date !== r.end_date && <> → {formatDate(r.end_date)}</>}
          </span>
          <span className="text-xs text-zinc-500">
            <span className="text-zinc-400 font-medium">{days}</span> {days === 1 ? 'dag' : 'dagen'}
          </span>
        </div>
      </div>

      {/* Cost */}
      <div className="text-right flex-shrink-0">
        {r.total_cost != null ? (
          <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
            {formatEur(r.total_cost)}
          </p>
        ) : (
          <p className="text-xs text-zinc-600">geen kost</p>
        )}
        {r.total_cost != null && days > 1 && (
          <p className="text-[10px] text-zinc-600">
            {formatEur(r.total_cost / days)}/dag
          </p>
        )}
      </div>

      {/* Delete */}
      <div className="flex-shrink-0">
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <button onClick={onDelete}
              className="px-2 py-1 text-[11px] font-medium text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg hover:bg-red-950/60 transition-colors">
              Verwijder
            </button>
            <button onClick={() => setConfirming(false)}
              className="px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
              Nee
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} aria-label="Verwijder"
            className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-950/30 transition-all">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
