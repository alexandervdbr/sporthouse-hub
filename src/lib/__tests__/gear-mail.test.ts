import { describe, it, expect } from 'vitest'
import { MAIL_HEADER, mailPeriod, cancellationMail, confirmationKey, confirmationMail, icsFile, icsSequence, isEmail, mailConfig, mailErrorText, mailRecipients, reminderMail, shouldConfirm, whatShort, type MailBooking } from '@/lib/gear/mail'

const b: MailBooking = {
  id: 'abc', start: '2026-11-03', end: '2026-11-07', person: 'Bram Kreike', client: 'NoStrezz', project: 'Teaser',
  note: null, kits: [{ name: 'FX3 A-kit', parts: ['FX3 A', '24-70 #1'] }], loose: ['Rode mic <pro>'],
  responsibleWarnings: ['Dit materiaal valt onder Jan Peeters (Sporting Hasselt). Bespreek dit eerst.'],
  link: 'https://hub.example/materiaal?view=day&date=2026-11-03',
}
const secret = 'x'.repeat(32)

describe('mailConfig', () => {
  it('alleen met een Apps Script-URL en een geheim van minstens 32 tekens', () => {
    expect(mailConfig({ MATERIAAL_MAIL_WEBHOOK_URL: 'https://script.google.com/macros/s/AKfy-123/exec', MATERIAAL_MAIL_SECRET: secret }))
      .toEqual({ url: 'https://script.google.com/macros/s/AKfy-123/exec', secret, from: null })
    expect(mailConfig({ MATERIAAL_MAIL_WEBHOOK_URL: 'https://script.google.com/a/macros/sporthouse.be/s/AKfy/exec', MATERIAAL_MAIL_SECRET: secret })).not.toBeNull()
    expect(mailConfig({ MATERIAAL_MAIL_WEBHOOK_URL: 'https://evil.example/exec', MATERIAAL_MAIL_SECRET: secret })).toBeNull()
    expect(mailConfig({ MATERIAAL_MAIL_WEBHOOK_URL: 'https://script.google.com/macros/s/AKfy/exec', MATERIAAL_MAIL_SECRET: 'kort' })).toBeNull()
    expect(mailConfig({})).toBeNull()
  })
  it('afzender (organisator in de uitnodiging) alleen als het een geldig adres is', () => {
    const base = { MATERIAAL_MAIL_WEBHOOK_URL: 'https://script.google.com/macros/s/AKfy/exec', MATERIAAL_MAIL_SECRET: secret }
    expect(mailConfig({ ...base, MATERIAAL_MAIL_FROM: ' Materiaal@Sporthouse.be ' })?.from).toBe('materiaal@sporthouse.be')
    expect(mailConfig({ ...base, MATERIAAL_MAIL_FROM: 'geen adres' })?.from).toBeNull()
  })
  it('gebruikt niet de instellingen van de poolwagenmail', () => {
    expect(mailConfig({ POOLWAGENS_MAIL_WORKER_URL: 'https://script.google.com/macros/s/AKfy/exec', POOLWAGENS_MAIL_WORKER_SECRET: secret })).toBeNull()
  })
})

describe('ontvangers', () => {
  it('geldige adressen, kleine letters, elk één keer; zonder adres overslaan', () => {
    expect(mailRecipients(['Bram@Sporthouse.be', 'bram@sporthouse.be', null, '', 'geen-adres', 'jan@example.com']))
      .toEqual(['bram@sporthouse.be', 'jan@example.com'])
    expect(isEmail(undefined)).toBe(false)
  })
  it('sleutel van de bevestiging hangt aan de data', () => {
    expect(confirmationKey('2026-11-03', '2026-11-07')).toBe('2026-11-03|2026-11-07')
  })
})

