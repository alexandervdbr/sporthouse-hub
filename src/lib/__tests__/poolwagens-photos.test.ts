import { beforeEach, describe, it, expect, vi } from 'vitest'
import { DRIVE_UPLOAD_URL_PREFIX, mapLimit, parseFinishedUploads, parsePhotoFiles } from '@/lib/poolwagens/photos'

// Schadefoto's tegelijk uploaden: één uploadsessie-verzoek en één
// afrond-verzoek per melding, de map één keer opgezocht, de bytes met
// hoogstens drie tegelijk rechtstreeks naar Drive.

const URL_A = `${DRIVE_UPLOAD_URL_PREFIX}uploadType=resumable&upload_id=a`
const URL_B = `${DRIVE_UPLOAD_URL_PREFIX}uploadType=resumable&upload_id=b`

describe('parsePhotoFiles', () => {
  const ok = { filename: 'kras.jpg', mimeType: 'image/jpeg', fileSize: 1000 }

  it('neemt geldige foto’s over', () => {
    expect(parsePhotoFiles([ok, { ...ok, filename: ' deuk.png ', mimeType: '' }], 0, 10))
      .toEqual({ files: [ok, { filename: 'deuk.png', mimeType: 'application/octet-stream', fileSize: 1000 }] })
  })

  it('weigert te veel foto’s, ook samen met wat er al staat', () => {
    expect(parsePhotoFiles(Array(3).fill(ok), 8, 10)).toEqual({ error: 'Hoogstens 10 foto’s per melding.' })
    expect('files' in parsePhotoFiles(Array(2).fill(ok), 8, 10)).toBe(true)
  })

  it('weigert een leeg of ongeldig verzoek, een svg en een te grote foto', () => {
    expect(parsePhotoFiles([], 0, 10)).toEqual({ error: 'Ongeldig verzoek.' })
    expect(parsePhotoFiles('x', 0, 10)).toEqual({ error: 'Ongeldig verzoek.' })
    expect(parsePhotoFiles([{ ...ok, fileSize: 0 }], 0, 10)).toEqual({ error: 'Ongeldig verzoek.' })
    expect(parsePhotoFiles([{ ...ok, filename: 'logo.svg' }], 0, 10)).toMatchObject({ error: expect.stringContaining('niet ondersteund') })
    expect(parsePhotoFiles([{ ...ok, fileSize: 26 * 1024 * 1024 }], 0, 10)).toEqual({ error: 'kras.jpg is groter dan 25 MB.' })
  })
})

describe('parseFinishedUploads', () => {
  it('alleen Drive-uploadsessies', () => {
    expect(parseFinishedUploads([{ uploadUrl: URL_A, fileSize: 5 }], 10)).toEqual({ uploads: [{ uploadUrl: URL_A, fileSize: 5 }] })
    expect(parseFinishedUploads([{ uploadUrl: 'https://evil.example/x', fileSize: 5 }], 10)).toEqual({ error: 'Ongeldige upload-URL.' })
    expect(parseFinishedUploads([], 10)).toEqual({ error: 'Ongeldig verzoek.' })
    expect(parseFinishedUploads(Array(11).fill({ uploadUrl: URL_A, fileSize: 5 }), 10)).toEqual({ error: 'Ongeldig verzoek.' })
  })
})

describe('mapLimit', () => {
  it('hoogstens zoveel tegelijk, de uitkomsten in volgorde', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimit([30, 10, 20, 5, 15], 3, async (ms, i) => {
      running++; peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, ms))
      running--
      return i * 2
    })
    expect(out).toEqual([0, 2, 4, 6, 8])
    expect(peak).toBe(3)
  })

  it('een lege lijst', async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([])
  })
})

// ── De routes, met Drive en de database nagebootst ──────────────────────────

const drive = vi.hoisted(() => ({
  folderCalls: 0,
  sessions: [] as string[],
  parents: {} as Record<string, string[]>,
}))
const db = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/drive-storage', () => ({
  isSporthouseDriveConfigured: () => true,
  sporthouseRootFolderId: () => 'root',
  driveErrorMessage: () => 'Drive-fout',
  getOrCreateFolderPath: async () => { drive.folderCalls++; return 'folder-1' },
  createResumableUploadSession: async (name: string) => { drive.sessions.push(name); return `${DRIVE_UPLOAD_URL_PREFIX}upload_id=${name}` },
  getResumableUploadResult: async (url: string) => ({ done: true, fileId: url.endsWith('a') ? 'file-a' : 'file-b' }),
  getFileMetadata: async (id: string) => ({ name: `${id}.jpg`, mimeType: 'image/jpeg', parents: drive.parents[id] ?? [] }),
  trashFile: async () => {},
}))
vi.mock('@/lib/poolwagens/server', async importOriginal => ({
  ...(await importOriginal<object>()),
  requirePoolwagens: async () => ({ supabase: { rpc: db.rpc }, user: { id: 'u1' }, access: { manage: false } }),
}))
const target = vi.hoisted(() => ({ adding: [] as number[] }))
vi.mock('@/lib/poolwagens/photo-access', () => ({
  photoTarget: async (_s: unknown, _r: string, _u: string, _m: boolean, adding: number) => { target.adding.push(adding); return { report: {} } },
}))

const uploadSession = await import('@/app/api/poolwagens/damage/upload-session/route')
const finalize = await import('@/app/api/poolwagens/damage/finalize/route')
const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  drive.folderCalls = 0
  drive.sessions = []
  drive.parents = {}
  target.adding = []
  db.rpc.mockReset()
})

describe('upload-session: alle foto’s in één verzoek', () => {
  it('de map één keer, een sessie per foto, het aantal telt mee', async () => {
    const files = ['a.jpg', 'b.jpg', 'c.jpg'].map(filename => ({ filename, mimeType: 'image/jpeg', fileSize: 10 }))
    const res = (await uploadSession.POST(post({ report_id: 'r1', files })))!
    expect(res.status).toBe(200)
    expect((await res.json()).uploadUrls).toHaveLength(3)
    expect(drive.folderCalls).toBe(1)
    expect(drive.sessions).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(target.adding).toEqual([3])
  })

  it('een ongeldige foto: niets geopend', async () => {
    const res = (await uploadSession.POST(post({ report_id: 'r1', files: [{ filename: 'x.svg', fileSize: 10 }] })))!
    expect(res.status).toBe(400)
    expect(drive.folderCalls).toBe(0)
  })
})

describe('finalize: alle foto’s in één verzoek, per foto een uitkomst', () => {
  it('de map één keer; een foto buiten de map wordt geweigerd, de andere opgeslagen', async () => {
    drive.parents = { 'file-a': ['folder-1'], 'file-b': ['elders'] }
    db.rpc.mockResolvedValue({ data: 'photo-1', error: null })
    const res = (await finalize.POST(post({ report_id: 'r1', uploads: [{ uploadUrl: URL_A, fileSize: 5 }, { uploadUrl: URL_B, fileSize: 5 }] })))!
    expect(res.status).toBe(200)
    expect((await res.json()).results).toEqual([
      { ok: true, id: 'photo-1', filename: 'file-a.jpg' },
      { ok: false, error: 'Deze foto hoort niet bij deze melding.' },
    ])
    expect(drive.folderCalls).toBe(1)
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })

  it('een sessie-URL die niet van Drive is: 400, niets gevraagd', async () => {
    const res = (await finalize.POST(post({ report_id: 'r1', uploads: [{ uploadUrl: 'https://evil.example/x', fileSize: 5 }] })))!
    expect(res.status).toBe(400)
    expect(drive.folderCalls).toBe(0)
  })
})
