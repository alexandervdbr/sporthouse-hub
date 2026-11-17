import { beforeEach, describe, expect, it, vi } from 'vitest'

// De mails van de materiaalplanner van begin tot eind: mail-server.ts met een
// nagemaakte database (alleen wat het gebruikt) en een nagemaakt mailscript.
// Wat telt: hoeveel mails er vertrekken, naar wie, en wat erin staat.

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
let seq = 0

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: { kind: 'select' } | { kind: 'update'; values: Row } | { kind: 'insert'; row: Row } = { kind: 'select' }
  const rows = () => (db[table] ??= [])
  const withNested = (r: Row) => table === 'gear_bookings'
    ? { ...r, gear_booking_items: (db.gear_booking_items ?? []).filter(l => l.booking_id === r.id) }
    : r
  const run = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (op.kind === 'insert') {
      const row = op.row
      if (table === 'gear_mail_log' && rows().some(r => r.booking_id === row.booking_id && r.kind === row.kind && r.key === row.key && r.recipient === row.recipient)) {
        return { data: null, error: { code: '23505', message: 'dubbel' } }
      }
      const saved = { id: `log${++seq}`, ...row }
      rows().push(saved)
      return { data: saved, error: null }
    }
    const hit = rows().filter(r => filters.every(f => f(r)))
    if (op.kind === 'update') { for (const r of hit) Object.assign(r, op.values); return { data: null, error: null } }
    return { data: hit.map(withNested), error: null }
  }
  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return b },
    is: (k: string, v: unknown) => { filters.push(r => (r[k] ?? null) === v); return b },
    in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return b },
    update: (values: Row) => { op = { kind: 'update', values }; return b },
    insert: (row: Row) => { op = { kind: 'insert', row }; return b },
    maybeSingle: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data } },
    single: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data } },
    then: (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

const users: Record<string, string> = { bram: 'bram@sporthouse.be', jan: 'jan@sporthouse.be' }
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (t: string) => query(t),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: users[id] ? { email: users[id] } : null } }) } },
  }),
}))

const posts: Record<string, unknown>[] = []
const mails = () => posts.filter(p => 'to' in p) as { to: string; subject: string; text: string }[]
const agenda = () => posts.filter(p => p.action === 'agenda') as { op: string; eventId?: string }[]

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  posts.length = 0
  process.env.MATERIAAL_MAIL_WEBHOOK_URL = 'https://script.google.com/macros/s/TEST/exec'
  process.env.MATERIAAL_MAIL_SECRET = 'x'.repeat(32)
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body)
    posts.push(body)
    return new Response(JSON.stringify({ ok: true, eventId: body.action === 'agenda' ? body.eventId ?? `ev${++seq}` : undefined }), { status: 200 })
  }))
  db.gear_items = [
    { id: 'i1', name: 'FX3 A', sort_order: 1 }, { id: 'i2', name: 'Sony 70-200mm', sort_order: 2 },
    { id: 'i3', name: 'Rode mic', sort_order: 3 }, { id: 'i4', name: 'Statief', sort_order: 4 },
  ]
})

function booking(id: string, end: string, items: string[], extra: Row = {}) {
  ;(db.gear_bookings ??= []).push({
    id, start_date: '2026-11-20', end_date: end, start_time: null, end_time: null, person_name: 'Bram',
    external_name: null, booked_for_user_id: 'bram', freelancer_id: null, client_id: null, project_id: null,
    note: null, created_by: 'bram', cancelled_at: null, calendar_event_id: null, ...extra,
  })
  for (const item_id of items) (db.gear_booking_items ??= []).push({ booking_id: id, item_id, via_kit_id: null, via_kit_name: null })
}

const { sendDueReminders, sendBookingChanges, calendarAfterMerge } = await import('@/lib/gear/mail-server')

