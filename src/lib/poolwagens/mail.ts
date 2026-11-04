import { google } from 'googleapis'
import type { MailStatus } from './types'

// Mail versturen via de Gmail API, met het bestaande googleapis-pakket.
//
// Een eigen service account met domain-wide delegation, en alleen de scope
// gmail.send: het mag mailen, niets lezen. Het verstuurt uitsluitend als het
// afzenderadres uit POOLWAGENS_MAIL_AFZENDER (een apart Workspace-account) —
// de afzender komt nooit uit een verzoek.
//
// Ontbreekt de configuratie, dan wordt er niets verstuurd en zegt de status
// dat ('niet_geconfigureerd'). Een mislukte mail gooit nooit door naar de
// aanroeper: de schademelding is dan al opgeslagen.

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

export interface MailConfig {
  sender: string
  serviceAccountEmail: string
  privateKey: string
}

export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const sender = env.POOLWAGENS_MAIL_AFZENDER?.trim()
  const serviceAccountEmail = env.POOLWAGENS_MAIL_SERVICE_ACCOUNT_EMAIL?.trim()
  const privateKey = env.POOLWAGENS_MAIL_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!sender || !serviceAccountEmail || !privateKey) return null
  return { sender, serviceAccountEmail, privateKey }
}

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value)
}

export interface MailMessage {
  to: string[]
  subject: string
  text: string
  html: string
}

/** Geen regeleinden in een header: anders kan een waarde extra headers toevoegen. */
function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/** Een onderwerp met é, ë, … volgens RFC 2047. */
export function encodeHeader(value: string): string {
  const clean = headerValue(value)
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`
}

function base64Lines(value: string): string {
  return (Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

/** Het volledige bericht, base64url zoals de Gmail API het wil (veld raw). */
export function buildRawMessage(from: string, msg: MailMessage, boundary = 'poolwagens-boundary'): string {
  const to = msg.to.map(headerValue).filter(isEmail)
  if (to.length === 0) throw new Error('Geen geldige ontvangers.')
  if (!isEmail(headerValue(from))) throw new Error('Ongeldig afzenderadres.')
  const lines = [
    `From: ${headerValue(from)}`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(msg.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(msg.html),
    `--${boundary}--`,
    '',
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

export async function sendMail(config: MailConfig, msg: MailMessage): Promise<void> {
  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: [GMAIL_SEND_SCOPE],
    subject: config.sender,
  })
  const gmail = google.gmail({ version: 'v1', auth })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: buildRawMessage(config.sender, msg) } })
}

/** Een foutmelding van Google kort en zonder geheimen, voor de schadelijst. */
export function mailErrorText(err: unknown): string {
  const e = err as { message?: string; response?: { data?: { error?: string; error_description?: string } } }
  const google_ = e?.response?.data
  const text = google_?.error_description || google_?.error || e?.message || 'Onbekende fout'
  return String(text).replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[sleutel]').slice(0, 300)
}

/**
 * Versturen naar een lijst ontvangers, met de uitkomst als mailstatus. Gooit
 * nooit: alles wat misgaat, staat in de uitkomst (en in de log).
 */
export async function trySendMail(
  recipients: string[],
  msg: Omit<MailMessage, 'to'>,
  config: MailConfig | null = mailConfig(),
  send: typeof sendMail = sendMail,
): Promise<{ status: MailStatus; error: string | null }> {
  if (!config) return { status: 'niet_geconfigureerd', error: null }
  const to = recipients.filter(isEmail)
  if (to.length === 0) return { status: 'geen_ontvangers', error: null }
  try {
    await send(config, { ...msg, to })
    return { status: 'verstuurd', error: null }
  } catch (err) {
    const error = mailErrorText(err)
    console.error('Poolwagens: mail niet verstuurd:', error)
    return { status: 'mislukt', error }
  }
}

// ── De schademail ───────────────────────────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface DamageMailInput {
  carName: string
  plate: string
  severity: 'licht' | 'ernstig'
  description: string
  reporter: string
  photoCount: number
  /** Link naar de schadelijst in de hub. */
  link: string
}

export function damageMail(d: DamageMailInput): Omit<MailMessage, 'to'> {
  const ernstig = d.severity === 'ernstig'
  const subject = `${ernstig ? 'Ernstige schade' : 'Schade'} gemeld: ${d.carName} (${d.plate})`
  const block = ernstig ? 'De wagen is geblokkeerd voor nieuwe reservaties tot de schade hersteld is of de blokkade opgeheven.' : null
  const photos = d.photoCount === 0 ? 'Geen foto’s.' : d.photoCount === 1 ? '1 foto.' : `${d.photoCount} foto’s.`
  const text = [
    `${d.reporter} meldde ${ernstig ? 'ernstige' : 'lichte'} schade aan ${d.carName} (${d.plate}).`,
    '',
    d.description,
    '',
    photos,
    ...(block ? ['', block] : []),
    '',
    `Bekijk de melding in de hub: ${d.link}`,
  ].join('\n')
  const html = `<p>${escapeHtml(d.reporter)} meldde <strong>${ernstig ? 'ernstige' : 'lichte'} schade</strong> aan ${escapeHtml(d.carName)} (${escapeHtml(d.plate)}).</p>
<blockquote style="border-left:3px solid #ccc;margin:0;padding-left:12px;white-space:pre-wrap">${escapeHtml(d.description)}</blockquote>
<p>${escapeHtml(photos)}</p>
${block ? `<p style="color:#b91c1c">${escapeHtml(block)}</p>` : ''}
<p><a href="${escapeHtml(d.link)}">Bekijk de melding in de hub</a></p>`
  return { subject, text, html }
}
