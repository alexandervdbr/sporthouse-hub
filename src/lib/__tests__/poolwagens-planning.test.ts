import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  addMinutesLocal, brusselsLocalToISO, formatClock, formatWhen, isoToBrusselsLocal, mondayOf, nextHourLocal, nowLocal,
  relativeDayLabel, shortDayLabel, tripTimeError,
} from '@/lib/poolwagens/time'
import {
  DAY_SLOTS, columnIsPast, loadView, nowPercent, saveView, selectionToPeriod, shiftAnchor, slotLocal, viewWindow,
} from '@/lib/poolwagens/views'
import { carsNow } from '@/lib/poolwagens/status'
import { buildAgenda } from '@/lib/poolwagens/agenda'
import { MAX_DAY_BLOCKS, barTime, buildPoolGrid } from '@/lib/poolwagens/grid'
import { runArrival } from '@/lib/poolwagens/arrival-flow'
import { NO_FREE_CAR_TEXT, carChoices, pickFreeCar, reservationFormProblem } from '@/lib/poolwagens/reservation-form'
import { parsePlanningRange } from '@/lib/poolwagens/planning-range'
import { DUPLICATE_NAME_TEXT, isDuplicateCarName } from '@/lib/poolwagens/car-input'
import { parseDepartNowInput, parseReservationInput } from '@/lib/poolwagens/reservation-input'
import { poolDbErrorText } from '@/lib/poolwagens/server'
import type { PoolCar, PoolPlanning, PoolReservation } from '@/lib/poolwagens/types'

// De nieuwe planningspagina (statuslijst, vrije wagen, Dag/Week/Maand, agenda)
// en de tijden van vertrek en aankomst — vooral rond de wissel tussen zomer-
// en wintertijd. Europe/Brussels: wintertijd UTC+1, zomertijd UTC+2;
// 2026-03-29 02:00 → 03:00 en 2026-10-25 03:00 → 02:00.

