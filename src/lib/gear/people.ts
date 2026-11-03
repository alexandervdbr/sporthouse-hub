import type { GearPerson } from './types'

// Wie in de materiaalplanner als collega gekozen kan worden: de echte
// accounts van het platform, geen contacten en geen ingetypte namen.
// Freelancer-accounts horen in het freelancerveld; verlopen accounts doen
// niet meer mee (de nachtelijke cron ruimt ze straks op).

export interface AccountLike {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
  app_metadata?: Record<string, unknown> | null
}

export function activePeople(accounts: AccountLike[], today: string): GearPerson[] {
  return accounts
    .filter(a => a.app_metadata?.freelancer !== true)
    .filter(a => {
      const until = a.app_metadata?.expires_at
      return typeof until !== 'string' || until.slice(0, 10) >= today
    })
    .map(a => {
      const meta = a.user_metadata ?? {}
      const full = typeof meta.full_name === 'string' && meta.full_name.trim() ? meta.full_name.trim()
                 : typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim()
                 : null
      const email = a.email ?? ''
      return { id: a.id, name: full ?? email, email }
    })
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}
