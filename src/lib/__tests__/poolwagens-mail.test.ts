import { describe, it, expect, vi } from 'vitest'
import { buildRawMessage, damageMail, encodeHeader, mailConfig, mailErrorText, trySendMail, type MailConfig } from '@/lib/poolwagens/mail'

const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')
const CONFIG: MailConfig = { sender: 'poolwagens@sporthousegroup.com', serviceAccountEmail: 'sa@x.iam.gserviceaccount.com', privateKey: 'k' }
const MSG = { subject: 'Test', text: 'Hallo', html: '<p>Hallo</p>' }

describe('mailConfig', () => {
  it('pas geconfigureerd met alle drie de env-vars', () => {
    expect(mailConfig({})).toBeNull()
    expect(mailConfig({ POOLWAGENS_MAIL_AFZENDER: 'a@b.be', POOLWAGENS_MAIL_SERVICE_ACCOUNT_EMAIL: 'x' })).toBeNull()
    expect(mailConfig({
      POOLWAGENS_MAIL_AFZENDER: ' a@b.be ', POOLWAGENS_MAIL_SERVICE_ACCOUNT_EMAIL: 'sa@x', POOLWAGENS_MAIL_SERVICE_ACCOUNT_PRIVATE_KEY: 'line1\\nline2',
    })).toEqual({ sender: 'a@b.be', serviceAccountEmail: 'sa@x', privateKey: 'line1\nline2' })
  })
})

describe('buildRawMessage', () => {
  it('maakt een geldig bericht van de vaste afzender', () => {
    const m = decode(buildRawMessage(CONFIG.sender, { ...MSG, to: ['a@example.com', 'b@example.com'] }))
    expect(m).toContain('From: poolwagens@sporthousegroup.com\r\n')
    expect(m).toContain('To: a@example.com, b@example.com\r\n')
    expect(m).toContain('Subject: Test\r\n')
    expect(m).toContain('Content-Type: multipart/alternative')
  })

  it('geen extra headers via een regeleinde', () => {
    const m = decode(buildRawMessage(CONFIG.sender, { ...MSG, subject: 'Hoi\r\nBcc: aanvaller@example.com', to: ['a@example.com'] }))
    expect(m).not.toMatch(/^Bcc:/m)
    expect(m).toContain('Subject: Hoi Bcc: aanvaller@example.com\r\n')
  })

  it('codeert een onderwerp met accenten, en weigert zonder geldige ontvanger', () => {
    expect(encodeHeader('Schade gemeld: Peugeot')).toBe('Schade gemeld: Peugeot')
    expect(encodeHeader('Schade aan de wagen van Zoë')).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    expect(() => buildRawMessage(CONFIG.sender, { ...MSG, to: ['geen-adres'] })).toThrow('Geen geldige ontvangers.')
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

  it('een fout van Google wordt een status, geen exception', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn().mockRejectedValue({ response: { data: { error: 'unauthorized_client', error_description: 'Client is unauthorized' } } })
    expect(await trySendMail(['a@example.com'], MSG, CONFIG, send)).toEqual({ status: 'mislukt', error: 'Client is unauthorized' })
    spy.mockRestore()
  })

  it('een sleutel komt nooit in de foutmelding', () => {
    expect(mailErrorText(new Error('bad -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----'))).toBe('bad [sleutel]')
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
