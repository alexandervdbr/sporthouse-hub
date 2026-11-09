import { addDays } from './dates'
import { MAIL_LOGO_CID } from './mail-logo'
import { bookingSlot, slotLabel } from './times'
import { periodLabel } from './views'

// Mails van de materiaalplanner, via een eigen Google Apps Script
// (scripts/apps-script/materiaal-mail/Code.gs): de hub maakt de inhoud en
// stuurt die met een gedeeld geheim naar het script, dat verstuurt met MailApp
// als "Sporthouse Materiaal". Los van de poolwagenmail.
//
// - bevestiging: bij een nieuwe boeking of nieuwe data
// - annulering: naar dezelfde ontvangers
// - herinnering: de ochtend van de terugbrengdag
//
// De agenda loopt niet via een bijlage maar via een echte afspraak in Google
// Calendar, die het script maakt, verplaatst of weghaalt (calendarEvent
// hieronder), zonder mails van Google: de mails komen alleen van ons. Een .ics in een mail van
// MailApp toont Gmail niet als uitnodiging.
//
// Alles hier is puur (geen database, geen netwerk); mail-server.ts haalt de
// gegevens op, houdt het logboek bij en verstuurt.

export interface MailConfig {
  url: string
  secret: string
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
  return { url, secret }
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

/** Kop van elke mail: alleen de titel. */
export const MAIL_HEADER = `<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#18181b;letter-spacing:.2px">Sporthouse Materiaal</p>`

/** Onderaan elke mail: een dunne lijn, dan het beeldmerk (inline, cid:logo, 48 px) met "Sporthouse Materiaal" ernaast. */
export const MAIL_SIGNATURE =
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-collapse:collapse;border-top:1px solid #e4e4e7;width:100%"><tr><td style="padding-top:14px">` +
  `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>` +
  `<td style="padding:0 10px 0 0;vertical-align:middle"><img src="cid:${MAIL_LOGO_CID}" width="48" height="48" alt="Sporthouse" style="display:block;border:0"></td>` +
  `<td style="vertical-align:middle;font-size:14px;font-weight:600;color:#18181b">Sporthouse Materiaal` +
  `<br><span style="font-weight:400;font-size:12px;color:#a1a1aa">Automatische mail uit de materiaalplanner</span></td>` +
  `</tr></table></td></tr></table>`

function wrap(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#18181b;max-width:560px">${MAIL_HEADER}${body}${MAIL_SIGNATURE}</div>`
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
    text: [intro, '', ...l.text, '', ...d.text, ...w.text, '', `Bekijk in de planner: ${b.link}`, '', '— Sporthouse Materiaal'].join('\n'),
    html: wrap(`<p style="margin:0 0 12px">${esc(intro)}</p>${l.html}${d.html}${w.html}` +
      `<p style="margin:0"><a href="${esc(b.link)}" style="color:#3A913F">Bekijk in de planner</a></p>`),
  }
}

/** Annulering: zelfde ontvangers als de bevestiging (de afspraak in de agenda haalt het script weg). */
export function cancellationMail(b: MailBooking): MailContent {
  const subject = oneLine(`Geannuleerd: ${whatShort(b)} · ${mailPeriod(b)}`)
  const intro = 'Deze boeking is geannuleerd. Het materiaal is weer vrij.'
  const l = lines(b), d = details(b)
  return {
    subject,
    text: [intro, '', ...l.text, '', ...d.text, '', '— Sporthouse Materiaal'].join('\n'),
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
    text: [intro, '', ...l.text, '', ...d.text, '', `Bekijk in de planner: ${b.link}`, '', '— Sporthouse Materiaal'].join('\n'),
    html: wrap(`<p style="margin:0 0 12px">${esc(intro)}</p>${l.html}${d.html}` +
      `<p style="margin:0"><a href="${esc(b.link)}" style="color:#3A913F">Bekijk in de planner</a></p>`),
  }
}

/** Een tijdstip zoals de Calendar API het wil: een datum (hele dag) of kloktijd met tijdzone. */
export type CalendarTime = { date: string } | { dateTime: string; timeZone: 'Europe/Brussels' }

export interface CalendarEvent {
  summary: string
  description: string
  start: CalendarTime
  end: CalendarTime
  attendees: { email: string; responseStatus: 'accepted' }[]
}

/**
 * De afspraak van een boeking in Google Calendar. Zonder uren een afspraak
 * over hele dagen (het einde is in de Calendar API de dag na de laatste dag);
 * met een uur Brusselse kloktijd met timeZone Europe/Brussels, waarbij een
 * leeg uur middernacht is, net als de bezetting in de planner. Niets wordt
 * hier naar UTC omgerekend; dat doet Google zelf met de tijdzone erbij.
 * Alleen gasten met een geldig adres.
 */
export function calendarEvent(b: MailBooking, guests: string[]): CalendarEvent {
  const allDay = !b.startTime && !b.endTime
  const s = bookingSlot(b.start, b.startTime, b.end, b.endTime)
  const at = (m: string): CalendarTime => ({ dateTime: `${m}:00`, timeZone: 'Europe/Brussels' })
  const what = [...b.kits.map(k => `${k.name}${k.parts.length ? ` (${k.parts.join(', ')})` : ''}`), ...b.loose]
  return {
    summary: `Materiaal: ${whatShort(b, 3)} · ${forWhom(b)}`,
    description: [...what, '', `Voor: ${forWhom(b)}`, ...(b.project ? [`Project: ${b.project}`] : []), ...b.responsibleWarnings, '', b.link].join('\n'),
    start: allDay ? { date: b.start } : at(s.start),
    end: allDay ? { date: addDays(b.end, 1) } : at(s.end),
    // Al aanvaard: Google mailt niet (de hub doet dat), en de gast hoeft niet op "Ja" te klikken.
    attendees: mailRecipients(guests).map(email => ({ email, responseStatus: 'accepted' as const })),
  }
}

/** Een foutmelding kort en zonder het geheim, voor het logboek. */
export function mailErrorText(err: unknown, secret?: string): string {
  const e = err as { name?: string; message?: string }
  let text = e?.name === 'TimeoutError' ? 'Het mailscript antwoordde niet op tijd.' : String(e?.message || 'Onbekende fout')
  if (secret) text = text.split(secret).join('[geheim]')
  return text.slice(0, 300)
}
