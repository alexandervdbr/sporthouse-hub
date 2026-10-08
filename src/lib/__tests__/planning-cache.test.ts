import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  monthCacheKey, readCachedMonth, writeCachedMonth,
  clearPlanningCache, clearPlanningMonthCache,
  IDENTITY_KEY, IDENTITY_ACCOUNT_KEY, CONFIG_CACHE_KEY,
  type PlanningRow,
} from '@/lib/planning-cache'

// De cache is bewust nooit gezaghebbend: een misser valt terug op een volledige
// fetch. Maar wat hij wél teruggeeft moet kloppen, want de incrementele sync
// bouwt erop verder — hij vraagt alleen nog wat er veranderd is sinds
// `lastSeen`. Geeft de cache een te oude of te volle kopie terug, dan mist de
// sync rijen zonder dat iets dat merkt.

function makeStorage() {
  let store: Record<string, string> = {}
  let failOnWrite = false
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      if (failOnWrite) throw new Error('QuotaExceededError')
      store[k] = v
    },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
    setFailOnWrite: (v: boolean) => { failOnWrite = v },
    raw: () => store,
  }
}

let storage: ReturnType<typeof makeStorage>

function row(day: number): PlanningRow {
  return {
    year: 2026, month: 10, day, contact_id: 'c0ffee00-0000-4000-8000-000000000001',
    value: 'SHG', bold: true, text_color: '#fff', bg_color: null, note: null,
    updated_by: null, updated_at: '2026-10-01T09:00:00Z',
  }
}

beforeEach(() => {
  storage = makeStorage()
  vi.stubGlobal('localStorage', storage)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('monthCacheKey', () => {
  it('onderscheidt dezelfde maand in verschillende jaren', () => {
    expect(monthCacheKey(2026, 3)).not.toBe(monthCacheKey(2027, 3))
  })
})

describe('lezen en schrijven', () => {
  it('geeft terug wat er geschreven is, inclusief lastSeen', () => {
    writeCachedMonth(2026, 10, [row(1), row(2)], '2026-10-01T09:00:00Z')
    const cached = readCachedMonth(2026, 10)
    expect(cached?.rows).toHaveLength(2)
    expect(cached?.lastSeen).toBe('2026-10-01T09:00:00Z')
  })

  it('geeft null voor een maand die er niet in zit', () => {
    expect(readCachedMonth(2026, 11)).toBeNull()
  })

  it('geeft null als de opslag onleesbare rommel bevat', () => {
    storage.setItem('planning-month-cache-v2', 'geen json')
    expect(readCachedMonth(2026, 10)).toBeNull()
  })
})

describe('evictie', () => {
  it('houdt hoogstens vier maanden bij, de oudste vliegen eruit', () => {
    for (let m = 1; m <= 6; m++) {
      vi.setSystemTime(new Date(`2026-10-08T12:0${m}:00Z`))
      writeCachedMonth(2026, m, [row(1)], '2026-10-01T09:00:00Z')
    }
    expect(readCachedMonth(2026, 1)).toBeNull()
    expect(readCachedMonth(2026, 2)).toBeNull()
    expect(readCachedMonth(2026, 3)).not.toBeNull()
    expect(readCachedMonth(2026, 6)).not.toBeNull()
  })

  it('negeert een kopie die ouder is dan een week', () => {
    writeCachedMonth(2026, 10, [row(1)], '2026-10-01T09:00:00Z')
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
    expect(readCachedMonth(2026, 10)).toBeNull()
  })

  it('houdt bij een volle opslag alleen de nieuwste maand over', () => {
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
    writeCachedMonth(2026, 9, [row(1)], '2026-09-01T09:00:00Z')
    vi.setSystemTime(new Date('2026-10-08T12:01:00Z'))

    // Eerste poging faalt (quota), de terugval schrijft alleen de nieuwste.
    let calls = 0
    const real = storage.setItem
    vi.stubGlobal('localStorage', {
      ...storage,
      setItem: (k: string, v: string) => {
        calls++
        if (calls === 1) throw new Error('QuotaExceededError')
        real(k, v)
      },
    })

    writeCachedMonth(2026, 10, [row(1)], '2026-10-01T09:00:00Z')
    expect(readCachedMonth(2026, 10)).not.toBeNull()
    expect(readCachedMonth(2026, 9)).toBeNull()
  })
})

describe('wissen', () => {
  it('clearPlanningMonthCache laat de identiteit met rust', () => {
    writeCachedMonth(2026, 10, [row(1)], '2026-10-01T09:00:00Z')
    storage.setItem(IDENTITY_KEY, 'c0ffee00-0000-4000-8000-000000000001')
    storage.setItem(CONFIG_CACHE_KEY, '[]')

    clearPlanningMonthCache()

    expect(readCachedMonth(2026, 10)).toBeNull()
    expect(storage.getItem(IDENTITY_KEY)).toBe('c0ffee00-0000-4000-8000-000000000001')
    expect(storage.getItem(CONFIG_CACHE_KEY)).toBe('[]')
  })

  it('clearPlanningCache neemt bij uitloggen ook identiteit en rooster mee', () => {
    writeCachedMonth(2026, 10, [row(1)], '2026-10-01T09:00:00Z')
    storage.setItem(IDENTITY_KEY, 'c0ffee00-0000-4000-8000-000000000001')
    storage.setItem(IDENTITY_ACCOUNT_KEY, 'rune@sporthousegroup.com')
    storage.setItem(CONFIG_CACHE_KEY, '[]')

    clearPlanningCache()

    expect(readCachedMonth(2026, 10)).toBeNull()
    expect(storage.getItem(IDENTITY_KEY)).toBeNull()
    expect(storage.getItem(IDENTITY_ACCOUNT_KEY)).toBeNull()
    expect(storage.getItem(CONFIG_CACHE_KEY)).toBeNull()
  })

  it('laat weergavevoorkeuren staan — die horen bij het toestel, niet bij de persoon', () => {
    storage.setItem('planning-active-tab', 'team')
    clearPlanningCache()
    expect(storage.getItem('planning-active-tab')).toBe('team')
  })
})
