import { describe, it, expect } from 'vitest'
import { canChangeReservation, canRegisterTrip, endangeredReservations, isOpenTrip, tripState } from '@/lib/poolwagens/trips'

const NOW = new Date('2026-11-04T12:00:00Z')
const h = (hours: number) => new Date(NOW.getTime() + hours * 3600_000).toISOString()

const res = (id: string, car: string, start: number, end: number, extra: Partial<{ departed_at: string | null; arrived_at: string | null }> = {}) => ({
  id, car_id: car, start_at: h(start), end_at: h(end), departed_at: null as string | null, arrived_at: null as string | null, ...extra,
})

describe('tripState', () => {
  it('gepland, onderweg, te laat, teruggebracht', () => {
    expect(tripState(res('a', 'c', 1, 2), NOW)).toBe('gepland')
    expect(tripState(res('a', 'c', -1, 2, { departed_at: h(-1) }), NOW)).toBe('onderweg')
    expect(tripState(res('a', 'c', -3, -1, { departed_at: h(-3) }), NOW)).toBe('te_laat')
    expect(tripState(res('a', 'c', -3, -1, { departed_at: h(-3), arrived_at: h(-0.5) }), NOW)).toBe('teruggebracht')
    expect(isOpenTrip(res('a', 'c', -3, -1, { departed_at: h(-3) }), NOW)).toBe(true)
  })
})

describe('endangeredReservations (te laat terug)', () => {
  it('de eerstvolgende reservatie binnen 24 uur op dezelfde wagen', () => {
    const list = [
      res('late', 'c1', -5, -1, { departed_at: h(-5) }),
      res('next', 'c1', 2, 4),
      res('later', 'c1', 6, 8),
      res('other-car', 'c2', 1, 2),
    ]
    expect([...endangeredReservations(list, NOW)]).toEqual([['next', 'late']])
  })

  it('niets als de volgende verder dan 24 uur ligt', () => {
    expect(endangeredReservations([res('late', 'c1', -5, -1, { departed_at: h(-5) }), res('next', 'c1', 30, 32)], NOW).size).toBe(0)
  })

  it('niets als de rit niet te laat is of al terug', () => {
    expect(endangeredReservations([res('ok', 'c1', -1, 1, { departed_at: h(-1) }), res('next', 'c1', 2, 3)], NOW).size).toBe(0)
    expect(endangeredReservations([res('back', 'c1', -5, -1, { departed_at: h(-5), arrived_at: h(-0.5) }), res('next', 'c1', 2, 3)], NOW).size).toBe(0)
  })

  it('een reservatie die al begon maar niet kon vertrekken, komt ook in het gedrang', () => {
    const list = [res('late', 'c1', -5, -2, { departed_at: h(-5) }), res('next', 'c1', -1, 3)]
    expect(endangeredReservations(list, NOW).get('next')).toBe('late')
  })
})

describe('rechten op een reservatie (zoals de database)', () => {
  const mine = { user_id: 'u1', created_by: 'u1', departed_at: null }
  it('eigen reservatie zolang de rit niet gestart is', () => {
    expect(canChangeReservation(mine, 'u1', false)).toBe(true)
    expect(canChangeReservation({ ...mine, departed_at: h(-1) }, 'u1', false)).toBe(false)
    expect(canChangeReservation(mine, 'u2', false)).toBe(false)
  })
  it('beheer altijd', () => {
    expect(canChangeReservation({ ...mine, departed_at: h(-1) }, 'u2', true)).toBe(true)
  })
  it('vertrek/aankomst: eigen rit of beheer', () => {
    expect(canRegisterTrip(mine, 'u1', false)).toBe(true)
    expect(canRegisterTrip(mine, 'u2', false)).toBe(false)
    expect(canRegisterTrip(mine, 'u2', true)).toBe(true)
  })
})
