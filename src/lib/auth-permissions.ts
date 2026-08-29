// Single source of truth for the hardcoded admin allowlist and the
// permission checks built on top of it. Import from here instead of
// redeclaring ADMIN_EMAILS locally — this file has no server-only
// dependencies, so it's safe to import from both server and client code.
//
// This is deliberately a break-glass fallback, not the primary admin path —
// both accounts below should also have 'beheer' granted through the admin
// panel, so day-to-day admin access has a visible, revocable route and this
// hardcoded list is only what's left if that panel-granted access is ever
// lost or misconfigured. It only ever gates UI/page routing; the DB-level
// RLS checks (see supabase/migrations/0023_client_access_rls_foundation.sql)
// deliberately don't know about it at all.
export const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

type PermissionUser = {
  email?: string | null
  app_metadata?: { permissions?: { sections?: string[]; clients?: string[] } } & Record<string, unknown>
} | null | undefined

export function getSections(user: PermissionUser): string[] {
  return user?.app_metadata?.permissions?.sections ?? []
}

export function isAdminUser(user: PermissionUser): boolean {
  return ADMIN_EMAILS.includes(user?.email ?? '') || getSections(user).includes('beheer')
}

export function hasSection(user: PermissionUser, section: string): boolean {
  return isAdminUser(user) || getSections(user).includes(section)
}

// Single source of truth for "can this user touch this specific client's
// data" — same semantics as the DB-level user_has_client_access() (see
// supabase/migrations/0023_client_access_rls_foundation.sql), for the many
// routes that use the admin/service-role client and so aren't covered by
// RLS at all. Admin -> full access; no permissions object configured ->
// full access; permissions.clients empty/missing -> full access (no
// restriction set); otherwise -> allow-list membership.
export function hasClientAccess(user: PermissionUser, clientId: string): boolean {
  if (isAdminUser(user)) return true
  const perms = user?.app_metadata?.permissions
  if (!perms) return true
  const allowedIds = perms.clients ?? []
  if (allowedIds.length === 0) return true
  return allowedIds.includes(clientId)
}
