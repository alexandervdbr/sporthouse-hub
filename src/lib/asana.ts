// Gedeeld door alle tools die naar Asana pushen (Content Planner, Briefing
// Builder).
//
// Iemand in Asana vinden gaat via het mailadres. Normaal is dat hetzelfde als
// in de hub, maar wie zich bij Asana met een ander adres aanmeldde, heeft op
// zijn contact een `asana_email` (0098). Die gaat voor; leeg = het hub-adres.

import { createAdminClient } from '@/lib/supabase/server'

export const ASANA_API = 'https://app.asana.com/api/1.0'

export function asanaHeaders() {
  return {
    Authorization: `Bearer ${process.env.ASANA_PAT}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

const norm = (e: string) => e.trim().toLowerCase()

// Hub-adres → afwijkend Asana-adres, voor wie er een heeft. Alleen de
// contacten onder de interne klanten: dat is het team.
export async function readAsanaOverrides(hubEmails: string[]): Promise<Record<string, string>> {
  const wanted = new Set(hubEmails.filter(Boolean).map(norm))
  if (wanted.size === 0) return {}

  const admin = createAdminClient()
  const { data: intern } = await admin.from('clients').select('id').eq('category', 'intern')
  const ids = (intern ?? []).map((c: { id: string }) => c.id)
  if (ids.length === 0) return {}

  const { data } = await admin
    .from('contacts')
    .select('email, asana_email')
    .in('client_id', ids)
    .not('asana_email', 'is', null)

  const out: Record<string, string> = {}
  for (const c of (data ?? []) as { email: string | null; asana_email: string | null }[]) {
    if (!c.email || !c.asana_email?.trim()) continue
    const key = norm(c.email)
    if (wanted.has(key)) out[key] = norm(c.asana_email)
  }
  return out
}

// Alle gebruikers van de workspace, per mailadres. Eén verzoek, ongeacht
// hoeveel mensen er opgezocht worden.
export async function fetchAsanaUsers(): Promise<Record<string, string> | null> {
  const res = await fetch(
    `${ASANA_API}/workspaces/${process.env.ASANA_WORKSPACE_GID}/users?opt_fields=email,gid`,
    { headers: asanaHeaders() },
  )
  if (!res.ok) return null
  const json = await res.json()
  const emailToGid: Record<string, string> = {}
  for (const u of json.data ?? []) {
    if (u.email) emailToGid[norm(u.email)] = u.gid
  }
  return emailToGid
}

// Geeft een functie terug die een hub-adres omzet naar een Asana-gebruiker
// (gid), of undefined als die persoon niet in Asana gevonden wordt.
export async function asanaResolver(hubEmails: string[]) {
  const [users, overrides] = await Promise.all([fetchAsanaUsers(), readAsanaOverrides(hubEmails)])
  if (!users) return null
  return (hubEmail: string | null | undefined): string | undefined => {
    if (!hubEmail) return undefined
    const key = norm(hubEmail)
    return users[overrides[key] ?? key]
  }
}