describe('inhoud', () => {
  it('bevestiging: wat, periode, voor wie, project, verantwoordelijke, link', () => {
    const m = confirmationMail(b, false)
    expect(m.subject).toBe('Materiaal geboekt: FX3 A-kit, Rode mic <pro> · 3–7 nov 2026')
    expect(m.text).toContain('- FX3 A-kit (FX3 A, 24-70 #1)')
    expect(m.text).toContain('Voor: Bram Kreike · NoStrezz')
    expect(m.text).toContain('Project: Teaser')
    expect(m.text).toContain('Let op: Dit materiaal valt onder Jan Peeters (Sporting Hasselt). Bespreek dit eerst.')
    expect(m.html).toContain('Rode mic &lt;pro&gt;')
    expect(m.html).not.toContain('<pro>')
    expect(m.html).toContain('https://hub.example/materiaal?view=day&amp;date=2026-11-03')
  })
  it('gewijzigde data zeggen dat', () => {
    expect(confirmationMail(b, true).subject.startsWith('Boeking gewijzigd:')).toBe(true)
  })
  it('herinnering: vandaag terugbrengen, zonder verantwoordelijke-blok', () => {
    const m = reminderMail(b)
    expect(m.subject).toBe('Vandaag terugbrengen: FX3 A-kit, Rode mic <pro>')
    expect(m.text).not.toContain('Bespreek dit eerst')
  })
  it('kort wat er geboekt is, met +N bij veel', () => {
    expect(whatShort({ kits: [{ name: 'A', parts: [] }], loose: ['B', 'C', 'D'] })).toBe('A, B +2')
  })
  it('geen regeleinden in het onderwerp', () => {
    expect(confirmationMail({ ...b, kits: [], loose: ['A\r\nBcc: x@y.z'] }, false).subject).not.toMatch(/[\r\n]/)
  })
})

describe('icsFile', () => {
  const now = new Date('2026-11-01T10:00:00Z')
  const opts = { method: 'REQUEST' as const, sequence: 3, now }
  const ics = icsFile(b, opts)
  it('hele dagen, einde is de dag ná de terugbrengdag, ook over een maandgrens', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261103')
    expect(ics).toContain('DTEND;VALUE=DATE:20261108')
    expect(icsFile({ ...b, end: '2026-11-30' }, opts)).toContain('DTEND;VALUE=DATE:20261201')
  })
  it('vaste UID per boeking (nieuwe data werken het item bij), CRLF, korte regels', () => {
    expect(ics).toContain('UID:materiaal-abc@sporthouse')
    expect(ics).toContain('SEQUENCE:3')
    expect(ics.split('\r\n').every(l => l.length <= 75)).toBe(true)
  })
  it('ontsnapt komma\'s en puntkomma\'s', () => {
    expect(icsFile({ ...b, kits: [], loose: ['A, B; C'] }, opts)).toContain('SUMMARY:Materiaal: A\\, B\\; C')
  })
})

describe('mailErrorText', () => {
  it('haalt het geheim uit een fout', () => {
    expect(mailErrorText(new Error(`fout met ${secret}`), secret)).toBe('fout met [geheim]')
  })
})

describe('shouldConfirm (achteraf boeken)', () => {
  it('geen bevestiging voor een boeking die al voorbij is; wel als ze tot vandaag of later loopt', () => {
    expect(shouldConfirm('2026-11-04', '2026-11-06')).toBe(false)
    expect(shouldConfirm('2026-11-06', '2026-11-06')).toBe(true)
    expect(shouldConfirm('2026-11-09', '2026-11-06')).toBe(true)
  })
})