describe('herinnering op de terugbrengdag', () => {
  it('twee boekingen die dezelfde dag eindigen: één mail met allebei, op volgorde van het uur', async () => {
    booking('b1', '2026-11-22', ['i1'], { end_time: '17:00:00' })
    booking('b2', '2026-11-22', ['i2'], { end_time: '09:00:00' })
    const r = await sendDueReminders('2026-11-22')
    expect(mails()).toHaveLength(1)
    expect(mails()[0].to).toBe('bram@sporthouse.be')
    expect(mails()[0].text.indexOf('Terug om 09:00')).toBeLessThan(mails()[0].text.indexOf('Terug om 17:00'))
    expect(r.verstuurd).toBe(1)
    // Het logboek per boeking: twee rijen, allebei verstuurd.
    expect(db.gear_mail_log.filter(l => l.sent_at)).toHaveLength(2)
  })

  it('andere terugbrengdagen: aparte mails, elk op hun dag', async () => {
    booking('b1', '2026-11-22', ['i1'])
    booking('b2', '2026-11-23', ['i2'])
    await sendDueReminders('2026-11-22')
    await sendDueReminders('2026-11-23')
    expect(mails()).toHaveLength(2)
    expect(mails()[0].text).toContain('FX3 A')
    expect(mails()[0].text).not.toContain('Sony 70-200mm')
    expect(mails()[1].text).toContain('Sony 70-200mm')
  })

  it('de job opnieuw draaien verstuurt niets opnieuw', async () => {
    booking('b1', '2026-11-22', ['i1'])
    booking('b2', '2026-11-22', ['i2'])
    await sendDueReminders('2026-11-22')
    const again = await sendDueReminders('2026-11-22')
    expect(mails()).toHaveLength(1)
    expect(again).toMatchObject({ verstuurd: 0, al_verstuurd: 1 })
  })

  it('gewijzigd vóór de ochtend: de herinnering toont de nieuwe gegevens', async () => {
    booking('b1', '2026-11-22', ['i1'], { end_time: '10:00:00' })
    // Gewijzigd: ander materiaal en een ander uur.
    db.gear_booking_items = [{ booking_id: 'b1', item_id: 'i3', via_kit_id: null, via_kit_name: null }]
    db.gear_bookings[0].end_time = '15:00:00'
    await sendDueReminders('2026-11-22')
    expect(mails()[0].text).toContain('Rode mic')
    expect(mails()[0].text).not.toContain('FX3 A')
    expect(mails()[0].text).toContain('om 15:00')
  })
})

describe('wijzigingsmail', () => {
  it('één actie die twee boekingen van dezelfde persoon wijzigt: één mail', async () => {
    booking('b1', '2026-12-30', ['i1'])
    booking('b2', '2026-12-31', ['i2'])
    await sendBookingChanges(['b1', 'b2'])
    expect(mails()).toHaveLength(1)
    expect(mails()[0].subject.startsWith('2 boekingen gewijzigd')).toBe(true)
  })
  it('per persoon een eigen mail', async () => {
    booking('b1', '2026-12-30', ['i1'])
    booking('b2', '2026-12-30', ['i2'], { booked_for_user_id: 'jan', created_by: 'jan', person_name: 'Jan' })
    await sendBookingChanges(['b1', 'b2'])
    expect(mails().map(m => m.to).sort()).toEqual(['bram@sporthouse.be', 'jan@sporthouse.be'])
  })
  it('dezelfde toestand nooit twee keer; een nieuwe wijziging wel', async () => {
    booking('b1', '2026-12-30', ['i1'])
    await sendBookingChanges(['b1'])
    await sendBookingChanges(['b1'])
    expect(mails()).toHaveLength(1)
    db.gear_booking_items.push({ booking_id: 'b1', item_id: 'i4', via_kit_id: null, via_kit_name: null })
    await sendBookingChanges(['b1'])
    expect(mails()).toHaveLength(2)
  })
  it('een boeking die al voorbij is: geen mail', async () => {
    booking('b1', '2020-01-01', ['i1'])
    await sendBookingChanges(['b1'])
    expect(mails()).toHaveLength(0)
  })
})

describe('samenvoegen', () => {
  it('geen mail; één afspraak blijft, de andere verdwijnt stil', async () => {
    booking('t', '2026-12-30', ['i1', 'i2'], { calendar_event_id: 'evT' })
    booking('a', '2026-12-30', [], { calendar_event_id: 'evA', cancelled_at: '2026-11-17T10:00:00Z', merged_into_id: 't' })
    await calendarAfterMerge('t', ['a'])
    expect(mails()).toHaveLength(0)
    expect(agenda()).toEqual([
      expect.objectContaining({ op: 'delete', eventId: 'evA' }),
      expect.objectContaining({ op: 'upsert', eventId: 'evT' }),
    ])
  })
  it('had de boeking die blijft geen afspraak: ze neemt die van een opgenomen boeking over', async () => {
    booking('t', '2026-12-30', ['i1'])
    booking('a', '2026-12-30', [], { calendar_event_id: 'evA', cancelled_at: '2026-11-17T10:00:00Z', merged_into_id: 't' })
    await calendarAfterMerge('t', ['a'])
    expect(mails()).toHaveLength(0)
    expect(agenda()).toEqual([expect.objectContaining({ op: 'upsert', eventId: 'evA' })])
    expect(db.gear_bookings.find(b => b.id === 't')?.calendar_event_id).toBe('evA')
  })
})
