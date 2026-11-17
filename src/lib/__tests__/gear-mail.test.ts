import { describe, it, expect } from 'vitest'
import { MAIL_HEADER, MAIL_SIGNATURE, calendarEvent, changeKey, changeMail, groupByRecipient, mailPeriod, isEmail, mailConfig, mailErrorText, mailRecipients, reminderMail, shouldMail, whatShort, type MailBooking } from '@/lib/gear/mail'

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
      .toEqual({ url: 'https://script.google.com/macros/s/AKfy-123/exec', secret })
    expect(mailConfig({ MATERIAAL_MAIL_WEBHOOK_URL: 'https://script.google.com/a/macros/sporthouse.be/s/AKfy/exec', MATERIAAL_MAIL_SECRET: secret })).not.toBeNull()
    expect(mailConfig({ MATERIAAL_MAIL_WEBHOOK_URL: 'https://evil.example/exec', MATERIAAL_MAIL_SECRET: secret })).toBeNull()
    expect(mailConfig({ MATERIAAL_MAIL_WEBHOOK_URL: 'https://script.google.com/macros/s/AKfy/exec', MATERIAAL_MAIL_SECRET: 'kort' })).toBeNull()
    expect(mailConfig({})).toBeNull()
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
  it('sleutel van de wijziging hangt aan data, uren en materiaal (niet aan de volgorde)', () => {
    const k = changeKey({ start: '2026-11-03', end: '2026-11-07', itemIds: ['a', 'b'] })
    expect(k.startsWith('2026-11-03|2026-11-07|2:')).toBe(true)
    expect(changeKey({ start: '2026-11-03', end: '2026-11-07', itemIds: ['b', 'a'] })).toBe(k)
    expect(changeKey({ start: '2026-11-03', end: '2026-11-07', itemIds: ['a', 'c'] })).not.toBe(k)
    expect(changeKey({ start: '2026-11-03', end: '2026-11-07', startTime: '14:00', itemIds: ['a', 'b'] })).not.toBe(k)
  })
})

describe('inhoud', () => {
  it('wijziging: wat, periode, voor wie, project, verantwoordelijke, link', () => {
    const m = changeMail([b])
    expect(m.subject).toBe('Boeking gewijzigd: FX3 A-kit, Rode mic <pro> · 3–7 nov 2026')
    expect(m.text).toContain('- FX3 A-kit (FX3 A, 24-70 #1)')
    expect(m.text).toContain('Voor: Bram Kreike · NoStrezz')
    expect(m.text).toContain('Project: Teaser')
    expect(m.text).toContain('Let op: Dit materiaal valt onder Jan Peeters (Sporting Hasselt). Bespreek dit eerst.')
    expect(m.html).toContain('Rode mic &lt;pro&gt;')
    expect(m.html).not.toContain('<pro>')
    expect(m.html).toContain('https://hub.example/materiaal?view=day&amp;date=2026-11-03')
  })
  it('wijziging van meerdere boekingen in één actie: één mail met een blok per boeking', () => {
    const m = changeMail([{ ...b, id: 'x', start: '2026-11-10', end: '2026-11-11', loose: ['Lens'] , kits: [] }, b])
    expect(m.subject.startsWith('2 boekingen gewijzigd:')).toBe(true)
    expect(m.text.indexOf('3–7 nov 2026')).toBeLessThan(m.text.indexOf('10–11 nov 2026'))
    expect(m.text).toContain('- Lens')
  })
  it('herinnering: vandaag terugbrengen, zonder verantwoordelijke-blok', () => {
    const m = reminderMail([b])
    expect(m.subject).toBe('Vandaag terugbrengen: FX3 A-kit, Rode mic <pro>')
    expect(m.text).not.toContain('Bespreek dit eerst')
  })
  it('kort wat er geboekt is, met +N bij veel', () => {
    expect(whatShort({ kits: [{ name: 'A', parts: [] }], loose: ['B', 'C', 'D'] })).toBe('A, B +2')
  })
  it('geen regeleinden in het onderwerp', () => {
    expect(changeMail([{ ...b, kits: [], loose: ['A\r\nBcc: x@y.z'] }]).subject).not.toMatch(/[\r\n]/)
  })
})

describe('mailErrorText', () => {
  it('haalt het geheim uit een fout', () => {
    expect(mailErrorText(new Error(`fout met ${secret}`), secret)).toBe('fout met [geheim]')
  })
})

describe('shouldMail (achteraf boeken)', () => {
  it('geen mail voor een boeking die al voorbij is; wel als ze tot vandaag of later loopt', () => {
    expect(shouldMail('2026-11-04', '2026-11-06')).toBe(false)
    expect(shouldMail('2026-11-06', '2026-11-06')).toBe(true)
    expect(shouldMail('2026-11-09', '2026-11-06')).toBe(true)
  })
})