describe('uitnodiging: verschuiven en annuleren', () => {
  const t1 = new Date('2026-11-01T10:00:00Z'), t2 = new Date('2026-11-02T08:00:00Z')
  const seq = (ics: string) => Number(/SEQUENCE:(\d+)/.exec(ics)![1])
  const uid = (ics: string) => /UID:(.+)/.exec(ics)![1]
  const first = icsFile(b, { method: 'REQUEST', sequence: icsSequence(t1), now: t1, organizer: 'materiaal@sporthouse.be', attendee: 'bram@sporthouse.be' })
  const moved = icsFile({ ...b, start: '2026-11-04', end: '2026-11-09' }, { method: 'REQUEST', sequence: icsSequence(t2), now: t2 })
  const cancel = icsFile(b, { method: 'CANCEL', sequence: icsSequence(t2), now: t2, organizer: 'materiaal@sporthouse.be' })

  it('nieuwe data: zelfde UID, hogere SEQUENCE, nieuwe dagen', () => {
    expect(uid(moved)).toBe(uid(first))
    expect(seq(moved)).toBeGreaterThan(seq(first))
    expect(moved).toContain('DTSTART;VALUE=DATE:20261104')
    expect(moved).toContain('METHOD:REQUEST')
    expect(moved).toContain('STATUS:CONFIRMED')
  })
  it('annulering: zelfde UID, METHOD:CANCEL, STATUS:CANCELLED, hogere SEQUENCE', () => {
    expect(uid(cancel)).toBe(uid(first))
    expect(cancel).toContain('METHOD:CANCEL')
    expect(cancel).toContain('STATUS:CANCELLED')
    expect(seq(cancel)).toBeGreaterThan(seq(first))
  })
  it('organisator en deelnemer als ze er zijn; anders weggelaten', () => {
    expect(first).toContain('ORGANIZER;CN=Sporthouse Materiaal:mailto:materiaal@sporthouse.be')
    expect(first.replace(/\r\n /g, '')).toContain('mailto:bram@sporthouse.be')
    expect(moved).not.toContain('ORGANIZER')
    expect(moved).not.toContain('ATTENDEE')
  })
  it('volgnummer: seconden, dus elke latere mail hoger', () => {
    expect(icsSequence(t2)).toBeGreaterThan(icsSequence(t1))
    expect(icsSequence(new Date('2037-12-31T00:00:00Z'))).toBeLessThan(2 ** 31)
  })
})

describe('cancellationMail', () => {
  it('"Geannuleerd: …" met wat en periode, zonder verantwoordelijke-blok', () => {
    const m = cancellationMail(b)
    expect(m.subject).toBe('Geannuleerd: FX3 A-kit, Rode mic <pro> · 3–7 nov 2026')
    expect(m.text).toContain('Deze boeking is geannuleerd.')
    expect(m.text).not.toContain('Bespreek dit eerst')
  })
  it('geen annuleringsmail voor een boeking die al voorbij was (zelfde regel als de bevestiging)', () => {
    expect(shouldConfirm('2026-11-05', '2026-11-06')).toBe(false)
    expect(shouldConfirm('2026-11-06', '2026-11-06')).toBe(true)
  })
})

describe('uren in mail en .ics', () => {
  const timed = { ...b, startTime: '14:00', endTime: '10:00' }
  it('periode met uren', () => {
    expect(mailPeriod(timed)).toBe('3 nov 14:00 – 7 nov 10:00 2026')
    expect(mailPeriod(b)).toBe('3–7 nov 2026')
    expect(confirmationMail(timed, false).subject).toContain('3 nov 14:00 – 7 nov 10:00 2026')
  })
  it('.ics met uren: TZID Europe/Brussels en een VTIMEZONE; zonder uren hele dagen', () => {
    const ics = icsFile(timed, { method: 'REQUEST', sequence: 1 })
    expect(ics).toContain('DTSTART;TZID=Europe/Brussels:20261103T140000')
    expect(ics).toContain('DTEND;TZID=Europe/Brussels:20261107T100000')
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(ics).not.toContain('VALUE=DATE')
    const allDay = icsFile(b, { method: 'REQUEST', sequence: 1 })
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261103')
    expect(allDay).not.toContain('VTIMEZONE')
  })
  it('alleen een ophaaluur: eindigt om middernacht na de laatste dag', () => {
    expect(icsFile({ ...b, startTime: '14:00' }, { method: 'REQUEST', sequence: 1 })).toContain('DTEND;TZID=Europe/Brussels:20261108T000000')
  })
  it('herinnering met het uur van terugbrengen', () => {
    expect(reminderMail({ ...b, endTime: '17:00' }).text).toContain('om 17:00')
  })
  it('nieuwe uren = nieuwe bevestiging (andere sleutel)', () => {
    expect(confirmationKey('2026-11-03', '2026-11-07', '14:00', null)).not.toBe(confirmationKey('2026-11-03', '2026-11-07'))
  })
  it('elke mail begint met het logo (cid:logo) en "Sporthouse Materiaal"', () => {
    for (const m of [confirmationMail(b, false), cancellationMail(b), reminderMail(b)]) {
      expect(m.html.startsWith(`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#18181b;max-width:560px">${MAIL_HEADER}`)).toBe(true)
    }
    expect(MAIL_HEADER).toContain('src="cid:logo"')
    expect(MAIL_HEADER).toContain('Sporthouse Materiaal')
  })
})
