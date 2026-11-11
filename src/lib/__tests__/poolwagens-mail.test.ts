import { describe, it, expect, vi } from 'vitest'
import { damageMail, mailConfig, mailErrorText, sendMail, trySendMail, workerPayload, type MailConfig } from '@/lib/poolwagens/mail'

const SECRET = 's'.repeat(40)
const URL_OK = 'https://script.google.com/macros/s/AKfycbx-abc_123/exec'
const CONFIG: MailConfig = { url: URL_OK, secret: SECRET }
const MSG = { subject: 'Test', text: 'Hallo', html: '<p>Hallo</p>' }

describe('mailConfig', () => {
  it('pas geconfigureerd met een Apps Script-URL en een lang geheim', () => {
    expect(mailConfig({})).toBeNull()
    expect(mailConfig({ POOLWAGENS_MAIL_WORKER_URL: URL_OK })).toBeNull()
    expect(mailConfig({ POOLWAGENS_MAIL_WORKER_URL: URL_OK, POOLWAGENS_MAIL_WORKER_SECRET: 'kort' })).toBeNull()
    expect(mailConfig({ POOLWAGENS_MAIL_WORKER_URL: ` ${URL_OK} `, POOLWAGENS_MAIL_WORKER_SECRET: ` ${SECRET} ` })).toEqual(CONFIG)
    const workspace = 'https://script.google.com/a/macros/sporthousegroup.com/s/AKfy-1/exec'
    expect(mailConfig({ POOLWAGENS_MAIL_WORKER_URL: workspace, POOLWAGENS_MAIL_WORKER_SECRET: SECRET })?.url).toBe(workspace)
  })

  it('het geheim gaat nooit naar een ander adres dan een Apps Script-webapp', () => {
    for (const url of ['https://example.com/exec', 'http://script.google.com/macros/s/x/exec', 'https://script.google.com.evil.com/macros/s/x/exec', 'https://script.google.com/macros/s/x/dev']) {
      expect(mailConfig({ POOLWAGENS_MAIL_WORKER_URL: url, POOLWAGENS_MAIL_WORKER_SECRET: SECRET })).toBeNull()
    }
  })
})

describe('workerPayload en sendMail', () => {
  it('alleen geldige ontvangers, geen regeleinden in het onderwerp', () => {
    expect(workerPayload({ ...MSG, subject: 'Hoi\r\nBcc: aanvaller@example.com', to: ['a@example.com', 'fout'] }))
      .toEqual({ ...MSG, subject: 'Hoi Bcc: aanvaller@example.com', to: ['a@example.com'] })
    expect(() => workerPayload({ ...MSG, to: ['geen-adres'] })).toThrow('Geen geldige ontvangers.')
  })

  const answer = (body: unknown, init: ResponseInit = {}) => vi.fn().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), init))

  it('stuurt geheim en bericht als JSON naar de worker', async () => {
    const fetchFn = answer({ ok: true })
    await sendMail(CONFIG, { ...MSG, to: ['a@example.com'] }, fetchFn)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(URL_OK)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ secret: SECRET, ...MSG, to: ['a@example.com'] })
  })

  it('een weigering of een loginpagina wordt een fout', async () => {
    await expect(sendMail(CONFIG, { ...MSG, to: ['a@example.com'] }, answer({ ok: false, error: 'Geen toegang.' }))).rejects.toThrow('Geen toegang.')
    await expect(sendMail(CONFIG, { ...MSG, to: ['a@example.com'] }, answer('<html>Inloggen</html>'))).rejects.toThrow('Iedereen')
    await expect(sendMail(CONFIG, { ...MSG, to: ['a@example.com'] }, answer('x', { status: 500 }))).rejects.toThrow('500')
  })
})

