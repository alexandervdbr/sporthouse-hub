import { isEmail } from './email'
import type { MailStatus } from './types'

// Mail versturen via een Google Apps Script ("mail-worker", de code staat in
// apps-script/poolwagens-mail/Code.gs). Het script draait onder een bestaand
// Workspace-account en verstuurt met MailApp; de hub stuurt het alleen de
// ontvangers, het onderwerp en de tekst, met een gedeeld geheim. Er is geen
// service account en geen domain-wide delegation nodig.
//
// De URL moet een Apps Script-webapp zijn: zo kan een verkeerd ingestelde
// env-var het geheim nooit naar een ander adres sturen.
//
// Ontbreekt de configuratie, dan wordt er niets verstuurd en zegt de status
// dat ('niet_geconfigureerd'). Een mislukte mail gooit nooit door naar de
// aanroeper: de schademelding is dan al opgeslagen.

export interface MailConfig {
  url: string
  secret: string
}

// Ook de Workspace-vorm: https://script.google.com/a/macros/<domein>/s/<id>/exec
const WORKER_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/
/** Minimale lengte van het geheim (ook gecontroleerd in het script). */
export const MIN_SECRET_LENGTH = 32
/** Hoe lang de hub op het script wacht. */
const TIMEOUT_MS = 20_000

export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const url = env.POOLWAGENS_MAIL_WORKER_URL?.trim()
  const secret = env.POOLWAGENS_MAIL_WORKER_SECRET?.trim()
  if (!url || !secret || !WORKER_URL.test(url) || secret.length < MIN_SECRET_LENGTH) return null
  return { url, secret }
}

export { isEmail }

export interface MailMessage {
  to: string[]
  subject: string
  text: string
  html: string
}

/** Geen regeleinden in een onderwerp of adres: anders kan een waarde extra headers toevoegen. */
export function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/** Wat de hub naar het script stuurt (zonder het geheim). */
export function workerPayload(msg: MailMessage): MailMessage {
  const to = msg.to.map(headerValue).filter(isEmail)
  if (to.length === 0) throw new Error('Geen geldige ontvangers.')
  return { to, subject: headerValue(msg.subject).slice(0, 250), text: msg.text, html: msg.html }
}

export async function sendMail(config: MailConfig, msg: MailMessage, fetchFn: typeof fetch = fetch): Promise<void> {
  // Apps Script antwoordt met een doorverwijzing naar het eigenlijke
  // antwoord; fetch volgt die. Het script zegt altijd 200, met { ok, error }.
  const res = await fetchFn(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.secret, ...workerPayload(msg) }),
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Mail-worker antwoordde ${res.status}.`)
  let body: { ok?: boolean; error?: string }
  try {
    body = await res.json()
  } catch {
    throw new Error('Mail-worker antwoordde niet zoals verwacht. Staat de toegang van de webapp op "Iedereen"?')
  }
  if (!body.ok) throw new Error(body.error || 'Mail-worker weigerde de mail.')
}

/** Een foutmelding kort en zonder geheimen, voor de schadelijst. */
export function mailErrorText(err: unknown, secret?: string): string {
  const e = err as { name?: string; message?: string }
  let text = e?.name === 'TimeoutError' ? 'Mail-worker antwoordde niet op tijd.' : String(e?.message || 'Onbekende fout')
  if (secret) text = text.split(secret).join('[geheim]')
  return text.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[sleutel]').slice(0, 300)
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
    const error = mailErrorText(err, config.secret)
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
