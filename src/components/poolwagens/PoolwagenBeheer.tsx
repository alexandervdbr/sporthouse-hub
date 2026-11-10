'use client'

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Ban, Car, Check, Loader2, Pencil, Plus, X } from 'lucide-react'
import { ACCENT, ErrorLine, inputCls, labelCls, send } from '@/components/materiaal/ui'
import type { FuelCard, PoolCar } from '@/lib/poolwagens/types'
import { DUPLICATE_NAME_TEXT, isDuplicateCarName } from '@/lib/poolwagens/car-input'
import { fuelCardChanged, nextFuelCard, parseFuelCardInput } from '@/lib/poolwagens/fuel-card'
import MailSettings from './MailSettings'
import { FuelTag } from './FuelCard'
import { EmptyState, PoolHeader, actionCls, buttonCls, pageBody, panelCls } from './ui'

// Beheer van de poolwagens: toevoegen, bewerken, handmatig niet beschikbaar
// zetten en archiveren. Verwijderen bestaat niet, zodat de historiek blijft.
// De tankkaart (nummer en pincode) wordt apart bewaard, via
// /api/poolwagens/cars/[id]/fuel-card; de pincode zelf komt hier nooit terug
// van de server, alleen of er een is.

interface CarForm {
  name: string
  license_plate: string
  make_model: string
  current_km: string
  fuel_card_number: string
  /** Een nieuwe pincode; leeg laat de bestaande staan. */
  fuel_pin: string
  clear_pin: boolean
}

const EMPTY: CarForm = { name: '', license_plate: '', make_model: '', current_km: '', fuel_card_number: '', fuel_pin: '', clear_pin: false }

/** Alleen de velden van de wagen zelf, zonder de tankkaart. */
const carFields = ({ name, license_plate, make_model, current_km }: CarForm) => ({ name, license_plate, make_model, current_km })

const fuelForm = (f: CarForm) => ({ card_number: f.fuel_card_number, pin: f.fuel_pin, clear_pin: f.clear_pin })

const km = (n: number) => n.toLocaleString('nl-BE')

export default function PoolwagenBeheer() {
  const [cars, setCars] = useState<PoolCar[] | null>(null)
  const [fuel, setFuel] = useState<Record<string, FuelCard>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    send<PoolCar[]>('/api/poolwagens/cars?archived=1', 'GET').then(setCars).catch(e => setError(e.message))
    send<FuelCard[]>('/api/poolwagens/fuel-cards', 'GET')
      .then(list => setFuel(Object.fromEntries(list.map(f => [f.car_id, f]))))
      .catch(e => setError(e.message))
  }, [])

  const replace = (car: PoolCar) => setCars(cs => (cs ?? []).map(c => (c.id === car.id ? car : c)))

  /**
   * De tankkaart bewaren als er iets veranderd is. Geeft null als het lukte
   * (of er niets te doen was), anders de foutmelding.
   */
  async function saveFuel(carId: string, form: CarForm): Promise<string | null> {
    const prev = fuel[carId] ?? null
    if (!fuelCardChanged({ card_number: prev?.card_number ?? null }, fuelForm(form))) return null
    const parsed = parseFuelCardInput(fuelForm(form))
    if ('error' in parsed) return parsed.error
    try {
      replace(await send<PoolCar>(`/api/poolwagens/cars/${carId}/fuel-card`, 'PUT', parsed.input))
      const next = nextFuelCard(carId, prev, parsed.input)
      setFuel(f => {
        const copy = { ...f }
        if (next) copy[carId] = next
        else delete copy[carId]
        return copy
      })
      return null
    } catch (e) {
      return (e as Error).message
    }
  }

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

      <div className={pageBody}>
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
                  // Een ongeldige tankkaart: meteen zeggen, nog vóór de wagen bestaat.
                  if (fuelCardChanged({ card_number: null }, fuelForm(form))) {
                    const check = parseFuelCardInput(fuelForm(form))
                    if ('error' in check) { setError(check.error); return false }
                  }
                  let car: PoolCar
                  try {
                    car = await send<PoolCar>('/api/poolwagens/cars', 'POST', carFields(form))
                  } catch (e) {
                    setError((e as Error).message)
                    return false
                  }
                  setCars(cs => [...(cs ?? []), car].sort((a, b) => a.name.localeCompare(b.name, 'nl')))
                  setAdding(false)
                  // De wagen bestaat nu; lukt de kaart niet, dan opnieuw via Bewerken.
                  const fuelError = await saveFuel(car.id, form)
                  if (fuelError) setError(`Wagen toegevoegd, maar de tankkaart niet: ${fuelError} Bewerk de wagen om het opnieuw te proberen.`)
                  return true
                }}
              />
            )}

            {active.length === 0 && !adding ? (
              <EmptyState icon={<Car size={18} />} title="Nog geen wagens"
                text="Voeg de eerste poolwagen toe; daarna kan iedereen hem reserveren." action={addButton} />
            ) : (
              <section aria-label="Wagens" className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-200">Wagens</h2>
                {active.map(car => <CarRow key={car.id} car={car} cars={cars} fuel={fuel[car.id] ?? null} onPatch={body => patch(car.id, body)} onSaveFuel={form => saveFuel(car.id, form)} />)}
              </section>
            )}

            {archived.length > 0 && (
              <section aria-label="Gearchiveerde wagens" className="space-y-2">
                <button onClick={() => setShowArchived(v => !v)} className="text-xs text-zinc-500 hover:text-zinc-300 py-2">
                  {showArchived ? 'Verberg' : 'Toon'} gearchiveerde wagens ({archived.length})
                </button>
                {showArchived && archived.map(car => <CarRow key={car.id} car={car} cars={cars} fuel={fuel[car.id] ?? null} onPatch={body => patch(car.id, body)} onSaveFuel={form => saveFuel(car.id, form)} />)}
              </section>
            )}

            <MailSettings />
          </>
        )}
      </div>
    </div>
  )
}

