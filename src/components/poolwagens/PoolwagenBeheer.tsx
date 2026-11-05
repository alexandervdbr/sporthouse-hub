'use client'

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Ban, Car, Check, Loader2, Pencil, Plus, X } from 'lucide-react'
import { ACCENT, ErrorLine, inputCls, labelCls, send } from '@/components/materiaal/ui'
import type { PoolCar } from '@/lib/poolwagens/types'
import { DUPLICATE_NAME_TEXT, isDuplicateCarName } from '@/lib/poolwagens/car-input'
import MailSettings from './MailSettings'
import { EmptyState, PoolHeader, actionCls, buttonCls, pageStack, pageX, panelCls } from './ui'

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

  const addButton = (
    <button onClick={() => { setAdding(true); setError('') }} disabled={adding}
      className={`${buttonCls} ${actionCls} text-white`} style={{ backgroundColor: ACCENT }}>
      <Plus size={14} /> Wagen toevoegen
    </button>
  )

  const active = (cars ?? []).filter(c => !c.archived_at)
  const archived = (cars ?? []).filter(c => c.archived_at)

  return (
    <div className="min-h-full pb-8">
      <PoolHeader current="beheer" manage loading={!cars && !error} actions={cars ? addButton : undefined} />

      <div className={`${pageX} py-4 ${pageStack} max-w-4xl`}>
        <ErrorLine>{error}</ErrorLine>

        {cars && (
          <>
            {adding && (
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
            )}

            {active.length === 0 && !adding ? (
              <EmptyState icon={<Car size={18} />} title="Nog geen wagens"
                text="Voeg de eerste poolwagen toe; daarna kan iedereen hem reserveren." action={addButton} />
            ) : (
              <section aria-label="Wagens" className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-200">Wagens</h2>
                {active.map(car => <CarRow key={car.id} car={car} cars={cars} onPatch={body => patch(car.id, body)} />)}
              </section>
            )}

            {archived.length > 0 && (
              <section aria-label="Gearchiveerde wagens" className="space-y-2">
                <button onClick={() => setShowArchived(v => !v)} className="text-xs text-zinc-500 hover:text-zinc-300 py-2">
                  {showArchived ? 'Verberg' : 'Toon'} gearchiveerde wagens ({archived.length})
                </button>
                {showArchived && archived.map(car => <CarRow key={car.id} car={car} cars={cars} onPatch={body => patch(car.id, body)} />)}
              </section>
            )}

            <MailSettings />
          </>
        )}
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
  const state = archivedCar ? 'Gearchiveerd'
    : car.manual_block ? `Niet beschikbaar${car.manual_block_note ? `: ${car.manual_block_note}` : ''}`
    : 'Beschikbaar'

  return (
    <div className={`${panelCls} p-3 md:px-4 ${archivedCar ? 'opacity-70' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-100 truncate">{car.name}</span>
            <span className="px-1.5 py-0.5 rounded border border-zinc-700 text-[10px] font-mono text-zinc-300">{car.license_plate}</span>
          </div>
          <div className="text-xs text-zinc-500">{[car.make_model, `${km(car.current_km)} km`].filter(Boolean).join(' · ')}</div>
          <div className={`text-xs ${car.manual_block && !archivedCar ? 'text-red-400' : archivedCar ? 'text-zinc-500' : 'text-emerald-400'}`}>{state}</div>
        </div>

        {/* Op een gsm: knoppen met tekst over de volle breedte; op desktop iconen. */}
        <div className="grid grid-cols-3 gap-2 md:flex md:gap-1">
          {!archivedCar && (
            <>
              <IconButton label="Bewerken" onClick={() => setEditing(true)} disabled={busy}><Pencil size={14} /></IconButton>
              {car.manual_block ? (
                <IconButton label="Beschikbaar maken" onClick={() => run({ manual_block: false })} disabled={busy}><Check size={14} /></IconButton>
              ) : (
                <IconButton label="Niet beschikbaar" onClick={() => { setNote(''); setBlocking(true) }} disabled={busy}><Ban size={14} /></IconButton>
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
          <div className="grid grid-cols-2 gap-2 md:flex">
            <button
              disabled={busy}
              onClick={async () => { if (await run({ manual_block: true, manual_block_note: note })) setBlocking(false) }}
              className="min-h-11 md:min-h-0 px-3 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 whitespace-nowrap"
            >
              Niet beschikbaar
            </button>
            <button onClick={() => setBlocking(false)} className="min-h-11 md:min-h-0 px-3 py-2 rounded-lg text-xs text-zinc-400 border border-zinc-800 md:border-0 hover:text-zinc-200">Annuleren</button>
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
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 md:min-h-0 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-400 border border-zinc-800 md:border-0 hover:text-zinc-200">
          <X size={14} /> Annuleren
        </button>
        <button type="submit" disabled={busy || duplicate} className="min-h-11 md:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
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
      className="min-h-11 md:min-h-0 flex items-center justify-center gap-1.5 p-2 rounded-lg border border-zinc-800 md:border-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
    >
      {children}
      <span className="md:hidden text-xs truncate">{label}</span>
    </button>
  )
}