describe('herinnering per persoon', () => {
  const late = { ...b, id: 'late', endTime: '17:00', kits: [], loose: ['Statief'] }
  const early = { ...b, id: 'early', endTime: '09:30', kits: [], loose: ['Mic'] }
  const allDay = { ...b, id: 'dag', endTime: null, kits: [], loose: ['Kabel'] }
  it('meerdere boekingen: één mail, per boeking, op volgorde van het uur (hele dag achteraan)', () => {
    const m = reminderMail([allDay, late, early])
    expect(m.text).toContain('Vandaag breng je materiaal van 3 boekingen terug')
    const i = (s: string) => m.text.indexOf(s)
    expect(i('Terug om 09:30')).toBeLessThan(i('Terug om 17:00'))
    expect(i('Terug om 17:00')).toBeLessThan(i('Terug vandaag (hele dag)'))
    expect(i('- Mic')).toBeLessThan(i('- Statief'))
  })
  it('groepeert per ontvanger: elke ontvanger één keer, met al zijn boekingen', () => {
    const g = groupByRecipient([
      { item: 'b1', to: ['Bram@x.be', 'maker@x.be'] },
      { item: 'b2', to: ['bram@x.be'] },
      { item: 'b3', to: ['jan@x.be', 'geen-adres'] },
    ])
    expect(g).toEqual([
      { to: 'bram@x.be', items: ['b1', 'b2'] },
      { to: 'maker@x.be', items: ['b1'] },
      { to: 'jan@x.be', items: ['b3'] },
    ])
  })
})

describe('uren in de mail', () => {
  const timed = { ...b, startTime: '14:00', endTime: '10:00' }
  it('periode met uren', () => {
    expect(mailPeriod(timed)).toBe('3 nov 14:00 – 7 nov 10:00 2026')
    expect(mailPeriod(b)).toBe('3–7 nov 2026')
    expect(changeMail([timed]).subject).toContain('3 nov 14:00 – 7 nov 10:00 2026')
  })
  it('herinnering met het uur van terugbrengen', () => {
    expect(reminderMail([{ ...b, endTime: '17:00' }]).text).toContain('om 17:00')
  })
})

describe('kop en handtekening', () => {
  it('bovenaan alleen de titel; onderaan een lijn, het logo (cid:logo, 48 px) en "Sporthouse Materiaal"', () => {
    expect(MAIL_HEADER).not.toContain('<img')
    expect(MAIL_HEADER).toContain('Sporthouse Materiaal')
    expect(MAIL_SIGNATURE).toContain('src="cid:logo"')
    expect(MAIL_SIGNATURE).toContain('width="48"')
    expect(MAIL_SIGNATURE).toContain('border-top:1px solid')
  })
  it('elke soort mail eindigt met de handtekening en heeft geen bijlage meer nodig', () => {
    for (const m of [changeMail([b]), changeMail([b, { ...b, id: 'y' }]), reminderMail([b]), reminderMail([b, { ...b, id: 'y' }])]) {
      expect(m.html.endsWith(`${MAIL_SIGNATURE}</div>`)).toBe(true)
      expect(m.html.indexOf('cid:logo')).toBeGreaterThan(m.html.indexOf(MAIL_HEADER))
      expect(m.text).not.toContain('.ics')
    }
  })
})

describe('calendarEvent (afspraak in Google Calendar)', () => {
  it('zonder uren: hele dagen, einde = de dag na de laatste dag (ook over een maandgrens)', () => {
    const e = calendarEvent({ ...b, start: '2026-11-28', end: '2026-11-30' }, ['bram@sporthouse.be'])
    expect(e.start).toEqual({ date: '2026-11-28' })
    expect(e.end).toEqual({ date: '2026-12-01' })
  })
  it('met uren: Brusselse kloktijd met timeZone, niet omgerekend', () => {
    const e = calendarEvent({ ...b, startTime: '14:00', endTime: '10:00' }, [])
    expect(e.start).toEqual({ dateTime: '2026-11-03T14:00:00', timeZone: 'Europe/Brussels' })
    expect(e.end).toEqual({ dateTime: '2026-11-07T10:00:00', timeZone: 'Europe/Brussels' })
  })
  it('alleen een ophaaluur: eindigt om middernacht na de laatste dag', () => {
    expect(calendarEvent({ ...b, startTime: '14:00' }, []).end).toEqual({ dateTime: '2026-11-08T00:00:00', timeZone: 'Europe/Brussels' })
  })
  it('wisseldag: kloktijd blijft kloktijd', () => {
    const e = calendarEvent({ ...b, start: '2027-03-28', end: '2027-03-28', startTime: '06:00', endTime: '23:45' }, [])
    expect(e.start).toEqual({ dateTime: '2027-03-28T06:00:00', timeZone: 'Europe/Brussels' })
    expect(e.end).toEqual({ dateTime: '2027-03-28T23:45:00', timeZone: 'Europe/Brussels' })
  })
  it('gasten: alleen geldige adressen, elk één keer', () => {
    expect(calendarEvent(b, ['Bram@Sporthouse.be', 'bram@sporthouse.be', 'geen adres', '']).attendees).toEqual([{ email: 'bram@sporthouse.be', responseStatus: 'accepted' }])
  })
  it('titel en beschrijving: wat, voor wie, project, verantwoordelijke, link', () => {
    const e = calendarEvent(b, [])
    expect(e.summary).toBe('Materiaal: FX3 A-kit, Rode mic <pro> · Bram Kreike · NoStrezz')
    expect(e.description).toContain('FX3 A-kit (FX3 A, 24-70 #1)')
    expect(e.description).toContain('Project: Teaser')
    expect(e.description).toContain('Bespreek dit eerst.')
    expect(e.description).toContain(b.link)
  })
})
