import { addDays } from './dates'
import { MAIL_LOGO_CID } from './mail-logo'
import { bookingSlot, slotLabel } from './times'
import { periodLabel } from './views'

// Mails van de materiaalplanner, via een eigen Google Apps Script
// (scripts/apps-script/materiaal-mail/Code.gs): de hub maakt de inhoud en
// stuurt die met een gedeeld geheim naar het script, dat verstuurt met Gmail
// als "Sporthouse Materiaal". Los van de poolwagenmail.
//
// - bevestiging: bij een nieuwe boeking of nieuwe data, met een uitnodiging
//   (.ics, METHOD:REQUEST); nieuwe data = zelfde UID, hogere SEQUENCE, zodat
//   het bestaande agenda-item verschuift
// - annulering: zelfde UID met METHOD:CANCEL, zodat het item verdwijnt
// - herinnering: de ochtend van de terugbrengdag
//
// Alles hier is puur (geen database, geen netwerk); mail-server.ts haalt de
// gegevens op, houdt het logboek bij en verstuurt.

export interface MailConfig {
  url: string
  secret: string
  /**
   * Het adres waarmee het script verstuurt (MATERIAAL_MAIL_FROM). Komt als
   * ORGANIZER in de uitnodiging; agenda's als Gmail en Outlook verwerken een
   * wijziging of annulering pas automatisch als die klopt met de afzender.
   */
  from: string | null
}

// Ook de Workspace-vorm: https://script.google.com/a/macros/<domein>/s/<id>/exec
const SCRIPT_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/
export const MIN_SECRET_LENGTH = 32

/**
 * De instellingen uit Vercel. Ontbreekt er iets, of is de URL geen Apps
 * Script-webapp (zodat het geheim nooit naar een ander adres gaat), dan
 * wordt er niets verstuurd.
 */
export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const url = env.MATERIAAL_MAIL_WEBHOOK_URL?.trim()
  const secret = env.MATERIAAL_MAIL_SECRET?.trim()
  if (!url || !secret || !SCRIPT_URL.test(url) || secret.length < MIN_SECRET_LENGTH) return null
  const from = env.MATERIAAL_MAIL_FROM?.trim()
  return { url, secret, from: isEmail(from) ? from.toLowerCase() : null }
}

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i

export function isEmail(value: string | null | undefined): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value.trim())
}

/** Geldige adressen, in kleine letters, elk één keer. Zonder adres: overslaan, geen fout. */
export function mailRecipients(addresses: (string | null | undefined)[]): string[] {
  return [...new Set(addresses.filter(isEmail).map(a => a.trim().toLowerCase()))]
}

/** Een bevestiging alleen als de boeking nog loopt of komt; achteraf ingevoerd en al voorbij: geen mail. */
export function shouldConfirm(endDate: string, today: string): boolean {
  return endDate >= today
}

/** Sleutel in het logboek: nieuwe data geven een nieuwe bevestiging, dezelfde data nooit twee keer. */
export const confirmationKey = (start: string, end: string, startTime?: string | null, endTime?: string | null) =>
  `${start}${startTime ? `T${startTime}` : ''}|${end}${endTime ? `T${endTime}` : ''}`

export interface MailBooking {
  id: string
  start: string
  end: string
  /** 'HH:MM' of null (hele dag). */
  startTime?: string | null
  endTime?: string | null
  /** Voor wie: "Bram Kreike", of null bij alleen een klant. */
  person: string | null
  client: string | null
  project: string | null
  note: string | null
  kits: { name: string; parts: string[] }[]
  loose: string[]
  /** "Dit materiaal valt onder … Bespreek dit eerst." per verantwoordelijke. */
  responsibleWarnings: string[]
  /** Link naar de dag in de planner. */
  link: string
}

