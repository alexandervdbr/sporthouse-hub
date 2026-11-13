import type { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { meetsLevel, type FreelancerLevel } from './access'

// De poort voor elke interne freelancer-route: ingelogd (401), en het juiste
// niveau (403). Geeft de RLS-respecterende client mee, zodat de database een
// tweede keer controleert waar een route die client gebruikt.
export async function requireFreelancers(level: Exclude<FreelancerLevel, 'geen'>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Niet ingelogd', { status: 401 }) } as const
  if (!meetsLevel(user, level)) {
    return { error: new Response('Je hebt hier geen rechten voor.', { status: 403 }) } as const
  }
  return { supabase, user } as const
}

// Body lezen en valideren tegen een whitelist. Een onbekend veld, een fout
// type of geen geldige JSON is een 400 — er wordt nooit iets doorgegeven
// dat niet in het schema staat.
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { error: Response }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { error: new Response('Ongeldig verzoek.', { status: 400 }) }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path?.length ? ` (${issue.path.join('.')})` : ''
    return { error: new Response(`Ongeldige invoer${where}.`, { status: 400 }) }
  }
  return { data: parsed.data }
}

// Route-parameters die een uuid moeten zijn. Een ongeldige waarde is een 404,
// net als een id dat niet bestaat.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
