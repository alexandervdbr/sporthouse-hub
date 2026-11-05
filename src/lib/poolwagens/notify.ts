import { createAdminClient } from '@/lib/supabase/server'
import { poolwagenAccess } from './access'
import { pushToUsers } from './push'
import { formatShort } from './time'
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