describe('trySendMail (een mislukte mail blokkeert nooit)', () => {
  it('niet geconfigureerd: niets versturen', async () => {
    const send = vi.fn()
    expect(await trySendMail(['a@example.com'], MSG, null, send)).toEqual({ status: 'niet_geconfigureerd', error: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('geen ontvangers: niets versturen', async () => {
    const send = vi.fn()
    expect(await trySendMail([], MSG, CONFIG, send)).toEqual({ status: 'geen_ontvangers', error: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('verstuurd', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    expect(await trySendMail(['a@example.com', 'fout'], MSG, CONFIG, send)).toEqual({ status: 'verstuurd', error: null })
    expect(send).toHaveBeenCalledWith(CONFIG, { ...MSG, to: ['a@example.com'] })
  })

  it('een fout van de worker wordt een status, geen exception', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn().mockRejectedValue(new Error('Geen toegang.'))
    expect(await trySendMail(['a@example.com'], MSG, CONFIG, send)).toEqual({ status: 'mislukt', error: 'Geen toegang.' })
    spy.mockRestore()
  })

  it('het geheim of een sleutel komt nooit in de foutmelding', () => {
    expect(mailErrorText(new Error(`fout bij ${SECRET}`), SECRET)).toBe('fout bij [geheim]')
    expect(mailErrorText(new Error('bad -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----'))).toBe('bad [sleutel]')
    expect(mailErrorText(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('Mail-worker antwoordde niet op tijd.')
  })
})

describe('damageMail', () => {
  it('ernstig: zegt dat de wagen geblokkeerd is; html is ontsmet', () => {
    const m = damageMail({ carName: 'Bus <b>', plate: '1-ABC-234', severity: 'ernstig', description: '<script>x</script>', reporter: 'Bram', photoCount: 2, link: 'https://hub/x' })
    expect(m.subject).toBe('Ernstige schade gemeld: Bus <b> (1-ABC-234)')
    expect(m.text).toContain('geblokkeerd voor nieuwe reservaties')
    expect(m.text).toContain('2 foto’s.')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })
  it('licht: geen blokkade', () => {
    const m = damageMail({ carName: 'Bus', plate: 'X', severity: 'licht', description: 'kras', reporter: 'Bram', photoCount: 0, link: 'l' })
    expect(m.subject).toBe('Schade gemeld: Bus (X)')
    expect(m.text).not.toContain('geblokkeerd')
  })
})

describe('reservationMail', () => {
  const base = {
    carName: 'Poolwagen 1', plate: '1-ABC-234', period: 'di 4/11 08:00–17:00', person: 'Bram',
    bookedBy: null, client: null, note: null, link: 'https://hub.example/poolwagens',
  }

  it('bevat de reservatie en alle afspraken, in tekst en html', async () => {
    const { reservationMail, POOL_RULES } = await import('@/lib/poolwagens/mail')
    const m = reservationMail({ ...base, client: 'Flanders Classics' })
    expect(m.subject).toBe('Poolwagen gereserveerd: Poolwagen 1 · di 4/11 08:00–17:00')
    expect(m.text).toContain('Poolwagen 1 (1-ABC-234) is voor je gereserveerd.')
    expect(m.text).toContain('Klant: Flanders Classics')
    for (const rule of POOL_RULES) {
      expect(m.text).toContain(`${rule.title}: ${rule.detail}`)
      expect(m.html).toContain(rule.title)
      expect(m.html).toContain(rule.detail)
    }
    expect(m.text).toContain('Shell, Total, Esso, Dats24 of Q8')
    expect(m.html).toContain('Bekijk je reservatie of meld schade op de hub')
    expect(m.text).toContain('kiezelparking')
    expect(m.text).not.toContain('Notitie')
  })

  it('zegt wie reserveerde voor een collega, en ontsnapt html', async () => {
    const { reservationMail } = await import('@/lib/poolwagens/mail')
    const m = reservationMail({ ...base, bookedBy: 'Alexander', note: '<b>x</b>' })
    expect(m.text).toContain('Alexander reserveerde Poolwagen 1 (1-ABC-234) voor Bram.')
    expect(m.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(m.html).not.toContain('<b>x</b>')
  })
})
