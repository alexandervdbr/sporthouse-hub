import { describe, it, expect, vi, beforeEach } from 'vitest'

// De materiaalplanner mailt de freelancer voor wie geboekt is, op het adres
// uit freelancers.email (gear_bookings.freelancer_id → freelancers.id), en
// zet hem als gast in de agenda-afspraak. Het freelanceroverzicht
// (docs/freelancers-overzicht.md) mag daar niets aan veranderen.

const F = '11111111-1111-4111-8111-111111111111'
const state: { calls: string[]; mailLog: { recipient: string }[]; scriptCalls: Record<string, unknown>[] } = { calls: [], mailLog: [], scriptCalls: [] }

const booking = {
  id: 'b1', start_date: '2099-05-01', end_date: '2099-05-02', start_time: null, end_time: null,
  person_name: null, external_name: null, booked_for_user_id: null, freelancer_id: F,
  client_id: null, project_id: null, note: null, created_by: 'u-maker', cancelled_at: null, calendar_event_id: null,
  gear_booking_items: [],
}

function builder(table: string) {
  const q: Record<string, unknown> = {}
  let op = 'select'
  for (const m of ['select', 'in', 'is', 'order']) q[m] = () => q
  q.eq = (col: string, val: unknown) => { state.calls.push(`${table}.eq:${col}=${val}`); return q }
  q.insert = (payload: { recipient: string }) => { op = 'insert'; if (table === 'gear_mail_log') state.mailLog.push(payload); return q }
  q.update = () => { op = 'update'; return q }
  q.single = async () => ({ data: { id: `log${state.mailLog.length}` }, error: null })
  q.maybeSingle = async () => {
    if (table === 'gear_bookings') return { data: booking, error: null }
    if (table === 'freelancers') return { data: { email: 'jana@example.com' }, error: null }
    return { data: null, error: null }
  }
  q.then = (resolve: (v: unknown) => void) => resolve({ data: op === 'select' ? [] : null, error: null })
  return q
}

const admin = {
  from: (t: string) => builder(t),
  auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: id === 'u-maker' ? 'maker@sporthouse.be' : null } } }) } },
}
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => admin, createClient: async () => admin }))

const { sendBookingConfirmation } = await import('@/lib/gear/mail-server')

beforeEach(() => {
  state.calls = []; state.mailLog = []; state.scriptCalls = []
  vi.stubEnv('MATERIAAL_MAIL_WEBHOOK_URL', 'https://script.google.com/macros/s/abc/exec')
  vi.stubEnv('MATERIAAL_MAIL_SECRET', 'x'.repeat(40))
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    state.scriptCalls.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ ok: true, eventId: 'ev1' }), { status: 200 })
  }))
})

describe('materiaalplanner — mail naar de freelancer', () => {
  it('zoekt het e-mailadres op in freelancers via freelancer_id en mailt het', async () => {
    await sendBookingConfirmation('b1', false)
    expect(state.calls).toContain(`freelancers.eq:id=${F}`)
    expect(state.mailLog.map(r => r.recipient)).toContain('jana@example.com')
    expect(state.mailLog.map(r => r.recipient)).toContain('maker@sporthouse.be')
  })

  it('zet de freelancer als gast in de agenda-afspraak (en de maker niet)', async () => {
    await sendBookingConfirmation('b1', false)
    const agenda = state.scriptCalls.find(c => c.action === 'agenda') as { event: { guests?: string[] } } | undefined
    expect(agenda).toBeTruthy()
    expect(JSON.stringify(agenda!.event)).toContain('jana@example.com')
    expect(JSON.stringify(agenda!.event)).not.toContain('maker@sporthouse.be')
  })
})