describe('kloktijd ↔ tijdstip rond de zomer- en wintertijd', () => {
  it('wintertijd: 15:40 in Brussel is 14:40 UTC (de bug van 4 november)', () => {
    expect(brusselsLocalToISO('2026-11-04T15:40')).toBe('2026-11-04T14:40:00.000Z')
    expect(isoToBrusselsLocal('2026-11-04T14:40:00Z')).toBe('2026-11-04T15:40')
    expect(nowLocal(new Date('2026-11-04T14:40:59Z'))).toBe('2026-11-04T15:40')
  })

  it('zomertijd: 15:40 in Brussel is 13:40 UTC', () => {
    expect(brusselsLocalToISO('2026-07-01T15:40')).toBe('2026-07-01T13:40:00.000Z')
    expect(isoToBrusselsLocal('2026-07-01T13:40:00Z')).toBe('2026-07-01T15:40')
  })

  it('de dag zelf van de wissel: voor en na het omschakelen', () => {
    // Najaar: 01:30 is nog zomertijd, 04:00 al wintertijd.
    expect(brusselsLocalToISO('2026-10-25T01:30')).toBe('2026-10-24T23:30:00.000Z')
    expect(brusselsLocalToISO('2026-10-25T04:00')).toBe('2026-10-25T03:00:00.000Z')
    // Voorjaar: 01:30 is wintertijd, 03:30 zomertijd.
    expect(brusselsLocalToISO('2026-03-29T01:30')).toBe('2026-03-29T00:30:00.000Z')
    expect(brusselsLocalToISO('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z')
  })

  it('heen en terug geeft dezelfde kloktijd, de hele week van de wissel door', () => {
    for (let h = 0; h < 24 * 7; h++) {
      const instant = new Date(Date.parse('2026-10-22T00:00:00Z') + h * 3_600_000)
      const local = isoToBrusselsLocal(instant)
      // Het dubbele uur (02:00–03:00 op 25/10) bestaat twee keer; beide keren
      // komt de kloktijd zelf terug.
      expect(isoToBrusselsLocal(brusselsLocalToISO(local)!)).toBe(local)
    }
  })

  it('+3 uur rekent in echte tijd, ook over de wissel heen', () => {
    // Zaterdag 24/10 23:00 (zomertijd, 21:00 UTC) + 3 uur = 00:00 UTC, nog vóór de wissel: 02:00 zomertijd.
    expect(addMinutesLocal('2026-10-24T23:00', 180)).toBe('2026-10-25T02:00')
    // Om 01:30 (zomertijd) + 3 uur: om 03:00 zomertijd werd het 02:00, dus 03:30 wintertijd.
    expect(addMinutesLocal('2026-10-25T01:30', 180)).toBe('2026-10-25T03:30')
    // Voorjaar: 01:30 + 1 uur = 03:30 (02:xx bestaat niet).
    expect(addMinutesLocal('2026-03-29T01:30', 60)).toBe('2026-03-29T03:30')
    expect(addMinutesLocal('geen tijd', 60)).toBeNull()
  })

  it('het volgende hele uur, in wintertijd en zomertijd', () => {
    expect(nextHourLocal(new Date('2026-11-04T14:27:00Z'))).toBe('2026-11-04T16:00')
    expect(nextHourLocal(new Date('2026-11-04T14:27:00Z'), 3)).toBe('2026-11-04T19:00')
    expect(nextHourLocal(new Date('2026-07-01T13:27:00Z'))).toBe('2026-07-01T16:00')
    // Over middernacht.
    expect(nextHourLocal(new Date('2026-11-04T22:30:00Z'))).toBe('2026-11-05T00:00')
  })

  it('korte notaties', () => {
    expect(formatClock('2026-11-04T08:05:00Z')).toBe('9:05')
    expect(shortDayLabel('2026-11-06')).toBe('vr 6/11')
    expect(relativeDayLabel('2026-11-04', '2026-11-04')).toBe('vandaag')
    expect(relativeDayLabel('2026-11-05', '2026-11-04')).toBe('morgen')
    expect(relativeDayLabel('2026-11-07', '2026-11-04')).toBe('za 7/11')
    expect(formatWhen('2026-11-05T08:00:00Z', '2026-11-04')).toBe('morgen 9:00')
    expect(formatWhen('2026-11-04T14:00:00Z', '2026-11-04')).toBe('15:00')
    expect(mondayOf('2026-11-08')).toBe('2026-11-02')
    expect(mondayOf('2026-11-02')).toBe('2026-11-02')
  })
})

describe('tijdstip van vertrek en aankomst in het formulier', () => {
  const now = new Date('2026-11-04T14:40:00Z') // 15:40 in Brussel

  it('nu is goed; een paar minuten vooruit ook (zoals de database)', () => {
    expect(tripTimeError('aankomst', '2026-11-04T15:40', { now, departedAt: '2026-11-04T14:27:00Z' })).toBeNull()
    expect(tripTimeError('aankomst', '2026-11-04T15:44', { now })).toBeNull()
  })

  it('17:27 om 15:40 ligt in de toekomst', () => {
    expect(tripTimeError('aankomst', '2026-11-04T17:27', { now })).toBe('De aankomst ligt in de toekomst.')
    expect(tripTimeError('vertrek', '2026-11-04T16:00', { now })).toBe('Het vertrek ligt in de toekomst.')
  })

  it('een aankomst vóór het vertrek; dezelfde minuut mag', () => {
    expect(tripTimeError('aankomst', '2026-11-04T15:20', { now, departedAt: '2026-11-04T14:27:40Z' })).toBe('De aankomst ligt vóór het vertrek.')
    expect(tripTimeError('aankomst', '2026-11-04T15:27', { now, departedAt: '2026-11-04T14:27:40Z' })).toBeNull()
  })

  it('in de nacht van de wintertijd: 02:30 (tweede keer) ligt niet in de toekomst om 02:40', () => {
    const night = new Date('2026-10-25T01:40:00Z') // 02:40 wintertijd
    expect(tripTimeError('aankomst', '2026-10-25T02:30', { now: night })).toBeNull()
    expect(tripTimeError('aankomst', '2026-10-25T03:30', { now: night })).toBe('De aankomst ligt in de toekomst.')
  })

  it('leeg of ongeldig', () => {
    expect(tripTimeError('aankomst', '', { now })).toBe('Kies het tijdstip van aankomst.')
    expect(tripTimeError('vertrek', '2026-13-01T10:00', { now })).toBe('Ongeldig tijdstip.')
  })
})

describe('weergaven Dag, Week en Maand', () => {
  const today = '2026-11-04'

  it('week: maandag tot zondag, met de dagen als kolommen', () => {
    const w = viewWindow('week', today, today)
    expect(w.days).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(w.columns.map(c => c.top)).toEqual(['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'])
    expect(w.columns[2].today).toBe(true)
    expect(w.endMs - w.startMs).toBe(7 * 24 * 3_600_000)
  })

  it('de week van de wintertijd telt 169 uur, van middernacht tot middernacht', () => {
    const w = viewWindow('week', '2026-10-25', today)
    expect(w.startMs).toBe(Date.parse('2026-10-18T22:00:00Z'))
    expect(w.endMs).toBe(Date.parse('2026-10-25T23:00:00Z'))
    expect(w.endMs - w.startMs).toBe(169 * 3_600_000)
  })

  it('dag: 07:00 tot 22:00 in halve uren, ook op de dag van de wissel', () => {
    const d = viewWindow('dag', '2026-10-25', today)
    expect(d.columns).toHaveLength(DAY_SLOTS)
    expect(DAY_SLOTS).toBe(30)
    expect(d.startMs).toBe(Date.parse('2026-10-25T06:00:00Z')) // 07:00 wintertijd
    expect(d.endMs - d.startMs).toBe(15 * 3_600_000)
    expect(slotLocal('2026-10-25', 3)).toBe('2026-10-25T08:30')
    expect(d.columns[0].top).toBe('7')
    expect(d.columns[1].top).toBe('')
  })

  it('maand: alle dagen van de maand', () => {
    const m = viewWindow('maand', today, today)
    expect(m.days).toHaveLength(30)
    expect(m.title).toBe('November 2026')
  })

  it('vorige en volgende volgen de weergave', () => {
    expect(shiftAnchor('dag', today, 1)).toBe('2026-11-05')
    expect(shiftAnchor('week', today, -1)).toBe('2026-10-28')
    expect(shiftAnchor('maand', today, 1)).toBe('2026-12-01')
    expect(shiftAnchor('maand', '2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftAnchor('maand', '2026-01-15', -1)).toBe('2025-12-01')
  })

  it('een klik in de dag is een half uur; slepen is van vak tot vak', () => {
    const d = viewWindow('dag', today, today)
    expect(selectionToPeriod(d, 4, 4, '', '')).toEqual({ start: '2026-11-04T09:00', end: '2026-11-04T09:30' })
    expect(selectionToPeriod(d, 4, 9, '', '')).toEqual({ start: '2026-11-04T09:00', end: '2026-11-04T12:00' })
  })

  it('week en maand: per dag 09:00–17:00; vandaag vanaf het volgende uur', () => {
    const w = viewWindow('week', today, today)
    expect(selectionToPeriod(w, 3, 4, '2026-11-04T16:00', '2026-11-04T18:00')).toEqual({ start: '2026-11-05T09:00', end: '2026-11-06T17:00' })
    expect(selectionToPeriod(w, 2, 2, '2026-11-04T16:00', '2026-11-04T18:00')).toEqual({ start: '2026-11-04T16:00', end: '2026-11-04T17:00' })
    // Na 17:00 vandaag: eindigt twee uur later.
    expect(selectionToPeriod(w, 2, 2, '2026-11-04T19:00', '2026-11-04T21:00')).toEqual({ start: '2026-11-04T19:00', end: '2026-11-04T21:00' })
    // 's Morgens vroeg vandaag: gewoon 09:00.
    expect(selectionToPeriod(w, 2, 2, '2026-11-04T07:00', '2026-11-04T09:00')).toEqual({ start: '2026-11-04T09:00', end: '2026-11-04T17:00' })
  })

  it('voorbije vakken en de lijn van nu', () => {
    const now = new Date('2026-11-04T09:15:00Z') // 10:15
    const d = viewWindow('dag', today, today)
    expect(columnIsPast(d, 5, now, today)).toBe(true)   // 09:30–10:00
    expect(columnIsPast(d, 6, now, today)).toBe(false)  // 10:00–10:30
    expect(nowPercent(d, now)).toBeCloseTo((3.25 / 15) * 100)
    expect(nowPercent(viewWindow('dag', '2026-11-05', today), now)).toBeNull()
    const w = viewWindow('week', today, today)
    expect(columnIsPast(w, 1, now, today)).toBe(true)
    expect(columnIsPast(w, 2, now, today)).toBe(false)
  })
})

describe('de weergave onthouden', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('per gebruiker, standaard Week', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } })
    expect(loadView('u1')).toBe('week')
    saveView('u1', 'dag')
    expect(loadView('u1')).toBe('dag')
    expect(loadView('u2')).toBe('week')
    store.set('poolwagens:weergave:u1', 'onzin')
    expect(loadView('u1')).toBe('week')
  })

  it('localStorage die faalt: Week, en geen fout', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('privé') }, setItem: () => { throw new Error('vol') } } })
    expect(loadView('u1')).toBe('week')
    expect(() => saveView('u1', 'maand')).not.toThrow()
  })
})

