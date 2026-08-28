import type { User } from '@supabase/supabase-js'
import type { Client } from '@/types/database'
import { hasClientAccess } from '@/lib/auth-permissions'

export function filterClientsForUser(clients: Client[], user: User | null): Client[] {
  if (!user) return []
  return clients.filter(c => hasClientAccess(user, c.id))
}
