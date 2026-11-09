import { createAdminClient } from '@/lib/supabase/server'
import { MAIL_LOGO_CID, MAIL_LOGO_PNG_BASE64 } from './mail-logo'
import { todayInBrussels } from './dates'
import { normalizeTime } from './times'
import { effectiveResponsible, ownResponsible, responsibleWarning, type EffectiveResponsible } from './responsible'
import {
  calendarEvent, cancellationMail, confirmationKey, confirmationMail, mailConfig, mailErrorText, mailRecipients, reminderMail, shouldConfirm,
  type MailBooking, type MailConfig, type MailContent,
} from './mail'
import type { GearClientRef, GearResponsible } from './types'

// Mails versturen voor de materiaalplanner (zie mail.ts voor de inhoud).
//
// Met de service key: de mail gaat ook naar wie de boeking niet zelf maakte,
// en het logboek (gear_mail_log, 0082) is alleen voor de server. Elke mail
// wordt eerst in het logboek gezet; de unieke sleutel daar zorgt dat dezelfde
// mail nooit twee keer vertrekt. Mislukt het versturen, dan staat de fout in
// het logboek — een boeking wordt er nooit door tegengehouden.
//
// Daarnaast de agenda: per boeking één afspraak in de agenda "Sporthouse
// Materiaal" van het verzendaccount (via hetzelfde script), met alleen de
// persoon voor wie geboekt is als gast (niet wie boekte, niet de contactpersoon). Het id staat op de boeking (0086); nieuwe data
// verplaatsen de afspraak, annuleren haalt ze weg. Mislukt dat, dan staat de
// fout op de boeking (calendar_error) en gaan boeking en mail gewoon door.

const TIMEOUT_MS = 20_000
type Admin = ReturnType<typeof createAdminClient>
type Kind = 'bevestiging' | 'herinnering' | 'annulering'

function siteOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (env) return env
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return vercel ? `https://${vercel}` : 'https://localhost:3000'
}

async function emailOf(admin: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data } = await admin.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}

interface Loaded {
  mail: MailBooking
  bookedFor: string | null
  createdBy: string | null
  freelancerId: string | null
  contactUserIds: string[]
  cancelled: boolean
  calendarEventId: string | null
}