// ── Planning met acht testwagens ────────────────────────────────────────────

const car = (id: string, extra: Partial<PoolCar> = {}): PoolCar => ({
  id, name: `Wagen ${id}`, license_plate: `1-TST-00${id}`, make_model: null, current_km: 1000,
  manual_block: false, manual_block_note: null, archived_at: null, created_at: '2026-01-01T00:00:00Z', fuel_card_last4: null, ...extra,
})
const res = (id: string, carId: string, start: string, end: string, extra: Partial<PoolReservation> = {}): PoolReservation => ({
  id, car_id: carId, user_id: 'u2', person_name: 'Bram Peeters', client_id: null, client_name: null,
  start_at: start, end_at: end, note: null, departed_at: null, departure_km: null, arrived_at: null, arrival_km: null,
  driven_km: null, created_by: 'u2', created_by_name: 'Bram Peeters', ...extra,
})
const NOW = new Date('2026-11-04T09:00:00Z') // woensdag 10:00
const TODAY = '2026-11-04'

function planning(): PoolPlanning {
  return {
    now: NOW.toISOString(),
    cars: ['1', '2', '3', '4', '5', '6', '7', '8'].map(id => car(id, id === '6' ? { manual_block: true, manual_block_note: 'onderhoud' } : {})),
    blockingDamage: [{ id: 'd', car_id: '7', created_at: '2026-11-01T00:00:00Z' }],
    reservations: [
      // 1: onderweg met Anna (rit van 1 uur), terug om 11:00
      res('r1', '1', '2026-11-04T09:00:00Z', '2026-11-04T10:00:00Z', { user_id: 'u1', person_name: 'Anna Janssens', created_by: 'u1', departed_at: '2026-11-04T09:00:00Z', departure_km: 1000 }),
      // 2: te laat terug (Bram), had om 9:00 terug moeten zijn
      res('r2', '2', '2026-11-04T06:00:00Z', '2026-11-04T08:00:00Z', { departed_at: '2026-11-04T06:00:00Z', departure_km: 1000 }),
      // 3: gereserveerd nu, nog niet vertrokken (rit van 1 dag)
      res('r3', '3', '2026-11-04T08:00:00Z', '2026-11-05T08:00:00Z', { client_name: 'Croky' }),
      // 4: vrij, volgende morgen 9:00
      res('r4', '4', '2026-11-05T08:00:00Z', '2026-11-05T16:00:00Z', { person_name: 'Jan Claes', user_id: 'u3', created_by: 'u1' }),
      // 5: rit van 5 dagen, van maandag tot vrijdag, onderweg
      res('r5', '5', '2026-11-02T07:00:00Z', '2026-11-06T16:00:00Z', { departed_at: '2026-11-02T07:00:00Z', departure_km: 1000 }),
    ],
  }
}

