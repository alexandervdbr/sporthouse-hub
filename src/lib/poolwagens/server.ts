import { createClient } from '@/lib/supabase/server'
import { poolwagenAccess, type PoolwagenAccess } from './access'

// Gedeeld door de routes onder /api/poolwagens. Zelfde opzet als
// src/lib/gear/server.ts: de client van de ingelogde gebruiker, dus RLS en de
// functies in de database beslissen mee. De controle hier geeft alleen
// sneller een duidelijke 403.

export { dbErrorResponse, optionalText } from '@/lib/gear/server'

export async function requirePoolwagens(level: keyof PoolwagenAccess) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Niet ingelogd', { status: 401 }) } as const
  const access = poolwagenAccess(user)
  if (!access[level]) return { error: new Response('Je hebt hier geen rechten voor.', { status: 403 }) } as const
  return { supabase, user, access } as const
}
