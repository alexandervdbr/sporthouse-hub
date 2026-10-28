import crypto from 'crypto'

// Eén token voor de gedeelde Mijn gedacht!-snelkoppeling.
//
// De persoonlijke tokens staan in de database (user_api_tokens). Dat ging mis
// toen de database verloren ging: elke gedeelde kopie van de snelkoppeling
// bevatte de token van één persoon, en die bestond niet meer. Een kopie op
// iemands telefoon kan je niet op afstand bijwerken, dus elke collega moest
// opnieuw importeren. Deze token staat in Vercel (SAVE_REEL_TEAM_TOKEN) en
// overleeft dus de database; wijzigen kan alleen daar, niet per ongeluk met
// "Nieuwe token aanmaken".
//
// Te kort ingesteld telt als niet ingesteld: een raadbare token zou iedereen
// laten posten.
const MIN_LENGTH = 32

export function teamToken(): string | null {
  const value = process.env.SAVE_REEL_TEAM_TOKEN?.trim()
  return value && value.length >= MIN_LENGTH ? value : null
}

export function isTeamToken(candidate: string): boolean {
  const expected = teamToken()
  if (!expected) return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