describe('statuslijst "Nu"', () => {
  const rows = carsNow(planning(), 'u1', NOW)
  const byId = new Map(rows.map(r => [r.car.id, r]))

  it('een regel per actieve wagen, met de toestand in woorden', () => {
    expect(rows).toHaveLength(8)
    expect(byId.get('1')!.label).toBe('Onderweg met Anna tot 11:00')
    expect(byId.get('2')!.label).toBe('Te laat terug (Bram)')
    expect(byId.get('3')!.label).toBe('Gereserveerd voor Bram tot morgen 9:00')
    expect(byId.get('4')!.label).toBe('Vrij')
    expect(byId.get('5')!.label).toBe('Onderweg met Bram tot vr 6/11 17:00')
    expect(byId.get('6')!.label).toBe('Geblokkeerd: onderhoud')
    expect(byId.get('7')!.label).toBe('Geblokkeerd: ernstige schade')
    expect(byId.get('8')!.kind).toBe('vrij')
  })

  it('de volgende reservatie', () => {
    expect(byId.get('4')!.nextLabel).toBe('Volgende: morgen 9:00 · Jan')
    expect(byId.get('8')!.nextLabel).toBeNull()
  })

  it('snelle actie: vertrekken bij vrij, aankomst bij je eigen rit, anders details', () => {
    expect(byId.get('4')!.action).toEqual({ kind: 'vertrekken' })
    expect(byId.get('1')!.action).toEqual({ kind: 'aankomst', reservationId: 'r1' })
    expect(byId.get('2')!.action).toEqual({ kind: 'details', reservationId: 'r2' })
    expect(byId.get('6')!.action).toEqual({ kind: 'geen' })
    // Wie de reservatie voor een collega maakte, mag de aankomst ook registreren.
    const forColleague = carsNow({ ...planning(), reservations: [res('x', '8', '2026-11-04T08:00:00Z', '2026-11-04T12:00:00Z', { created_by: 'u1', departed_at: '2026-11-04T08:00:00Z', departure_km: 1 })] }, 'u1', NOW)
    expect(forColleague.find(r => r.car.id === '8')!.action).toEqual({ kind: 'aankomst', reservationId: 'x' })
  })

  it('zonder recht om te boeken geen "Nu vertrekken"', () => {
    expect(carsNow(planning(), 'u1', NOW, false).find(r => r.car.id === '4')!.action).toEqual({ kind: 'geen' })
  })
})

