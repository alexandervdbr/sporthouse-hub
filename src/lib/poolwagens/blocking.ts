import type { DamageReport, PoolCar } from './types'

// Wanneer een wagen niet gereserveerd kan worden. Dezelfde regel als
// pool_car_block_reason() in de database (0077); de database beslist, dit is
// voor het scherm (rode rij, uitgeschakelde knop, uitleg).

type CarLike = Pick<PoolCar, 'name' | 'manual_block' | 'manual_block_note' | 'archived_at'>
type DamageLike = Pick<DamageReport, 'severity' | 'status' | 'block_lifted_at'>

/** Blokkeert deze melding haar wagen? Ernstig, niet hersteld, niet opgeheven. */
export function isBlockingDamage(d: DamageLike): boolean {
  return d.severity === 'ernstig' && d.status !== 'hersteld' && !d.block_lifted_at
}

export type BlockKind = 'gearchiveerd' | 'handmatig' | 'schade'

export interface CarBlock {
  kind: BlockKind
  /** Zoals de database het zegt, bv. "Bus is niet beschikbaar (onderhoud)". */
  reason: string
}

export function carBlock(car: CarLike, damage: DamageLike[]): CarBlock | null {
  if (car.archived_at) return { kind: 'gearchiveerd', reason: `${car.name} is gearchiveerd` }
  if (car.manual_block) {
    const note = car.manual_block_note?.trim()
    return { kind: 'handmatig', reason: `${car.name} is niet beschikbaar${note ? ` (${note})` : ''}` }
  }
  if (damage.some(isBlockingDamage)) return { kind: 'schade', reason: `${car.name} is geblokkeerd door ernstige schade` }
  return null
}
