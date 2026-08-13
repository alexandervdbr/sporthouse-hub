import { ADMIN_EMAILS } from '@/lib/auth-permissions'

export type SporthouseSection = 'finance' | 'administration'

type SessionUser = { email?: string | null; app_metadata?: Record<string, unknown> }

export function isSporthouseSection(value: string | null): value is SporthouseSection {
  return value === 'finance' || value === 'administration'
}

// 'finance' -> financien_bekijken/financien_beheren
// 'administration' -> administratie_bekijken/administratie_beheren
function permKey(section: SporthouseSection) {
  return section === 'finance' ? 'financien' : 'administratie'
}

function sectionsOf(user: SessionUser): string[] {
  const perms = user.app_metadata?.permissions as { sections?: string[] } | null | undefined
  return perms?.sections ?? []
}

function isAdminUser(user: SessionUser) {
  const sections = sectionsOf(user)
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
}

// Read access: view or manage on the relevant section.
export function canViewSection(user: SessionUser, section: SporthouseSection) {
  const sections = sectionsOf(user)
  const pk = permKey(section)
  return isAdminUser(user) || sections.includes(`${pk}_bekijken`) || sections.includes(`${pk}_beheren`)
}

// Write access: upload, edit, delete, restore, and all folder mutations.
// Deliberately stricter than the client-files equivalent — there is no
// "own uploads" escape hatch here, because these are the finance and
// administration files and the section permission is the whole point.
export function canManageSection(user: SessionUser, section: SporthouseSection) {
  const sections = sectionsOf(user)
  return isAdminUser(user) || sections.includes(`${permKey(section)}_beheren`)
}