describe('wagenkeuze in het reserveerformulier', () => {
  const choose = (startISO: string | null, endISO: string | null, editing: PoolReservation | null = null) =>
    carChoices({ planning: planning(), startISO, endISO, editing, now: NOW })

  it('vrij, bezet of geblokkeerd, met de vrije bovenaan', () => {
    // Vandaag 10:00–13:00
    const rows = choose('2026-11-04T09:00:00Z', '2026-11-04T12:00:00Z')!
    expect(rows.map(r => [r.car.id, r.kind])).toEqual([
      ['2', 'vrij'], ['4', 'vrij'], ['8', 'vrij'],
      ['1', 'bezet'], ['3', 'bezet'], ['5', 'bezet'],
      ['6', 'geblokkeerd'], ['7', 'geblokkeerd'],
    ])
    const by = new Map(rows.map(r => [r.car.id, r]))
    expect(by.get('2')!.label).toBe('Vrij')
    expect(by.get('1')!.label).toBe('Bezet door Anna tot 11:00')
    expect(by.get('3')!.label).toBe('Bezet door Bram tot morgen 9:00')
    expect(by.get('6')!.label).toBe('Geblokkeerd')
  })

  it('pas zodra de periode geldig ingevuld is', () => {
    expect(choose(null, '2026-11-04T12:00:00Z')).toBeNull()
    expect(choose('2026-11-04T12:00:00Z', '2026-11-04T12:00:00Z')).toBeNull()
  })

  it('aansluitend is vrij (halfopen), een overlap niet', () => {
    const by = new Map(choose('2026-11-05T08:00:00Z', '2026-11-05T16:00:00Z')!.map(r => [r.car.id, r]))
    expect(by.get('3')!.kind).toBe('vrij') // r3 eindigt morgen om 9:00
    expect(by.get('4')!.label).toBe('Bezet door Jan tot morgen 17:00')
  })

  it('een reservatie die je wijzigt botst niet met zichzelf', () => {
    const r1 = planning().reservations.find(r => r.id === 'r1')!
    const by = new Map(choose('2026-11-04T09:00:00Z', '2026-11-04T12:00:00Z', r1)!.map(r => [r.car.id, r]))
    expect(by.get('1')!.kind).toBe('vrij')
  })

  it('niet meer vrij na een andere periode: de eerste vrije wordt gekozen', () => {
    const rows = choose('2026-11-04T09:00:00Z', '2026-11-04T12:00:00Z')!
    expect(pickFreeCar(rows, '1')).toEqual({ carId: '2', switched: expect.objectContaining({ id: '1' }) })
    expect(pickFreeCar(rows, '4')).toEqual({ carId: '4', switched: null }) // vrij: blijft
    expect(pickFreeCar(null, '1')).toEqual({ carId: '1', switched: null }) // periode nog niet ingevuld
  })

  it('geen enkele wagen vrij: de keuze blijft, met een melding', () => {
    const full = planning()
    full.cars = full.cars.filter(c => ['1', '6'].includes(c.id))
    const rows = carChoices({ planning: full, startISO: '2026-11-04T09:00:00Z', endISO: '2026-11-04T12:00:00Z', editing: null, now: NOW })!
    expect(rows.some(r => r.kind === 'vrij')).toBe(false)
    expect(pickFreeCar(rows, '1')).toEqual({ carId: '1', switched: null })
    expect(NO_FREE_CAR_TEXT).toBe('Geen wagen vrij in deze periode.')
  })
})