function CarRow({ car, cars, fuel, onPatch, onSaveFuel }: {
  car: PoolCar
  cars: PoolCar[]
  fuel: FuelCard | null
  onPatch: (body: Record<string, unknown>) => Promise<boolean>
  onSaveFuel: (form: CarForm) => Promise<string | null>
}) {
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
        initial={{
          name: car.name, license_plate: car.license_plate, make_model: car.make_model ?? '', current_km: String(car.current_km),
          fuel_card_number: fuel?.card_number ?? '', fuel_pin: '', clear_pin: false,
        }}
        hasPin={!!fuel?.has_pin}
        nameTaken={name => isDuplicateCarName(name, cars, car.id)}
        submitLabel="Opslaan"
        onCancel={() => setEditing(false)}
        onSubmit={async form => {
          const ok = await onPatch(carFields(form))
          if (!ok) return false
          // De wagen is bewaard; een fout bij de kaart houdt het formulier open.
          const fuelError = await onSaveFuel(form)
          if (fuelError) return fuelError
          setEditing(false)
          return true
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
          {(car.fuel_card_last4 || fuel?.has_pin) && (
            <div className="text-xs text-zinc-500 flex items-center gap-2">
              <FuelTag last4={car.fuel_card_last4} className="text-xs" />
              <span>{fuel?.has_pin ? 'pincode ingesteld' : 'geen pincode'}</span>
            </div>
          )}
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

function CarEditor({ initial, hasPin = false, nameTaken, submitLabel, onSubmit, onCancel }: {
  initial: CarForm
  /** Er is al een pincode bewaard (de pincode zelf komt niet mee). */
  hasPin?: boolean
  nameTaken: (name: string) => boolean
  submitLabel: string
  /** true = klaar; false = fout (elders getoond); tekst = fout om hier te tonen. */
  onSubmit: (form: CarForm) => Promise<boolean | string>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [fuelError, setFuelError] = useState('')
  const set = (k: keyof CarForm) => (e: ChangeEvent<HTMLInputElement>) => { setFuelError(''); setForm(f => ({ ...f, [k]: e.target.value })) }
  const duplicate = nameTaken(form.name)
  // Dezelfde controle als de server, terwijl je typt.
  const fuelCheck = fuelCardChanged({ card_number: initial.fuel_card_number || null }, fuelForm(form)) ? parseFuelCardInput(fuelForm(form)) : null
  const fuelProblem = fuelCheck && 'error' in fuelCheck ? fuelCheck.error : ''

  return (
    <form
      className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 space-y-3"
      onSubmit={async e => {
        e.preventDefault()
        setBusy(true)
        const result = await onSubmit(form)
        if (typeof result === 'string') setFuelError(result)
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
        <div>
          <label className={labelCls}>Tankkaart (nummer)</label>
          <input className={inputCls} value={form.fuel_card_number} onChange={set('fuel_card_number')} placeholder="bv. 7077 1234 5678 9012"
            autoComplete="off" data-1p-ignore data-lpignore="true" />
          <p className="mt-1 text-[11px] text-zinc-500">Elders staan alleen de laatste 4 tekens.</p>
        </div>
        <div>
          <label className={labelCls}>Pincode tankkaart</label>
          <input className={inputCls} type="password" inputMode="numeric" value={form.fuel_pin} onChange={set('fuel_pin')}
            disabled={form.clear_pin} maxLength={8} autoComplete="off" data-1p-ignore data-lpignore="true"
            placeholder={hasPin ? 'Ingesteld; leeg laten om te behouden' : '4 tot 8 cijfers'} />
          {hasPin && (
            <label className="mt-1.5 inline-flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={form.clear_pin} onChange={e => { setFuelError(''); setForm(f => ({ ...f, clear_pin: e.target.checked, fuel_pin: '' })) }} />
              Pincode wissen
            </label>
          )}
        </div>
      </div>
      {(fuelProblem || fuelError) && <p className="text-xs text-red-400">{fuelProblem || fuelError}</p>}
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 md:min-h-0 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-400 border border-zinc-800 md:border-0 hover:text-zinc-200">
          <X size={14} /> Annuleren
        </button>
        <button type="submit" disabled={busy || duplicate || !!fuelProblem} className="min-h-11 md:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
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
