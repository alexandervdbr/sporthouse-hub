import { ADMIN_EMAILS } from '@/lib/auth-permissions'

type SessionUser = { email?: string | null; app_metadata?: Record<string, unknown> }
type Perms = { sections?: string[]; clients?: string[] } | null

function permsOf(user: SessionUser): Perms {
  return (user.app_metadata?.permissions as Perms) ?? null
}

function isAdminUser(user: SessionUser) {
  const sections = permsOf(user)?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
}

// Dezelfde regel als elders: een lege clientlijst betekent geen beperking.
export function canSeeClient(user: SessionUser, clientId: string) {
  if (isAdminUser(user)) return true
  const perms = permsOf(user)
  if (perms === null) return true
  const allowed = perms.clients ?? []
  return allowed.length === 0 || allowed.includes(clientId)
}

// Bewerken vraagt een apart recht. Er bestaat geen "stagiair"-vlag in het
// systeem, dus wie niet mag bewerken herken je niet automatisch — een
// beheerder vinkt dit recht simpelweg niet aan. Zonder ingestelde permissies
// (perms === null) geldt volledige toegang, net als bij bestanden en planning.
export function canEditKennisbank(user: SessionUser, clientId: string) {
  if (!canSeeClient(user, clientId)) return false
  if (isAdminUser(user)) return true
  const perms = permsOf(user)
  if (perms === null) return true
  return (perms.sections ?? []).includes('kennisbank_bewerken')
}