describe('agenda voor de gsm', () => {
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
  const agenda = buildAgenda(planning(), days, TODAY, NOW)

  it('per dag, met Vandaag en Morgen', () => {
    expect(agenda.map(d => d.label)).toEqual(['Ma 2/11', 'Gisteren', 'Vandaag', 'Morgen', 'Vr 6/11', 'Za 7/11', 'Zo 8/11'])
  })

  it('een rit over meerdere dagen staat bij elke dag als "loopt door"', () => {
    const r5 = agenda.map(d => d.entries.find(e => e.reservation.id === 'r5')?.time ?? null)
    expect(r5).toEqual(['vanaf 8:00 · loopt door', 'hele dag · loopt door', 'hele dag · loopt door', 'hele dag · loopt door', 'tot 17:00 · loopt door', null, null])
  })

  it('een rit van een uur: tijd, wagen, voornaam', () => {
    const e = agenda[2].entries.find(x => x.reservation.id === 'r1')!
    expect(e.time).toBe('10:00–11:00')
    expect(e.car.name).toBe('Wagen 1')
    expect(e.person).toBe('Anna')
  })

  it('filter per wagen', () => {
    const only4 = buildAgenda(planning(), days, TODAY, NOW, '4')
    expect(only4.flatMap(d => d.entries.map(e => e.reservation.id))).toEqual(['r4'])
  })
})

describe('raster: blokjes binnen een dag, balken over meerdere dagen', () => {
  const week = viewWindow('week', TODAY, TODAY)
  const grid = (p: PoolPlanning, w = week) => buildPoolGrid(p, w, 'u1', NOW, { withTime: w.view !== 'maand', days: w.view === 'dag' ? undefined : w.days })

  it('een rit van drie minuten blijft binnen zijn dag', () => {
    const row = grid({ ...planning(), reservations: [res('k', '8', '2026-11-04T08:00:00Z', '2026-11-04T08:03:00Z')] }).find(r => r.car.id === '8')!
    expect(row.bars).toEqual([])
    expect(row.dayBlocks[2].map(b => b.label)).toEqual(['9:00–9:03 · Bram'])
    expect(row.dayBlocks.filter(d => d.length).length).toBe(1)
  })

  it('blokje: "<begin>–<einde> · <voornaam>", de klant en de toestand in de tooltip', () => {
    const rows = grid(planning())
    const b = rows.find(r => r.car.id === '1')!.dayBlocks[2][0]
    expect(b.label).toBe('10:00–11:00 · Anna')
    expect(b.title).toBe('10:00–11:00 · Anna · Onderweg')
    // Te laat: loopt door tot nu, nog altijd binnen dezelfde dag.
    expect(rows.find(r => r.car.id === '2')!.dayBlocks[2][0]).toMatchObject({ label: '7:00–10:00 · Bram', state: 'te_laat' })
  })

  it('een rit tot middernacht hoort nog bij die dag', () => {
    const row = grid({ ...planning(), reservations: [res('m', '8', '2026-11-04T22:00:00Z', '2026-11-04T23:00:00Z')] }).find(r => r.car.id === '8')!
    expect(row.dayBlocks[2].map(b => b.label)).toEqual(['23:00–0:00 · Bram'])
  })

  it('over meerdere dagen: een balk op het juiste moment binnen de dag', () => {
    const row = grid(planning()).find(r => r.car.id === '3')!
    expect(row.dayBlocks.every(d => d.length === 0)).toBe(true)
    expect(row.bars[0].label).toBe('wo 9:00–do 9:00 · Bram · Croky')
    // Woensdag 9:00 = 2 dagen en 9 uur na maandag 0:00, op 168 uur.
    expect(row.bars[0].left).toBeCloseTo((57 / 168) * 100)
    expect(row.bars[0].width).toBeCloseTo((24 / 168) * 100)
    expect(barTime('2026-11-04T09:00:00Z', '2026-11-04T10:00:00Z')).toBe('10:00–11:00')
  })

  it('meer dan drie op een dag: maxBlocks telt alles, het raster toont er drie en "+N meer"', () => {
    const many = ['06', '08', '10', '12', '14'].map((h, i) => res(`x${i}`, '8', `2026-11-04T${h}:00:00Z`, `2026-11-04T${h}:30:00Z`))
    const row = grid({ ...planning(), reservations: many }).find(r => r.car.id === '8')!
    expect(row.dayBlocks[2]).toHaveLength(5)
    expect(row.maxBlocks).toBe(5)
    expect(MAX_DAY_BLOCKS).toBe(3)
    expect(row.dayBlocks[2].map(b => b.label)[0]).toBe('7:00–7:30 · Bram')
  })

  it('maand: ook blokjes, zonder uur in het label van een balk', () => {
    const month = viewWindow('maand', TODAY, TODAY)
    const rows = grid(planning(), month)
    expect(rows.find(r => r.car.id === '1')!.dayBlocks[3][0].label).toBe('10:00–11:00 · Anna')
    expect(rows.find(r => r.car.id === '3')!.bars[0].label).toBe('Bram · Croky')
  })

  it('dag: alles is een balk op het uur; een rit van vijf dagen loopt aan beide randen door', () => {
    const d = viewWindow('dag', TODAY, TODAY)
    const rows = grid(planning(), d)
    expect(rows.find(r => r.car.id === '5')!.bars[0]).toMatchObject({ continuesBefore: true, continuesAfter: true, left: 0, width: 100 })
    expect(rows.find(r => r.car.id === '1')!.bars[0].label).toBe('10:00–11:00 · Anna')
    expect(rows.every(r => r.dayBlocks.length === 0)).toBe(true)
  })
})

