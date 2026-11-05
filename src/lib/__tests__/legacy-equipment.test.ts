import { describe, it, expect } from 'vitest'
import { isLegacyEquipmentWrite } from '@/lib/legacy-equipment'

describe('isLegacyEquipmentWrite', () => {
  it('blokkeert schrijven naar elke API van de oude planner', () => {
    for (const [method, path] of [
      ['POST', '/api/equipment'], ['PATCH', '/api/equipment'], ['DELETE', '/api/equipment'],
      ['POST', '/api/equipment-projects'], ['PATCH', '/api/equipment-projects'], ['DELETE', '/api/equipment-projects'],
      ['POST', '/api/reservations'], ['DELETE', '/api/reservations/abc'],
      ['POST', '/api/day-projects'],
      ['POST', '/api/external-rentals'], ['DELETE', '/api/external-rentals/abc'],
      ['put', '/api/equipment'],
    ]) expect(isLegacyEquipmentWrite(method, path), `${method} ${path}`).toBe(true)
  })

  it('lezen blijft kunnen', () => {
    for (const path of ['/api/equipment', '/api/reservations', '/api/reservations/stats', '/api/day-projects', '/api/external-rentals']) {
      expect(isLegacyEquipmentWrite('GET', path)).toBe(false)
      expect(isLegacyEquipmentWrite('HEAD', path)).toBe(false)
    }
  })

  it('raakt de nieuwe planner en paden die er alleen op lijken niet', () => {
    expect(isLegacyEquipmentWrite('POST', '/api/materiaal/bookings')).toBe(false)
    expect(isLegacyEquipmentWrite('DELETE', '/api/materiaal/categories')).toBe(false)
    expect(isLegacyEquipmentWrite('POST', '/api/equipmentx')).toBe(false)
    expect(isLegacyEquipmentWrite('POST', '/api/reservationsbackup')).toBe(false)
    expect(isLegacyEquipmentWrite('POST', '/equipment')).toBe(false)
  })
})
