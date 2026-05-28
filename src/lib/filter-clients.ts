import type { User } from '@supabase/supabase-js'
import type { Client } from '@/types/database'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export function filterClientsForUser(clients: Client[], user: User | null): Client[] {
  if (!user) return []
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  if (isAdmin) return clients

  const perms: { sections: string[]; clients: string[] } | null = user.user_metadata?.permissions ?? null
  if (perms === null) return clients // no permissions configured → no restrictions

  const allowedIds: string[] = perms.clients ?? []
  if (allowedIds.length === 0) return clients // empty clients list → no restriction configured

  return clients.filter(c => allowedIds.includes(c.id))
}