describe('aankomst met schade', () => {
  it('eerst de aankomst, dan de schade', async () => {
    const order: string[] = []
    const out = await runArrival({
      arrivalDone: false,
      saveArrival: async () => { order.push('aankomst') },
      saveDamage: async () => { order.push('schade'); return { ok: true, message: 'Melding opgeslagen.' } },
    })
    expect(order).toEqual(['aankomst', 'schade'])
    expect(out).toEqual({ stage: 'klaar', damageMessage: 'Melding opgeslagen.' })
  })

  it('mislukt de aankomst, dan geen schade', async () => {
    const damage = vi.fn()
    const out = await runArrival({ arrivalDone: false, saveArrival: async () => { throw new Error('De aankomst ligt in de toekomst.') }, saveDamage: damage })
    expect(out).toEqual({ stage: 'aankomst-mislukt', error: 'De aankomst ligt in de toekomst.' })
    expect(damage).not.toHaveBeenCalled()
  })

  it('mislukt de schade, dan blijft de aankomst; opnieuw proberen slaat de aankomst over', async () => {
    const arrival = vi.fn(async () => {})
    const first = await runArrival({ arrivalDone: false, saveArrival: arrival, saveDamage: async () => ({ ok: false, error: 'Netwerkfout' }) })
    expect(first).toEqual({ stage: 'schade-mislukt', error: 'Netwerkfout' })
    const retry = await runArrival({ arrivalDone: true, saveArrival: arrival, saveDamage: async () => ({ ok: true, message: 'Melding opgeslagen.' }) })
    expect(retry).toEqual({ stage: 'klaar', damageMessage: 'Melding opgeslagen.' })
    expect(arrival).toHaveBeenCalledTimes(1)
  })

  it('een schade die een fout gooit, telt als mislukt (niet als crash)', async () => {
    const out = await runArrival({ arrivalDone: false, saveArrival: async () => {}, saveDamage: async () => { throw new Error('kapot') } })
    expect(out).toEqual({ stage: 'schade-mislukt', error: 'kapot' })
  })

  it('zonder schade: gewoon de aankomst', async () => {
    expect(await runArrival({ arrivalDone: false, saveArrival: async () => {}, saveDamage: null })).toEqual({ stage: 'klaar', damageMessage: null })
  })
})

describe('melding in het reserveerformulier: hoogstens één', () => {
  const base = {
    kind: 'new' as const, carId: '4', editing: null, block: null, reservations: planning().reservations, now: NOW, manage: false,
  }

  it('een botsing', () => {
    expect(reservationFormProblem({ ...base, startISO: '2026-11-05T09:00:00Z', endISO: '2026-11-05T10:00:00Z' }))
      .toBe('Deze wagen is dan al gereserveerd: do 5/11 09:00–17:00, Jan Claes.')
  })

  it('geen botsing: geen melding', () => {
    expect(reservationFormProblem({ ...base, startISO: '2026-11-05T16:00:00Z', endISO: '2026-11-05T18:00:00Z' })).toBeNull()
  })

  it('volgorde van de periode, verleden, blokkade', () => {
    expect(reservationFormProblem({ ...base, startISO: '2026-11-05T10:00:00Z', endISO: '2026-11-05T09:00:00Z' })).toBe('De terugkomst ligt na het vertrek.')
    expect(reservationFormProblem({ ...base, startISO: '2026-11-03T10:00:00Z', endISO: '2026-11-03T11:00:00Z' })).toBe('Een reservatie in het verleden kan alleen een beheerder maken.')
    expect(reservationFormProblem({ ...base, manage: true, startISO: '2026-11-03T10:00:00Z', endISO: '2026-11-03T11:00:00Z' })).toBeNull()
    expect(reservationFormProblem({ ...base, carId: '6', block: { kind: 'handmatig', reason: 'Wagen 6 is niet beschikbaar (onderhoud)' },
      startISO: '2026-11-06T10:00:00Z', endISO: '2026-11-06T11:00:00Z' })).toBe('Wagen 6 is niet beschikbaar (onderhoud) en kan niet gereserveerd worden.')
  })

  it('Nu vertrekken: de terugkomst ligt in de toekomst', () => {
    expect(reservationFormProblem({ ...base, kind: 'now', startISO: NOW.toISOString(), endISO: '2026-11-04T08:00:00Z' })).toBe('De verwachte terugkomst ligt in de toekomst.')
  })

  it('een eigen reservatie wijzigen botst niet met zichzelf', () => {
    const r4 = planning().reservations.find(r => r.id === 'r4')!
    expect(reservationFormProblem({ ...base, kind: 'edit', editing: r4, startISO: r4.start_at, endISO: '2026-11-05T17:00:00Z' })).toBeNull()
  })
})