export interface MailContent {
  subject: string
  html: string
  text: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Geen regeleinden in een onderwerp: anders kan een waarde extra headers toevoegen. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

/** Kort wat er geboekt is: "FX3 A-kit, Sony 24-70mm #1" (en "+3" als het veel is). */
export function whatShort(b: Pick<MailBooking, 'kits' | 'loose'>, max = 2): string {
  const names = [...b.kits.map(k => k.name), ...b.loose]
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max}`
}

/** "3–7 nov 2026", of met uren "5 nov 14:00 – 7 nov 10:00 (2026)". */
export function mailPeriod(b: Pick<MailBooking, 'start' | 'end' | 'startTime' | 'endTime'>): string {
  if (!b.startTime && !b.endTime) return periodLabel(b.start, b.end, true)
  return `${slotLabel(bookingSlot(b.start, b.startTime, b.end, b.endTime))} ${b.end.slice(0, 4)}`
}

function forWhom(b: MailBooking): string {
  return [b.person, b.client].filter(Boolean).join(' · ') || 'onbekend'
}

function lines(b: MailBooking): { text: string[]; html: string } {
  const text: string[] = []
  const html: string[] = []
  for (const k of b.kits) {
    text.push(`- ${k.name}${k.parts.length ? ` (${k.parts.join(', ')})` : ''}`)
    html.push(`<li><strong>${esc(k.name)}</strong>${k.parts.length ? `<br><span style="color:#71717a">${esc(k.parts.join(', '))}</span>` : ''}</li>`)
  }
  for (const n of b.loose) { text.push(`- ${n}`); html.push(`<li>${esc(n)}</li>`) }
  return { text, html: `<ul style="margin:4px 0 12px;padding-left:18px">${html.join('')}</ul>` }
}

function details(b: MailBooking): { text: string[]; html: string } {
  const rows: [string, string][] = [
    ['Periode', mailPeriod(b)],
    ['Voor', forWhom(b)],
    ...(b.project ? [['Project', b.project] as [string, string]] : []),
    ...(b.note ? [['Notitie', b.note] as [string, string]] : []),
  ]
  return {
    text: rows.map(([k, v]) => `${k}: ${v}`),
    html: `<table style="border-collapse:collapse;margin:0 0 12px">${rows.map(([k, v]) =>
      `<tr><td style="padding:2px 12px 2px 0;color:#71717a">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join('')}</table>`,
  }
}

function warnings(b: MailBooking): { text: string[]; html: string } {
  if (!b.responsibleWarnings.length) return { text: [], html: '' }
  return {
    text: ['', ...b.responsibleWarnings.map(w => `Let op: ${w}`)],
    html: b.responsibleWarnings.map(w =>
      `<p style="margin:0 0 12px;padding:8px 12px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;color:#92400e">${esc(w)}</p>`).join(''),
  }
}

/** Kop van elke mail: het beeldmerk (inline, cid:logo) met "Sporthouse Materiaal" ernaast. */
export const MAIL_HEADER =
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse"><tr>` +
  `<td style="padding:0 10px 0 0;vertical-align:middle"><img src="cid:${MAIL_LOGO_CID}" width="40" height="40" alt="Sporthouse" style="display:block;border:0"></td>` +
  `<td style="vertical-align:middle;font-size:16px;font-weight:600;color:#18181b;letter-spacing:.2px">Sporthouse Materiaal</td>` +
  `</tr></table>`

function wrap(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#18181b;max-width:560px">${MAIL_HEADER}${body}` +
    `<p style="margin-top:20px;color:#a1a1aa;font-size:12px">Sporthouse Materiaal — automatische mail uit de materiaalplanner.</p></div>`
}

/** Bevestiging bij een nieuwe boeking, of bij een boeking met nieuwe data. */
export function confirmationMail(b: MailBooking, changed: boolean): MailContent {
  const what = whatShort(b)
  const period = mailPeriod(b)
  const subject = oneLine(`${changed ? 'Boeking gewijzigd' : 'Materiaal geboekt'}: ${what} · ${period}`)
  const intro = changed ? 'De data van deze boeking zijn gewijzigd.' : 'Dit materiaal is voor je geboekt.'
  const l = lines(b), d = details(b), w = warnings(b)
  return {
    subject,
    text: [intro, '', ...l.text, '', ...d.text, ...w.text, '', `Bekijk in de planner: ${b.link}`, '', 'In de bijlage zit een agenda-item (.ics).'].join('\n'),
    html: wrap(`<p style="margin:0 0 12px">${esc(intro)}</p>${l.html}${d.html}${w.html}` +
      `<p style="margin:0"><a href="${esc(b.link)}" style="color:#3A913F">Bekijk in de planner</a></p>`),
  }
}

/** Annulering: zelfde ontvangers als de bevestiging; het agenda-item verdwijnt via de bijlage. */
export function cancellationMail(b: MailBooking): MailContent {
  const subject = oneLine(`Geannuleerd: ${whatShort(b)} · ${mailPeriod(b)}`)
  const intro = 'Deze boeking is geannuleerd. Het materiaal is weer vrij.'
  const l = lines(b), d = details(b)
  return {
    subject,
    text: [intro, '', ...l.text, '', ...d.text, '', 'Het agenda-item in de bijlage haalt de afspraak uit je agenda.'].join('\n'),
    html: wrap(`<p style="margin:0 0 12px">${esc(intro)}</p>${l.html}${d.html}`),
  }
}

/** Herinnering op de ochtend van de terugbrengdag. */
export function reminderMail(b: MailBooking): MailContent {
  const what = whatShort(b)
  const subject = oneLine(`Vandaag terugbrengen: ${what}`)
  const intro = b.endTime
    ? `Vandaag is de laatste dag van deze boeking. Breng het materiaal vandaag terug, om ${b.endTime}.`
    : 'Vandaag is de laatste dag van deze boeking. Breng het materiaal vandaag terug.'
  const l = lines(b), d = details(b)
  return {
    subject,
    text: [intro, '', ...l.text, '', ...d.text, '', `Bekijk in de planner: ${b.link}`].join('\n'),
    html: wrap(`<p style="margin:0 0 12px">${esc(intro)}</p>${l.html}${d.html}` +
      `<p style="margin:0"><a href="${esc(b.link)}" style="color:#3A913F">Bekijk in de planner</a></p>`),
  }
}

/** Tekst in een .ics-veld: komma's, puntkomma's en regeleinden ontsnappen; regels van max 75 tekens. */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 75) { out.push(rest.slice(0, 75)); rest = ` ${rest.slice(75)}` }
  out.push(rest)
  return out.join('\r\n')
}
const icsDate = (iso: string) => iso.replace(/-/g, '')

