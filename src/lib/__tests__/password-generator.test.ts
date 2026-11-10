import { describe, it, expect } from 'vitest'
import { generatePassword, DEFAULT_PASSWORD_LENGTH } from '../password-generator'

describe('generatePassword', () => {
  it('heeft standaard de afgesproken lengte', () => {
    expect(generatePassword()).toHaveLength(DEFAULT_PASSWORD_LENGTH)
    expect(generatePassword(12)).toHaveLength(12)
  })

  it('bevat altijd elk soort teken', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword(4)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[0-9]/)
      expect(pw).toMatch(/[^a-zA-Z0-9]/)
    }
  })

  it('gebruikt geen tekens die op elkaar lijken', () => {
    for (let i = 0; i < 200; i++) expect(generatePassword()).not.toMatch(/[0O1lI]/)
  })

  it('geeft telkens iets anders', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generatePassword()))
    expect(seen.size).toBe(100)
  })

  it('weigert een te korte lengte', () => {
    expect(() => generatePassword(3)).toThrow()
  })
})
