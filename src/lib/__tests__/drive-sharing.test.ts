import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Publieke Drive-delingen ("iedereen met de link") gebeuren nooit meer
// vanzelf. Vroeger deelden uploadFile() en getFileMetadata() ELK bestand —
// ook de interne Sporthouse-documenten en de schadefoto's van poolwagens —
// en gaf google-drive.ts nieuwe documenten zelfs bewerkrechten voor iedereen.
//
// Deze test faalt als:
//   - uploadFile() of getFileMetadata() weer vanzelf deelt
//   - google-drive.ts weer deelt
//   - er een nieuwe plek bijkomt die deelt, zonder dat ze hieronder staat

// Elke plek die bewust een publieke deling maakt, met de reden.
const ALLOWED_SHARE_CALLERS: Record<string, string> = {
  // De downloadknop van Pré-assist is de Drive-link zelf (geen video door onze
  // function). Beslissing hierover volgt na de Drive-audit.
  'src/app/api/preassist/finalize/route.ts': 'Pré-assist-download via Drive',
}
// Plekken die zelf permissions.create met type 'anyone' aanroepen.
const ALLOWED_RAW_ANYONE: Record<string, string> = {
  'src/lib/drive-storage.ts': 'shareWithAnyoneWithLink(), de enige algemene deelfunctie',
  // Freelancertool (nog niet op main): één bestand, ná de rechtencheck, en na
  // 1 uur weer ingetrokken. Zie docs/freelancers-redesign.md §4.4.
  'src/features/freelancers/lib/drive-files.ts': 'tijdelijke deling van één freelancerbestand',
}

const ROOT = path.resolve(__dirname, '../../..')
function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(n => {
    const p = path.join(dir, n)
    return fs.statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.(ts|tsx|mjs)$/.test(n) ? [p] : []
  })
}
const sources = () => [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))]
  .map(p => ({ rel: path.relative(ROOT, p), src: fs.readFileSync(p, 'utf8') }))

describe('publieke Drive-delingen — wie mag delen', () => {
  it('alleen de toegelaten plekken roepen shareWithAnyoneWithLink() aan', () => {
    const callers = sources()
      .filter(f => f.rel !== 'src/lib/drive-storage.ts' && /shareWithAnyoneWithLink\(/.test(f.src))
      .map(f => f.rel)
    expect(callers.sort()).toEqual(Object.keys(ALLOWED_SHARE_CALLERS).sort())
  })

  it("alleen de toegelaten bestanden maken zelf een 'anyone'-permissie", () => {
    const raw = sources()
      .filter(f => /permissions\.create\(/.test(f.src) && /type:\s*['"]anyone['"]/.test(f.src))
      .map(f => f.rel)
    for (const f of raw) expect(Object.keys(ALLOWED_RAW_ANYONE), f).toContain(f)
  })

  it('niemand vraagt uploadFile(..., { public: true }) zonder in de lijst te staan', () => {
    const hits = sources().filter(f => f.rel !== 'src/lib/drive-storage.ts' && /uploadFile\([^)]*public:\s*true/.test(f.src)).map(f => f.rel)
    for (const h of hits) expect(Object.keys(ALLOWED_SHARE_CALLERS), h).toContain(h)
  })

  it('de oude interne naam sharePublicly bestaat niet meer (geen verborgen deler)', () => {
    expect(sources().filter(f => /\bsharePublicly\b/.test(f.src)).map(f => f.rel)).toEqual([])
  })
})

// ── Gedrag, met een nagemaakte Google Drive ─────────────────────────────────

const calls: { op: string; args: unknown }[] = []
const fakeDrive = {
  files: {
    create: async (args: unknown) => { calls.push({ op: 'files.create', args }); return { data: { id: 'f1', name: 'x', mimeType: 'text/plain', webViewLink: 'https://drive/x' } } },
    get: async (args: unknown) => { calls.push({ op: 'files.get', args }); return { data: { id: 'f1', name: 'x', mimeType: 'text/plain', parents: ['p'] } } },
    list: async () => ({ data: { files: [{ id: 'folder-1' }] } }),
  },
  permissions: {
    create: async (args: unknown) => { calls.push({ op: 'permissions.create', args }); return { data: { id: 'perm' } } },
  },
}
vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: class { async getAccessToken() { return { token: 't' } } } },
    drive: () => fakeDrive,
  },
}))

process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = 'sa@example.iam.gserviceaccount.com'
process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY = 'sleutel'
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'docs@example.iam.gserviceaccount.com'
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = 'sleutel'

const storage = await import('@/lib/drive-storage')
const docs = await import('@/lib/google-drive')
const shares = () => calls.filter(c => c.op === 'permissions.create')

beforeEach(() => { calls.length = 0 })

describe('publieke Drive-delingen — gedrag', () => {
  it('getFileMetadata() deelt niet', async () => {
    await storage.getFileMetadata('f1')
    expect(calls.map(c => c.op)).toEqual(['files.get'])
  })

  it('uploadFile() deelt standaard niet, ook niet met public: false', async () => {
    await storage.uploadFile(Buffer.from('x'), 'a.txt', 'text/plain', 'map')
    await storage.uploadFile(Buffer.from('x'), 'b.txt', 'text/plain', 'map', { public: false })
    expect(shares()).toEqual([])
  })

  it('uploadFile(..., { public: true }) deelt bewust, als lezer', async () => {
    await storage.uploadFile(Buffer.from('x'), 'c.txt', 'text/plain', 'map', { public: true })
    expect(shares()).toHaveLength(1)
    expect(shares()[0].args).toMatchObject({ fileId: 'f1', requestBody: { role: 'reader', type: 'anyone' } })
  })

  it('google-drive.ts maakt een document zonder enige deling (geen bewerker voor iedereen)', async () => {
    await docs.createDriveFile('document', 'Notities', 'klant-1', 'Klant')
    expect(shares()).toEqual([])
  })
})