/** Brusselse tijdzone in de .ics, zodat een agenda de kloktijd juist toont (ook rond de wissel). */
const VTIMEZONE_BRUSSELS = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Brussels',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
]

/**
 * Wanneer: zonder uren een item over hele dagen (DTEND = de dag ná het
 * einde); met een uur een item op Brusselse kloktijd (TZID), waarbij een
 * leeg uur middernacht is — net als de bezetting in de planner.
 */
function icsWhen(b: Pick<MailBooking, 'start' | 'end' | 'startTime' | 'endTime'>): string[] {
  if (!b.startTime && !b.endTime) return [`DTSTART;VALUE=DATE:${icsDate(b.start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(b.end, 1))}`]
  const s = bookingSlot(b.start, b.startTime, b.end, b.endTime)
  const local = (m: string) => `${icsDate(m.slice(0, 10))}T${m.slice(11, 13)}${m.slice(14, 16)}00`
  return [`DTSTART;TZID=Europe/Brussels:${local(s.start)}`, `DTEND;TZID=Europe/Brussels:${local(s.end)}`]
}

export type IcsMethod = 'REQUEST' | 'CANCEL'

export interface IcsOptions {
  method: IcsMethod
  /** Hoger bij elke nieuwe versie; zie icsSequence. */
  sequence: number
  now?: Date
  /** Afzender (MailConfig.from); zonder blijft het een uitnodiging zonder organisator. */
  organizer?: string | null
  /** De ontvanger van deze mail: één uitnodiging per ontvanger. */
  attendee?: string | null
}

/**
 * Volgnummer van een versie: de seconden sinds 1970. Elke nieuwe mail (nieuwe
 * data, annulering) heeft er dus een hoger dan de vorige, zonder dat we het
 * ergens moeten bijhouden. Past tot 2038 in een 32-bit getal.
 */
export const icsSequence = (now: Date = new Date()) => Math.floor(now.getTime() / 1000)

/**
 * Agenda-item over hele dagen: van de ophaaldag tot en met de terugbrengdag
 * (DTEND is in .ics de dag ná het einde). Altijd dezelfde UID per boeking:
 * met een hogere SEQUENCE verschuift het bestaande item (REQUEST) of
 * verdwijnt het (CANCEL), in plaats van dat er een tweede bijkomt.
 */
export function icsFile(b: MailBooking, o: IcsOptions): string {
  const stamp = (o.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const summary = `Materiaal: ${whatShort(b, 3)}`
  const description = [`Voor: ${forWhom(b)}`, b.project ? `Project: ${b.project}` : null, ...b.responsibleWarnings, b.link].filter(Boolean).join('\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sporthouse//Materiaal//NL', 'CALSCALE:GREGORIAN', `METHOD:${o.method}`,
    ...(b.startTime || b.endTime ? VTIMEZONE_BRUSSELS : []),
    'BEGIN:VEVENT',
    `UID:materiaal-${b.id}@sporthouse`,
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${o.sequence}`,
    ...(o.organizer ? [`ORGANIZER;CN=Sporthouse Materiaal:mailto:${o.organizer}`] : []),
    ...(o.attendee ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${o.attendee}`] : []),
    `STATUS:${o.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    ...icsWhen(b),
    `SUMMARY:${icsText(summary)}`,
    `DESCRIPTION:${icsText(description)}`,
    `URL:${b.link}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT', 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n'
}

/** Een foutmelding kort en zonder het geheim, voor het logboek. */
export function mailErrorText(err: unknown, secret?: string): string {
  const e = err as { name?: string; message?: string }
  let text = e?.name === 'TimeoutError' ? 'Het mailscript antwoordde niet op tijd.' : String(e?.message || 'Onbekende fout')
  if (secret) text = text.split(secret).join('[geheim]')
  return text.slice(0, 300)
}
