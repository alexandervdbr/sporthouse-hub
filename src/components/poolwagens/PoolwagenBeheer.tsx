'use client'

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Ban, Check, Loader2, Pencil, Plus, X } from 'lucide-react'
import { ACCENT, ErrorLine, inputCls, labelCls, send } from '@/components/materiaal/ui'
import type { PoolCar } from '@/lib/poolwagens/types'
import { DUPLICATE_NAME_TEXT, isDuplicateCarName } from '@/lib/poolwagens/car-input'
import MailSettings from './MailSettings'
import { PoolNav } from './ui'

// Beheer van de poolwagens: toevoegen, bewerken, handmatig niet beschikbaar
// zetten en archiveren. Verwijderen bestaat niet, zodat de historiek blijft.

interface CarForm {
  name: string
  license_plate: string
  make_model: string
  current_km: string
}

const EMPTY: CarForm = { name: '', license_plate: '', make_model: '', current_km: '' }

const km = (n: number) => n.toLocaleString('nl-BE')

export default function PoolwagenBeheer() {
  const [cars, setCars] = useState<PoolCar[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    send<PoolCar[]>('/api/poolwagens/cars?archived=1', 'GET').then(setCars).catch(e => setError(e.message))
  }, [])

  const replace = (car: PoolCar) => setCars(cs => (cs ?? []).map(c => (c.id === car.id ? car : c)))

  async function patch(id: string, body: Record<string, unknown>) {
    setError('')
    try {
      replace(await send<PoolCar>(`/api/poolwagens/cars/${id}`, 'PATCH', body))
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  if (!cars) {
    return (
      <div className="p-8">
        {error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={20} className="animate-spin text-zinc-600" />}
      </div>
    )
  }

  const active = cars.filter(c => !c.archived_at)
  const archived = cars.filter(c => c.archived_at)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <h1 className="text-lg font-semibold text-zinc-100">Poolwagens</h1>
          <PoolNav current="beheer" manage />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-200">Wagens</h2>
          {!adding && (
            <button
              onClick={() => { setAdding(true); setError('') }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ backgroundColor: ACCENT }}
            >
              <Plus size={14} /> Wagen toevoegen
            </button>
          )}
        </div>

        <div className="mb-4"><ErrorLine>{error}</ErrorLine></div>

        {adding && (
          <div className="mb-4">
            <CarEditor
              initial={EMPTY}
              nameTaken={name => isDuplicateCarName(name, cars)}
              submitLabel="Toevoegen"
              onCancel={() => setAdding(false)}
              onSubmit={async form => {
                setError('')
                try {
                  const car = await send<PoolCar>('/api/poolwagens/cars', 'POST', form)
                  setCars(cs => [...(cs ?? []), car].sort((a, b) => a.name.localeCompare(b.name, 'nl')))
                  setAdding(false)
                  return true
                } catch (e) {
                  setError((e as Error).message)
                  return false
                }
              }}
            />
          </div>
        )}

        {active.length === 0 && !adding && (
          <p className="text-sm text-zinc-500 py-6">Nog geen wagens. Voeg de eerste poolwagen toe.</p>
        )}

        <div className="space-y-2">
          {active.map(car => <CarRow key={car.id} car={car} cars={cars} onPatch={body => patch(car.id, body)} />)}
        </div>

        {archived.length > 0 && (
          <div className="mt-8">
            <button onClick={() => setShowArchived(v => !v)} className="text-xs text-zinc-500 hover:text-zinc-300">
              {showArchived ? 'Verberg' : 'Toon'} gearchiveerde wagens ({archived.length})
            </button>
            {showArchived && (
              <div className="space-y-2 mt-3">
                {archived.map(car => <CarRow key={car.id} car={car} cars={cars} onPatch={body => patch(car.id, body)} />)}
              </div>
            )}
          </div>
        )}

        <MailSettings />
      </div>
    </div>
  )
}

