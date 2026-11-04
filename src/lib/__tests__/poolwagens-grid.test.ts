import { describe, it, expect } from 'vitest'
import { buildPoolGrid } from '@/lib/poolwagens/grid'
import type { PoolCar, PoolPlanning, PoolReservation } from '@/lib/poolwagens/types'

// Een venster van 10 dagen (1–10 november, UTC voor de eenvoud): 1 dag = 10%.
const W = { startMs: Date.parse('2026-11-01T00:00:00Z'), endMs: Date.parse('2026-11-11T00:00:00Z') }
const NOW = new Date('2026-11-05T12:00:00Z')

const car = (id: string, extra: Partial<PoolCar> = {}): PoolCar => ({
  id, name: `Wagen ${id}`, license_plate: id, make_model: null, current_km: 0,
  manual_block: false, manual_block_note: null, archived_at: null, created_at: '2026-01-01T00:00:00Z', ...extra,
})
const res = (id: string, carId: string, start: string, end: string, extra: Partial<PoolReservation> = {}): PoolReservation => ({
  id, car_id: carId, user_id: 'u2', person_name: 'Bram Peeters', project: { id: 'p', name: 'Croky' },
  start_at: start, end_at: end, note: null, departed_at: null, departure_km: null, arrived_at: null, arrival_km: null,
  driven_km: null, created_by: 'u2', ...extra,
})
const plan = (p: Partial<PoolPlanning>): PoolPlanning => ({ cars: [], reservations: [], blockingDamage: [], now: NOW.toISOString(), ...p })

describe('buildPoolGrid', () => {
  it('een rij per actieve wagen, alfabetisch; gearchiveerd valt weg', () => {
    const rows = buildPoolGrid(plan({ cars: [car('b'), car('a'), car('z', { archived_at: '2026-01-01T00:00:00Z' })] }), W, 'u1', NOW)
    expect(rows.map(r => r.car.id)).toEqual(['a', 'b'])
  })

  it('zet de balk op het uur', () => {
    const [row] = buildPoolGrid(plan({
      cars: [car('a')],
      reservations: [res('r', 'a', '2026-11-07T12:00:00Z', '2026-11-08T00:00:00Z')],
    }), W, 'u1', NOW)
    expect(row.bars).toHaveLength(1)
    expect(row.bars[0].left).toBeCloseTo(65)
    expect(row.bars[0].width).toBeCloseTo(5)
    expect(row.bars[0]).toMatchObject({ state: 'gepland', label: 'Bram · Croky', mine: false, continuesBefore: false, continuesAfter: false })
  })

  it('knipt af aan de rand van het venster en laat wat erbuiten valt weg', () => {
    const [row] = buildPoolGrid(plan({
      cars: [car('a')],
      reservations: [
        res('over', 'a', '2026-10-30T00:00:00Z', '2026-11-02T00:00:00Z'),
        res('buiten', 'a', '2026-11-20T00:00:00Z', '2026-11-21T00:00:00Z'),
      ],
    }), W, 'u1', NOW)
    expect(row.bars.map(b => b.reservationId)).toEqual(['over'])
    expect(row.bars[0]).toMatchObject({ left: 0, continuesBefore: true })
    expect(row.bars[0].width).toBeCloseTo(10)
  })

  it('te laat: rood stuk tot nu, en de volgende reservatie in het gedrang', () => {
    const [row] = buildPoolGrid(plan({
      cars: [car('a')],
      reservations: [
        res('late', 'a', '2026-11-05T00:00:00Z', '2026-11-05T06:00:00Z', { departed_at: '2026-11-05T00:00:00Z', departure_km: 0, user_id: 'u1' }),
        res('next', 'a', '2026-11-05T14:00:00Z', '2026-11-05T18:00:00Z'),
      ],
    }), W, 'u1', NOW)
    const late = row.bars.find(b => b.reservationId === 'late')!
    expect(late).toMatchObject({ state: 'te_laat', mine: true })
    expect(late.lateLeft).toBeCloseTo(42.5)
    expect(late.lateWidth).toBeCloseTo(2.5)
    expect(row.bars.find(b => b.reservationId === 'next')!.endangered).toBe(true)
  })

  it('een geblokkeerde wagen markeert lopende en komende reservaties, niet afgelopen', () => {
    const [row] = buildPoolGrid(plan({
      cars: [car('a')],
      reservations: [
        res('voorbij', 'a', '2026-11-02T08:00:00Z', '2026-11-02T10:00:00Z', { departed_at: '2026-11-02T08:00:00Z', arrived_at: '2026-11-02T10:00:00Z' }),
        res('komend', 'a', '2026-11-08T08:00:00Z', '2026-11-08T10:00:00Z'),
      ],
      blockingDamage: [{ id: 'd', car_id: 'a', created_at: '2026-11-05T09:00:00Z' }],
    }), W, 'u1', NOW)
    expect(row.block?.kind).toBe('schade')
    expect(row.bars.find(b => b.reservationId === 'voorbij')!.blocked).toBe(false)
    expect(row.bars.find(b => b.reservationId === 'komend')!.blocked).toBe(true)
  })

  it('een teruggebrachte rit wordt getekend van vertrek tot aankomst', () => {
    const [row] = buildPoolGrid(plan({
      cars: [car('a')],
      reservations: [res('r', 'a', '2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z', {
        departed_at: '2026-11-02T00:00:00Z', arrived_at: '2026-11-02T12:00:00Z',
      })],
    }), W, 'u1', NOW)
    expect(row.bars[0].state).toBe('teruggebracht')
    expect(row.bars[0].width).toBeCloseTo(5)
  })
})
