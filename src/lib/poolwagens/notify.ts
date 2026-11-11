import { createAdminClient } from '@/lib/supabase/server'
import { SITE_URL } from '@/lib/site-url'
import { poolwagenAccess } from './access'
import { reservationMail, trySendMail } from './mail'
import { pushToUsers } from './push'
import { formatPeriod, formatShort } from './time'
import type { UserClient } from './server'

// Meldingen die de poolwagens zelf versturen. Gooien nooit.

/** Accounts die poolwagens beheren (voor de push bij een schademelding). Alleen lezen. */
export async function managerIds(): Promise<string[]> {
  try {
    const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 })
    if (error) return []
    return data.users.filter(u => poolwagenAccess(u).manage).map(u => u.id)
  } catch {
    return []
  }
}

/**
 * Te laat terug: wie de volgende reservatie op die wagen heeft, krijgt één
 * push. De database kiest de reservaties en zet ze meteen op "verwittigd",
 * zodat twee tabbladen tegelijk geen dubbele push geven. Aangeroepen bij het
 * laden van de planning — er is geen timer.
 */
export async function notifyLateReturns(supabase: UserClient): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('pool_claim_late_notifications')
    if (error || !Array.isArray(data)) return
    type Row = { reservation_id: string; user_id: string | null; car_name: string; start_at: string; late_person: string }
    await Promise.all((data as Row[]).filter(r => r.user_id).map(r =>
      pushToUsers([r.user_id!], {
        title: `${r.car_name} is nog niet terug`,
        body: `${r.late_person} is te laat terug met ${r.car_name}. Jouw reservatie start ${formatShort(r.start_at)}.`,
        url: '/poolwagens',
      }),
    ))
  } catch (err) {
    console.error('Poolwagens: te-laat-meldingen mislukt:', err instanceof Error ? err.message : err)
  }
}

/**
 * Bevestigingsmail na het reserveren (ook "Nu vertrekken"): naar de persoon
 * voor wie de reservatie is, en naar wie reserveerde als dat iemand anders
 * is. Met de afspraken over tanken, schade en parkeren. Een reservatie die al
 * voorbij is (achteraf ingevoerd door beheer) krijgt geen mail.
 *
 * Loopt na het antwoord aan de gebruiker (after()); gooit nooit. Een
 * mislukte mail houdt de reservatie niet tegen en staat alleen in de log.
 */
export async function sendReservationConfirmation(reservationId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: r, error } = await admin.from('pool_car_reservations')
      .select('id, user_id, person_name, created_by, created_by_name, start_at, end_at, client_name, note, cancelled_at, pool_cars(name, license_plate)')
      .eq('id', reservationId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!r || r.cancelled_at || Date.parse(r.end_at) <= Date.now()) return

    const emailOf = async (id: string | null) =>
      id ? (await admin.auth.admin.getUserById(id)).data.user?.email ?? null : null
    const other = r.created_by && r.created_by !== r.user_id
    const recipients = [...new Set(
      [await emailOf(r.user_id), other ? await emailOf(r.created_by) : null]
        .filter((a): a is string => !!a).map(a => a.trim().toLowerCase()),
    )]

    const car = (Array.isArray(r.pool_cars) ? r.pool_cars[0] : r.pool_cars) as { name: string; license_plate: string } | null
    const outcome = await trySendMail(recipients, reservationMail({
      carName: car?.name ?? 'Poolwagen',
      plate: car?.license_plate ?? '',
      period: formatPeriod(r.start_at, r.end_at),
      person: r.person_name,
      bookedBy: other ? r.created_by_name : null,
      client: r.client_name,
      note: r.note,
      link: `${SITE_URL}/poolwagens`,
    }))
    if (outcome.status !== 'verstuurd') {
      console.error(`Poolwagens: bevestiging ${reservationId} niet verstuurd (${outcome.status})${outcome.error ? `: ${outcome.error}` : ''}`)
    }
  } catch (err) {
    console.error('Poolwagens: bevestigingsmail mislukt:', err instanceof Error ? err.message : err)
  }
}