function CarRow({ car, cars, onPatch }: { car: PoolCar; cars: PoolCar[]; onPatch: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (body: Record<string, unknown>) => {
    setBusy(true)
    const ok = await onPatch(body)
    setBusy(false)
    return ok
  }

  if (editing) {
    return (
      <CarEditor
        initial={{ name: car.name, license_plate: car.license_plate, make_model: car.make_model ?? '', current_km: String(car.current_km) }}
        nameTaken={name => isDuplicateCarName(name, cars, car.id)}
        submitLabel="Opslaan"
        onCancel={() => setEditing(false)}
        onSubmit={async form => {
          const ok = await onPatch(form as unknown as Record<string, unknown>)
          if (ok) setEditing(false)
          return ok
        }}
      />
    )
  }

  const archivedCar = !!car.archived_at

  return (
    <div className={`rounded-xl border px-4 py-3 ${archivedCar ? 'border-zinc-900 bg-zinc-950/40 opacity-70' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-100 truncate">{car.name}</span>
            <span className="px-1.5 py-0.5 rounded border border-zinc-700 text-[10px] font-mono text-zinc-300">{car.license_plate}</span>
            {car.manual_block && !archivedCar && (
              <span className="px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                Niet beschikbaar
              </span>
            )}
            {archivedCar && <span className="text-[10px] uppercase tracking-wide text-zinc-500">Gearchiveerd</span>}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {[car.make_model, `${km(car.current_km)} km`].filter(Boolean).join(' · ')}
            {car.manual_block && car.manual_block_note && !archivedCar && <span className="text-red-400/80"> · {car.manual_block_note}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!archivedCar && (
            <>
              <IconButton label="Bewerken" onClick={() => setEditing(true)} disabled={busy}><Pencil size={14} /></IconButton>
              {car.manual_block ? (
                <IconButton label="Weer beschikbaar maken" onClick={() => run({ manual_block: false })} disabled={busy}><Check size={14} /></IconButton>
              ) : (
                <IconButton label="Niet beschikbaar zetten" onClick={() => { setNote(''); setBlocking(true) }} disabled={busy}><Ban size={14} /></IconButton>
              )}
              <IconButton label="Archiveren" onClick={() => { if (confirm(`${car.name} archiveren? De wagen verdwijnt uit de planning; de historiek blijft.`)) run({ archived: true }) }} disabled={busy}>
                <Archive size={14} />
              </IconButton>
            </>
          )}
          {archivedCar && (
            <IconButton label="Terugzetten" disabled={busy}
              onClick={() => {
                // Dezelfde regel als de database: dan eerst hernoemen.
                if (isDuplicateCarName(car.name, cars, car.id)) alert(`${DUPLICATE_NAME_TEXT} Hernoem eerst de actieve wagen "${car.name}".`)
                else run({ archived: false })
              }}><ArchiveRestore size={14} /></IconButton>
          )}
        </div>
      </div>

      {blocking && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            autoFocus
            className={inputCls}
            placeholder="Reden (optioneel), bv. onderhoud tot vrijdag"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={async () => { if (await run({ manual_block: true, manual_block_note: note })) setBlocking(false) }}
              className="px-3 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 whitespace-nowrap"
            >
              Niet beschikbaar
            </button>
            <button onClick={() => setBlocking(false)} className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200">Annuleren</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CarEditor({ initial, nameTaken, submitLabel, onSubmit, onCancel }: {
  initial: CarForm
  nameTaken: (name: string) => boolean
  submitLabel: string
  onSubmit: (form: CarForm) => Promise<boolean>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof CarForm) => (e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const duplicate = nameTaken(form.name)

  return (
    <form
      className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 space-y-3"
      onSubmit={async e => {
        e.preventDefault()
        setBusy(true)
        await onSubmit(form)
        setBusy(false)
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Naam / omschrijving</label>
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="bv. Bestelwagen groot" required autoFocus
            aria-invalid={duplicate} />
          {duplicate && <p className="mt-1 text-xs text-red-400">{DUPLICATE_NAME_TEXT}</p>}
        </div>
        <div>
          <label className={labelCls}>Nummerplaat</label>
          <input className={inputCls} value={form.license_plate} onChange={set('license_plate')} placeholder="1-ABC-234" required />
        </div>
        <div>
          <label className={labelCls}>Merk / model</label>
          <input className={inputCls} value={form.make_model} onChange={set('make_model')} placeholder="bv. Volkswagen Transporter" />
        </div>
        <div>
          <label className={labelCls}>Actuele kilometerstand</label>
          <input className={inputCls} value={form.current_km} onChange={set('current_km')} inputMode="numeric" placeholder="0" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200">
          <X size={14} /> Annuleren
        </button>
        <button type="submit" disabled={busy || duplicate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {submitLabel}
        </button>
      </div>
    </form>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
