import { describe, it, expect } from 'vitest'
import { likeEscape, orIlikeExact, statusFilter } from '@/lib/planning-like'

describe('planning-like', () => {
  it('laat een gewone naam ongemoeid', () => {
    expect(orIlikeExact('value', 'Verlof')).toBe('value.ilike."Verlof"')
  })

  it('maakt van % en _ geen patroon, verdubbeld voor binnen aanhalingstekens', () => {
    expect(likeEscape('50%_x')).toBe('50\\%\\_x')
    expect(orIlikeExact('value', 'S%')).toBe('value.ilike."S\\\\%"')
  })

  it('zet komma en haakjes veilig tussen aanhalingstekens', () => {
    expect(orIlikeExact('value', 'a,b (c)')).toBe('value.ilike."a,b (c)"')
  })

  it('ontsnapt een aanhalingsteken', () => {
    expect(orIlikeExact('value', 'a"b')).toBe('value.ilike."a\\"b"')
  })

  it('combineert meerdere namen met komma', () => {
    expect(statusFilter('value_pm', ['PS', 'PS - THUIS'])).toBe('value_pm.ilike."PS",value_pm.ilike."PS - THUIS"')
  })
})
