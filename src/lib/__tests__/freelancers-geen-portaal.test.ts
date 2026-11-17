import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Fase 3 van docs/freelancers-overzicht.md: freelancers hebben geen portaal,
// geen link, geen pincode, geen opdrachten en geen account meer. Deze test
// doorzoekt alle code in src/ (zonder de tests zelf) en faalt bij elke
// verwijzing die dat weer zou binnenbrengen.

const ROOT = path.resolve(__dirname, '../../..')

function files(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p)
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [p] : []
  })
}
const SOURCES = files(path.join(ROOT, 'src')).map(p => ({ rel: path.relative(ROOT, p), src: fs.readFileSync(p, 'utf8') }))

// Nergens meer: het portaal, de publieke link, pincodes, opdrachten, reviews.
const FORBIDDEN: [string, RegExp][] = [
  ['/portal', /['"`(\s]\/portal\b|\/api\/portal/],
  ['/f (publieke freelancerlink)', /['"`]\/f(\/|#|['"`?])|\/api\/public\/f\b/],
  ['freelancer_links', /freelancer_links/],
  ['freelancer_assignment(s/_files/_events)', /freelancer_assignment/],
  ['freelancer_reviews', /freelancer_reviews/],
  ['freelancer_stats', /freelancer_stats/],
  ['pincode-routes', /link\/pin|freelancer_link_pin/],
  ['portaalcomponenten', /FreelancerPortal|PortalLogout|FreelancerInviteModal/],
  ['opdrachtroutes', /api\/freelancers\/[^'"`]*assignments|freelancers\/match/],
]

// De vlag app_metadata.freelancer mag alleen nog in de bestaande blokkades
// (B5: harmloos zolang geen account de vlag draagt; opruimen is later werk).
const FLAG = /app_metadata\??\.freelancer\b|isFreelancerUser|->>\s*'freelancer'|\bfreelancer\s*:\s*true|\['freelancer'\]/
const FLAG_ALLOWED = new Set([
  'src/lib/auth-permissions.ts',
  'src/app/api/files/download/route.ts',
  'src/app/api/preassist/download/route.ts',
  'src/app/api/sporthouse/documents/download/route.ts',
  'src/lib/gear/access.ts',
  'src/lib/gear/people.ts',
  'src/lib/poolwagens/access.ts',
  'src/lib/planning-access.ts',
])

describe('freelancers: geen portaal, links, pincodes, opdrachten of accounts', () => {
  for (const [label, re] of FORBIDDEN) {
    it(`nergens nog: ${label}`, () => {
      expect(SOURCES.filter(f => re.test(f.src)).map(f => f.rel)).toEqual([])
    })
  }

  it('app_metadata.freelancer staat alleen nog in de bestaande blokkades', () => {
    expect(SOURCES.filter(f => FLAG.test(f.src) && !FLAG_ALLOWED.has(f.rel)).map(f => f.rel)).toEqual([])
  })

  it('geen code zet de vlag of stuurt op basis ervan door', () => {
    const offenders = SOURCES.filter(f =>
      /freelancer\s*:\s*true/.test(f.src) ||                                   // vlag zetten
      (FLAG.test(f.src) && /redirect|NextResponse\.redirect|router\.(push|replace)/.test(f.src) && !/NextResponse\.json\(\{ error: 'Geen toegang\.' \}/.test(f.src)))
    expect(offenders.map(f => f.rel)).toEqual([])
  })

  it('de bestanden van het portaal en de oude freelancertool bestaan niet meer', () => {
    for (const p of [
      'src/app/portal', 'src/components/portal', 'src/app/api/portal', 'src/app/f', 'src/app/api/public/f',
      'src/components/freelancers/FreelancersPage.tsx', 'src/app/api/freelancers/match',
      'src/app/api/freelancers/[id]/assignments', 'src/app/api/freelancers/[id]/avatar',
      'src/features/freelancers/lib/schemas-legacy.ts',
    ]) expect(fs.existsSync(path.join(ROOT, p)), p).toBe(false)
  })
})
