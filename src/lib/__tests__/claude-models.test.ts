import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Claude-modellen in de app.
//  1. Geen enkel uitgefaseerd (of binnenkort uitgefaseerd) model-ID meer in
//     src/: een request naar zo'n model mislukt.
//  2. /api/chat (de documentchat per klant) vraagt Sonnet 5.5, met de
//     server-side fallback bij een weigering, en stuurt alleen tekst door.
//
// Bron voor de lijst: de modeltabel van Anthropic (stand november 2026).
// Komt er een model bij dat uitgefaseerd wordt, zet het hieronder.

const RETIRED_OR_RETIRING = [
  'claude-sonnet-4-20250514', 'claude-sonnet-4-0',          // uitgefaseerd 15 juni 2026
  'claude-sonnet-4-5-20250929', 'claude-sonnet-4-5',        // uitgefaseerd 30 november 2026
  'claude-opus-4-1', 'claude-opus-4-0', 'claude-opus-4-20250514',
  'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-haiku', 'claude-3-opus',
]

const ROOT = path.resolve(__dirname, '../../..')
function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(n => {
    const p = path.join(dir, n)
    return fs.statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.(ts|tsx|js|mjs)$/.test(n) ? [p] : []
  })
}

describe('geen uitgefaseerde Claude-modellen', () => {
  it('src/ en scripts/ noemen geen uitgefaseerd of bijna-uitgefaseerd model', () => {
    const hits: string[] = []
    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))]) {
      const src = fs.readFileSync(file, 'utf8')
      for (const id of RETIRED_OR_RETIRING) {
        if (new RegExp(`['"\`]${id.replace(/[.-]/g, m => `\\${m}`)}(['"\`]|-\\d)`).test(src)) hits.push(`${path.relative(ROOT, file)}: ${id}`)
      }
    }
    expect(hits).toEqual([])
  })
})

// ── /api/chat ───────────────────────────────────────────────────────────────

const state: { user: unknown; params: Record<string, unknown> | null; stop: string; text: string[] } = {
  user: null, params: null, stop: 'end_turn', text: [],
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.single = async () => ({ data: { name: 'Klant' } })
      q.then = (res: (v: unknown) => void) => res({ data: t === 'documents' ? [{ title: 'Doc', content: 'Inhoud over tickets' }] : [] })
      return q
    },
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          state.params = params
          const events = [
            { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'intern' } },
            ...state.text.map(t => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })),
          ]
          return {
            async *[Symbol.asyncIterator]() { for (const e of events) yield e },
            finalMessage: async () => ({ stop_reason: state.stop }),
          }
        },
      },
    }
  },
}))

const chat = await import('@/app/api/chat/route')
const req = (body: unknown) => new Request('http://hub.test/api/chat', { method: 'POST', body: JSON.stringify(body) })
const read = async (res: Response) => await res.text()

beforeEach(() => { state.user = { id: 'u1' }; state.params = null; state.stop = 'end_turn'; state.text = [] })

describe('/api/chat', () => {
  it('vraagt Sonnet 5.5 met de server-side fallback, zonder verwijderde parameters', async () => {
    state.text = ['Hallo', ' daar']
    const res = (await chat.POST(req({ clientId: 'c1', messages: [{ role: 'user', content: 'tickets?' }] }) as never))!
    expect(res.status).toBe(200)
    const body = await read(res)
    expect(state.params).toMatchObject({
      model: 'claude-sonnet-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'],
    })
    for (const gone of ['temperature', 'top_p', 'top_k', 'budget_tokens', 'thinking']) expect(state.params).not.toHaveProperty(gone)
    // alleen tekst door, geen denkblokken
    expect(body).toContain('"text":"Hallo"')
    expect(body).not.toContain('intern')
    expect(body.trim().endsWith('data: [DONE]')).toBe(true)
  })

  it('een weigering wordt een duidelijke foutmelding in de stream', async () => {
    state.stop = 'refusal'
    const res = (await chat.POST(req({ clientId: 'c1', messages: [{ role: 'user', content: 'x' }] }) as never))!
    expect(await read(res)).toContain('"error":"De assistent kan deze vraag niet beantwoorden."')
  })

  it('niet ingelogd → 401, zonder Claude', async () => {
    state.user = null
    expect((await chat.POST(req({ clientId: 'c1', messages: [{ role: 'user', content: 'x' }] }) as never))!.status).toBe(401)
    expect(state.params).toBe(null)
  })
})