describe('unieke wagennaam', () => {
  const cars = [
    { id: 'a', name: 'Poolwagen 1', archived_at: null },
    { id: 'b', name: 'Bus', archived_at: '2026-01-01T00:00:00Z' },
  ]

  it('hoofdletters en spaties vooraan of achteraan tellen niet mee', () => {
    expect(isDuplicateCarName('  poolwagen 1 ', cars)).toBe(true)
    expect(isDuplicateCarName('Poolwagen 2', cars)).toBe(false)
  })

  it('gearchiveerde wagens tellen niet mee; de wagen zelf ook niet', () => {
    expect(isDuplicateCarName('bus', cars)).toBe(false)
    expect(isDuplicateCarName('Poolwagen 1', cars, 'a')).toBe(false)
  })

  it('de melding van de database in gewone taal', () => {
    expect(poolDbErrorText({ code: '23505', message: 'duplicate key value violates unique constraint "pool_cars_name_active_key"' })).toBe(DUPLICATE_NAME_TEXT)
    expect(poolDbErrorText({ code: '23505', message: 'duplicate key value violates unique constraint "pool_cars_license_plate_key"' }))
      .toBe('Er bestaat al een wagen met deze nummerplaat.')
  })
})

describe('voor wie', () => {
  const U = '00000000-0000-4000-8000-000000000001'
  const C = '00000000-0000-4000-8000-0000000000c1'

  it('een collega gaat mee als p_user_id; leeg is jezelf', () => {
    const a = parseReservationInput({ car_id: C, start: '2026-11-05T09:00', end: '2026-11-05T12:00', user_id: U })
    expect('args' in a && a.args.p_user_id).toBe(U)
    const b = parseReservationInput({ car_id: C, start: '2026-11-05T09:00', end: '2026-11-05T12:00' })
    expect('args' in b && b.args.p_user_id).toBeNull()
    const c = parseDepartNowInput({ car_id: C, end: '2026-11-05T12:00', user_id: U }, new Date('2026-11-05T08:00:00Z'))
    expect('args' in c && c.args.p_user_id).toBe(U)
  })

  it('een ongeldige id wordt geweigerd', () => {
    expect(parseReservationInput({ car_id: C, start: '2026-11-05T09:00', end: '2026-11-05T12:00', user_id: 'jan' })).toEqual({ error: 'Ongeldige collega.' })
  })
})

describe('venster van /api/poolwagens/planning', () => {
  const p = (q: string) => parsePlanningRange(new URLSearchParams(q))

  it('from–to, beide dagen inbegrepen, van middernacht tot middernacht in Brussel', () => {
    expect(p('from=2026-10-19&to=2026-10-25')).toEqual({ start: '2026-10-18T22:00:00.000Z', end: '2026-10-25T23:00:00.000Z' })
  })

  it('month blijft werken', () => {
    expect(p('month=2026-11')).toEqual({ start: '2026-10-31T23:00:00.000Z', end: '2026-11-30T23:00:00.000Z' })
  })

  it('weigert wat niet klopt of te groot is', () => {
    expect(p('from=2026-11-10&to=2026-11-01')).toHaveProperty('error')
    expect(p('from=2026-01-01&to=2026-12-31')).toHaveProperty('error')
    expect(p('from=gisteren&to=2026-11-01')).toHaveProperty('error')
    expect(p('')).toHaveProperty('error')
  })
})