/** Een boeking met alles wat de mail nodig heeft: namen, onderdelen, verantwoordelijken. */
async function loadBooking(admin: Admin, bookingId: string): Promise<Loaded | null> {
  const { data: b, error } = await admin.from('gear_bookings')
    .select('id, start_date, end_date, start_time, end_time, person_name, external_name, booked_for_user_id, freelancer_id, client_id, project_id, note, created_by, cancelled_at, calendar_event_id, gear_booking_items(item_id, via_kit_id, via_kit_name)')
    .eq('id', bookingId).maybeSingle()
  // Een leesfout is geen "boeking bestaat niet": die moet zichtbaar worden.
  if (error) throw new Error(`Boeking niet te lezen: ${error.message}`)
  if (!b) return null
  const lines = (b.gear_booking_items ?? []) as { item_id: string; via_kit_id: string | null; via_kit_name: string | null }[]

  const RESP = 'responsible_client_id, responsible_user_id, responsible_name, contact_user_id, contact_name'
  const viaKitIds = [...new Set(lines.map(l => l.via_kit_id).filter((x): x is string => !!x))]
  const [items, kits, members] = await Promise.all([
    admin.from('gear_items').select(`id, name, sort_order, ${RESP}`).in('id', lines.map(l => l.item_id)),
    viaKitIds.length ? admin.from('gear_kits').select(`id, name, ${RESP}`).in('id', viaKitIds) : Promise.resolve({ data: [] }),
    admin.from('gear_kit_members').select('kit_id, item_id, sort_order').is('removed_at', null).in('item_id', lines.map(l => l.item_id)),
  ])
  type Row = GearResponsible & { id: string; name: string; sort_order?: number }
  const itemById = new Map(((items.data ?? []) as Row[]).map(i => [i.id, i]))
  const kitById = new Map(((kits.data ?? []) as Row[]).map(k => [k.id, k]))
  const order = new Map((members.data ?? []).map(m => [m.item_id, m.sort_order as number]))

  const clientIds = [...new Set([b.client_id, ...[...itemById.values(), ...kitById.values()].map(r => r.responsible_client_id)].filter((x): x is string => !!x))]
  const [clients, project] = await Promise.all([
    clientIds.length ? admin.from('clients').select('id, name, color').in('id', clientIds) : Promise.resolve({ data: [] }),
    b.project_id ? admin.from('projects').select('name').eq('id', b.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const clientMap = new Map(((clients.data ?? []) as GearClientRef[]).map(c => [c.id, c]))

  // Wat er geboekt is: per kit de onderdelen die meegaan, dan de losse items.
  const kitsOut: MailBooking['kits'] = []
  for (const kid of viaKitIds) {
    const parts = lines.filter(l => l.via_kit_id === kid).map(l => itemById.get(l.item_id))
      .filter((i): i is Row => !!i).sort((a, c) => (order.get(a.id) ?? 0) - (order.get(c.id) ?? 0))
    kitsOut.push({ name: kitById.get(kid)?.name ?? lines.find(l => l.via_kit_id === kid)?.via_kit_name ?? 'Kit', parts: parts.map(p => p.name) })
  }
  const loose = lines.filter(l => !l.via_kit_id).map(l => itemById.get(l.item_id)?.name).filter((n): n is string => !!n)

  // Verantwoordelijken: van de kits, de eigen van de onderdelen, en van de losse items.
  const resp = new Map<string, { r: EffectiveResponsible; contactUser: string | null }>()
  const add = (r: EffectiveResponsible | null, src: GearResponsible | undefined) => {
    if (r && !resp.has(`${r.name}|${r.contact ?? ''}`)) resp.set(`${r.name}|${r.contact ?? ''}`, { r, contactUser: src?.contact_user_id ?? null })
  }
  for (const kid of viaKitIds) { const k = kitById.get(kid); if (k) add(ownResponsible(k, clientMap), k) }
  for (const l of lines) {
    const i = itemById.get(l.item_id)
    if (!i) continue
    if (l.via_kit_id) add(ownResponsible(i, clientMap), i)
    else add(effectiveResponsible(i, null, clientMap), i)
  }

  const client = b.client_id ? clientMap.get(b.client_id)?.name ?? null : null
  return {
    mail: {
      id: b.id, start: b.start_date, end: b.end_date, startTime: normalizeTime(b.start_time), endTime: normalizeTime(b.end_time),
      person: b.external_name ?? b.person_name, client, project: (project.data as { name: string } | null)?.name ?? null, note: b.note,
      kits: kitsOut, loose,
      responsibleWarnings: [...resp.values()].map(x => responsibleWarning(x.r)),
      link: `${siteOrigin()}/materiaal?view=day&date=${b.start_date}`,
    },
    bookedFor: b.booked_for_user_id, createdBy: b.created_by, freelancerId: b.freelancer_id,
    contactUserIds: [...new Set([...resp.values()].map(x => x.contactUser).filter((x): x is string => !!x))],
    cancelled: !!b.cancelled_at,
    calendarEventId: b.calendar_event_id ?? null,
  }
}

/** De persoon voor wie geboekt is, en wie de boeking maakte als dat iemand anders is. */
async function holderEmails(admin: Admin, l: Loaded): Promise<string[]> {
  return mailRecipients([...(await bookedForEmails(admin, l)), await emailOf(admin, l.createdBy)])
}

/**
 * Alleen de persoon voor wie geboekt is (collega of freelancer): die krijgt
 * de afspraak in zijn agenda. Wie voor iemand anders boekt, krijgt de mail,
 * maar geen afspraak; een externe naam of alleen een klant: geen gast.
 */
async function bookedForEmails(admin: Admin, l: Loaded): Promise<string[]> {
  const freelancer = l.freelancerId
    ? (await admin.from('freelancers').select('email').eq('id', l.freelancerId).maybeSingle()).data?.email ?? null
    : null
  return mailRecipients([await emailOf(admin, l.bookedFor), freelancer])
}

/** Iets naar het script sturen (met het geheim); geeft het antwoord terug of gooit met de fout. */
async function callScript<T extends object>(config: MailConfig, payload: object): Promise<T> {
  // Apps Script antwoordt met een doorverwijzing naar het eigenlijke antwoord;
  // fetch volgt die. Het script zegt altijd 200, met { ok, error }.
  const res = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.secret, ...payload }),
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Het mailscript antwoordde ${res.status}.`)
  let body: { ok?: boolean; error?: string } & T
  try { body = await res.json() } catch { throw new Error('Het mailscript antwoordde niet zoals verwacht. Staat de toegang van de webapp op "Iedereen"?') }
  if (!body.ok) throw new Error(body.error || 'Het mailscript weigerde.')
  return body
}

async function post(config: MailConfig, to: string, content: MailContent): Promise<void> {
  await callScript(config, {
    to, subject: content.subject, html: content.html, text: content.text,
    // Het logo onderaan, als inline-afbeelding (cid:logo in de html).
    inlineImages: [{ cid: MAIL_LOGO_CID, name: 'sporthouse.png', mimeType: 'image/png', base64: MAIL_LOGO_PNG_BASE64 }],
  })
}

/**
 * De afspraak in de agenda maken of bijwerken (upsert), of weghalen (delete).
 * Bewaart het id en de uitkomst op de boeking; gooit nooit.
 */
async function syncCalendar(admin: Admin, config: MailConfig, l: Loaded, op: 'upsert' | 'delete', guests: string[]): Promise<void> {
  try {
    if (op === 'delete') {
      if (!l.calendarEventId) return
      await callScript(config, { action: 'agenda', op, eventId: l.calendarEventId })
      await admin.from('gear_bookings').update({ calendar_event_id: null, calendar_error: null, calendar_synced_at: new Date().toISOString() }).eq('id', l.mail.id)
      return
    }
    const res = await callScript<{ eventId?: string }>(config, { action: 'agenda', op, eventId: l.calendarEventId, event: calendarEvent(l.mail, guests) })
    await admin.from('gear_bookings').update({ calendar_event_id: res.eventId ?? l.calendarEventId, calendar_error: null, calendar_synced_at: new Date().toISOString() }).eq('id', l.mail.id)
  } catch (e) {
    const msg = mailErrorText(e, config.secret)
    console.error('Materiaal: agenda niet bijgewerkt:', msg)
    await admin.from('gear_bookings').update({ calendar_error: msg }).eq('id', l.mail.id)
  }
}

/**
 * Eén mail naar één ontvanger, hooguit één keer: eerst de rij in het logboek
 * (lukt dat niet omdat ze er al is, dan niets), dan versturen, dan de uitkomst.
 */
async function sendOnce(admin: Admin, config: MailConfig, bookingId: string, kind: Kind, key: string, to: string, content: MailContent)
  : Promise<'verstuurd' | 'al_verstuurd' | 'mislukt'> {
  const { data, error } = await admin.from('gear_mail_log').insert({ booking_id: bookingId, kind, key, recipient: to }).select('id').single()
  if (error) {
    if (error.code === '23505') return 'al_verstuurd'
    console.error('Materiaal: mail niet gelogd:', error.message)
    return 'mislukt'
  }
  try {
    await post(config, to, content)
    await admin.from('gear_mail_log').update({ sent_at: new Date().toISOString() }).eq('id', data.id)
    return 'verstuurd'
  } catch (e) {
    const msg = mailErrorText(e, config.secret)
    console.error('Materiaal: mail niet verstuurd:', msg)
    await admin.from('gear_mail_log').update({ error: msg }).eq('id', data.id)
    return 'mislukt'
  }
}

/** Wie een bevestiging of annulering krijgt: de persoon, de maker, en de contactpersonen. */
async function bookingRecipients(admin: Admin, l: Loaded): Promise<string[]> {
  const contacts = await Promise.all(l.contactUserIds.map(id => emailOf(admin, id)))
  return mailRecipients([...(await holderEmails(admin, l)), ...contacts])
}

/**
 * Wat er misliep, op de boeking zelf (calendar_error), zodat het niet alleen
 * in de serverlogs staat. Lukt ook dat niet, dan alleen de log.
 */
async function noteProblem(bookingId: string, what: string, err?: unknown, secret?: string): Promise<void> {
  const msg = err === undefined ? what : `${what}: ${mailErrorText(err, secret)}`
  console.error(`Materiaal: ${msg}`)
  try { await createAdminClient().from('gear_bookings').update({ calendar_error: msg.slice(0, 300) }).eq('id', bookingId) } catch { /* alleen de log */ }
}

const NOT_CONFIGURED = 'Mail en agenda niet ingesteld (MATERIAAL_MAIL_WEBHOOK_URL / MATERIAAL_MAIL_SECRET ontbreekt of is ongeldig op deze omgeving)'

/**
 * Bevestiging na boeken of nieuwe data: naar de persoon, de maker (als dat
 * iemand anders is) en de contactpersonen van verantwoordelijk materiaal.
 * Gooit nooit; loopt na het antwoord aan de gebruiker (after()).
 */
export async function sendBookingConfirmation(bookingId: string, changed: boolean): Promise<void> {
  try {
    const config = mailConfig()
    if (!config) return noteProblem(bookingId, NOT_CONFIGURED)
    const admin = createAdminClient()
    const l = await loadBooking(admin, bookingId)
    // Achteraf ingevoerd en al voorbij: geen mail en geen afspraak.
    if (!l || l.cancelled || !shouldConfirm(l.mail.end, todayInBrussels())) return
    const content = confirmationMail(l.mail, changed)
    const to = await bookingRecipients(admin, l)
    for (const r of to) {
      await sendOnce(admin, config, l.mail.id, 'bevestiging', confirmationKey(l.mail.start, l.mail.end, l.mail.startTime, l.mail.endTime), r, content)
    }
    await syncCalendar(admin, config, l, 'upsert', await bookedForEmails(admin, l))
  } catch (e) {
    await noteProblem(bookingId, 'Bevestiging mislukt', e)
  }
}

/**
 * Annulering: naar dezelfde ontvangers als de bevestiging, en de afspraak uit
 * de agenda (Google mailt de gasten). Geen mail voor een boeking die al
 * voorbij was, en hooguit één keer per ontvanger (logboek, sleutel 'annulering').
 */
export async function sendBookingCancellation(bookingId: string): Promise<void> {
  try {
    const config = mailConfig()
    if (!config) return noteProblem(bookingId, NOT_CONFIGURED)
    const admin = createAdminClient()
    const l = await loadBooking(admin, bookingId)
    if (!l || !l.cancelled) return
    // Een afspraak die er nog staat, gaat altijd weg; de mail alleen als de boeking nog liep of kwam.
    await syncCalendar(admin, config, l, 'delete', [])
    if (!shouldConfirm(l.mail.end, todayInBrussels())) return
    const content = cancellationMail(l.mail)
    for (const r of await bookingRecipients(admin, l)) {
      await sendOnce(admin, config, l.mail.id, 'annulering', 'annulering', r, content)
    }
  } catch (e) {
    await noteProblem(bookingId, 'Annuleringsmail mislukt', e)
  }
}

/**
 * Herinneringen van vandaag: elke niet-geannuleerde boeking die vandaag
 * eindigt, naar de persoon en de maker. Twee keer aanroepen verstuurt niets
 * twee keer (logboek).
 */
export async function sendDueReminders(today: string): Promise<{ verstuurd: number; al_verstuurd: number; mislukt: number; geen_adres: number }> {
  const out = { verstuurd: 0, al_verstuurd: 0, mislukt: 0, geen_adres: 0 }
  const config = mailConfig()
  if (!config) throw new Error('De mail is niet ingesteld (MATERIAAL_MAIL_WEBHOOK_URL / MATERIAAL_MAIL_SECRET).')
  const admin = createAdminClient()
  const { data, error } = await admin.from('gear_bookings').select('id').eq('end_date', today).is('cancelled_at', null)
  if (error) throw new Error(error.message)
  for (const { id } of data ?? []) {
    const l = await loadBooking(admin, id)
    if (!l || l.cancelled) continue
    const to = await holderEmails(admin, l)
    if (!to.length) { out.geen_adres++; continue }
    const content = reminderMail(l.mail)
    for (const r of to) out[await sendOnce(admin, config, id, 'herinnering', today, r, content)]++
  }
  return out
}

/** Bij wijzigen: alleen een nieuwe bevestiging als de data of de uren veranderden. */
export function datesChanged(
  before: { start_date: string; end_date: string; start_time?: string | null; end_time?: string | null } | null,
  after: { p_start_date: string; p_end_date: string; p_start_time?: string | null; p_end_time?: string | null },
): boolean {
  return !!before && (before.start_date !== after.p_start_date || before.end_date !== after.p_end_date
    || normalizeTime(before.start_time) !== (after.p_start_time ?? null) || normalizeTime(before.end_time) !== (after.p_end_time ?? null))
}
