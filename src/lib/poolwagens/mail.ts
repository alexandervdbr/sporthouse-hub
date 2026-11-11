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

// ── De bevestiging van een reservatie ───────────────────────────────────────
//
// Eén mail bij het reserveren (ook bij "Nu vertrekken"), met de afspraken
// over de wagen. Geen herinnering en geen mail bij het terugbrengen.

/** De afspraken onderaan elke bevestiging. Hier aanpassen als ze veranderen. */
export const POOL_RULES: string[] = [
  'Tank de wagen altijd opnieuw vol bij terugkeer. Tanken kan bij Shell, Total, Esso, Dats24 en Q8.',
  'Schade? Meld die meteen op de hub.',
  'Geeft de wagen een melding van lage bandendruk of onderhoud? Meld dat meteen op de hub.',
  'Parkeer de wagen altijd op de kiezelparking of op de parking van Flanders Classics. Nooit in de straat.',
]

export interface ReservationMailInput {
  carName: string
  plate: string
  /** "di 4/11 08:00–17:00" (formatPeriod). */
  period: string
  /** Voor wie de reservatie is. */
  person: string
  /** Wie reserveerde, als dat iemand anders is; anders null. */
  bookedBy: string | null
  client: string | null
  note: string | null
  /** Link naar de poolwagens in de hub. */
  link: string
}

export function reservationMail(r: ReservationMailInput): Omit<MailMessage, 'to'> {
  const car = `${r.carName}${r.plate ? ` (${r.plate})` : ''}`
  const subject = `Poolwagen gereserveerd: ${r.carName} · ${r.period}`
  const intro = r.bookedBy
    ? `${r.bookedBy} reserveerde ${car} voor ${r.person}.`
    : `${car} is voor je gereserveerd.`
  const rows: [string, string][] = [
    ['Wagen', car],
    ['Periode', r.period],
    ['Voor', r.person],
    ...(r.client ? [['Klant', r.client] as [string, string]] : []),
    ...(r.note ? [['Notitie', r.note] as [string, string]] : []),
  ]
  const text = [
    intro,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Afspraken bij elke rit:',
    ...POOL_RULES.map(rule => `- ${rule}`),
    '',
    `Melden en je reservatie bekijken: ${r.link}`,
    '',
    '— Sporthouse Poolwagens',
  ].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#18181b;max-width:560px">` +
    `<p style="margin:0 0 16px;font-size:16px;font-weight:600;letter-spacing:.2px">Sporthouse Poolwagens</p>` +
    `<p style="margin:0 0 12px">${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse;margin:0 0 16px">${rows.map(([k, v]) =>
      `<tr><td style="padding:2px 12px 2px 0;color:#71717a;vertical-align:top">${escapeHtml(k)}</td><td style="padding:2px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`).join('')}</table>` +
    `<div style="margin:0 0 16px;padding:10px 14px;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa">` +
    `<p style="margin:0 0 6px;font-weight:600">Afspraken bij elke rit</p>` +
    `<ul style="margin:0;padding-left:18px">${POOL_RULES.map(rule => `<li style="margin:2px 0">${escapeHtml(rule)}</li>`).join('')}</ul></div>` +
    `<p style="margin:0"><a href="${escapeHtml(r.link)}" style="color:#3A913F">Melden en je reservatie bekijken in de hub</a></p>` +
    `<p style="margin:24px 0 0;padding-top:14px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa">Automatische mail van Sporthouse Poolwagens</p>` +
    `</div>`
  return { subject, text, html }
}
