import { describe, it, expect, afterEach } from 'vitest'
import { isTeamToken, teamToken } from '@/lib/reel-team-token'

const GOED = 'a'.repeat(64)

describe('teamtoken van de gedeelde snelkoppeling', () => {
  afterEach(() => { delete process.env.SAVE_REEL_TEAM_TOKEN })

  it('herkent de ingestelde token en niets anders', () => {
    process.env.SAVE_REEL_TEAM_TOKEN = GOED
    expect(isTeamToken(GOED)).toBe(true)
    expect(isTeamToken('a'.repeat(63))).toBe(false)
    expect(isTeamToken('b'.repeat(64))).toBe(false)
  })

  it('negeert spaties rond de waarde in Vercel', () => {
    process.env.SAVE_REEL_TEAM_TOKEN = `  ${GOED}\n`
    expect(isTeamToken(GOED)).toBe(true)
  })

  it('laat niemand binnen als er geen of een te korte token is ingesteld', () => {
    expect(teamToken()).toBeNull()
    expect(isTeamToken('')).toBe(false)
    process.env.SAVE_REEL_TEAM_TOKEN = 'kort'
    expect(teamToken()).toBeNull()
    expect(isTeamToken('kort')).toBe(false)
  })
})
