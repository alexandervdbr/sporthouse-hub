// Rollen en niveaus, bovenop de bestaande permissiesleutels.
//
// Alles wat het platform controleert blijft een losse sleutel in
// app_metadata.permissions.sections ('materiaal_toevoegen', 'planning', …),
// en dat is bewust zo gebleven: tientallen pagina's, routes en RLS-policies
// lezen die lijst al. Wat hier verandert is hoe je die lijst samenstelt.
//
// Vroeger vinkte je per persoon tot 45 vakjes aan. Nu kies je per onderdeel
// één niveau, en een niveau is een ladder: elk niveau bevat alles van het
// niveau eronder. Een rol is een set niveaus, en een persoon heeft één rol
// plus eventueel een paar afwijkingen. De server rekent dat om naar de
// sleutellijst — nooit de browser, anders kan iemand zichzelf rechten geven.
//
// Geen server-only imports: het beheerscherm gebruikt dezelfde catalogus om
// de keuzelijsten te tonen.

import { ADMIN_EMAILS } from '@/lib/auth-permissions'
import { PROJECTKALENDER_ENABLED } from '@/lib/features'

export interface AccessLevel {
  key: string
  label: string
  // Alleen de sleutels die dit niveau tóévoegt; de lagere niveaus tellen mee.
  adds: string[]
}

export interface AccessModule {
  key: string
  label: string
  group: string
  hint?: string
  levels: AccessLevel[]
}

const AAN_UIT = (key: string): AccessLevel[] => [
  { key: 'uit', label: 'Uit', adds: [] },
  { key: 'aan', label: 'Aan', adds: [key] },
]

const ALL_MODULES: AccessModule[] = [
  { key: 'dashboard',       label: 'Dashboard',       group: 'Algemeen', levels: AAN_UIT('dashboard') },
  { key: 'projecten',       label: 'Projecten',       group: 'Algemeen', levels: AAN_UIT('projecten') },
  { key: 'chat',            label: 'Chat',            group: 'Algemeen', levels: AAN_UIT('chat') },
  { key: 'vergaderingen',   label: 'Vergaderingen',   group: 'Algemeen', levels: AAN_UIT('vergaderingen') },
  { key: 'welkom_stagiair', label: 'Welkom stagiair', group: 'Algemeen', levels: AAN_UIT('welkom_stagiair') },
  { key: 'googlephotos',    label: 'Google Photos',   group: 'Algemeen', levels: AAN_UIT('googlephotos') },

  {
    key: 'team', label: 'Team', group: 'Mensen',
    levels: [
      { key: 'geen',      label: 'Geen',      adds: [] },
      { key: 'bekijken',  label: 'Bekijken',  adds: ['team'] },
      { key: 'toevoegen', label: 'Toevoegen', adds: ['team_toevoegen'] },
      { key: 'beheren',   label: 'Beheren',   adds: ['team_verwijderen'] },
    ],
  },
  {
    key: 'freelancers', label: 'Freelancers', group: 'Mensen',
    levels: [
      { key: 'geen',    label: 'Geen',    adds: [] },
      { key: 'beheren', label: 'Beheren', adds: ['freelancers'] },
    ],
  },

  {
    key: 'planning', label: 'Planning', group: 'Planning & kalenders',
    hint: 'Welke kolom iemand mag bewerken stel je per persoon in.',
    levels: [
      { key: 'geen',         label: 'Geen',                 adds: [] },
      { key: 'bekijken',     label: 'Bekijken',             adds: ['planning'] },
      { key: 'bewerken',     label: 'Bewerken',             adds: ['planning_volledig'] },
      { key: 'statistieken', label: 'Bewerken + statistieken', adds: ['planning_statistieken'] },
    ],
  },
  {
    key: 'projectkalender', label: 'Projectkalender', group: 'Planning & kalenders',
    levels: [
      { key: 'geen',      label: 'Geen',      adds: [] },
      { key: 'bekijken',  label: 'Bekijken',  adds: ['projectkalender'] },
      { key: 'toevoegen', label: 'Toevoegen', adds: ['projectkalender_toevoegen'] },
      { key: 'beheren',   label: 'Beheren',   adds: ['projectkalender_verwijderen'] },
    ],
  },
  {
    key: 'contentkalender', label: 'Contentkalender', group: 'Planning & kalenders',
    hint: 'Bekijken kan iedereen die de klant ziet.',
    levels: [
      { key: 'bekijken',  label: 'Alleen bekijken', adds: [] },
      { key: 'toevoegen', label: 'Posts toevoegen', adds: ['contentkalender_toevoegen'] },
      { key: 'beheren',   label: 'Beheren',         adds: ['contentkalender_verwijderen'] },
    ],
  },

  {
    key: 'klanten', label: 'Klanttools', group: 'Klanten',
    hint: 'De tools zelf ziet iedereen die de klant ziet. Bewerken = kennisbank en stijlvoorbeelden; beheren = ook bestanden verwijderen.',
    levels: [
      { key: 'gebruiken', label: 'Gebruiken', adds: [] },
      { key: 'bewerken',  label: 'Bewerken',  adds: ['kennisbank_bewerken', 'stijlvoorbeelden'] },
      { key: 'beheren',   label: 'Beheren',   adds: ['bestanden_verwijderen'] },
    ],
  },

  {
    key: 'materiaal', label: 'Materiaal', group: 'Werkvloer',
    hint: 'Eigen reservaties annuleren kan iedereen. Beheren = ook die van anderen, materiaal toevoegen/verwijderen, statistieken en externe verhuur.',
    levels: [
      { key: 'geen',       label: 'Geen',       adds: [] },
      { key: 'bekijken',   label: 'Bekijken',   adds: ['materiaal'] },
      // Eigen reservaties kan iedereen altijd annuleren; reservering_verwijderen
      // is die van een ander, en dat hoort bij beheren.
      { key: 'reserveren', label: 'Reserveren', adds: ['materiaal_reserveren'] },
      { key: 'beheren',    label: 'Beheren',    adds: ['reservering_verwijderen', 'materiaal_toevoegen', 'materiaal_verwijderen', 'stats_materiaal', 'materiaal_extern'] },
    ],
  },
  {
    key: 'preassist', label: 'Pré-assist', group: 'Werkvloer',
    hint: 'Beheren = edities aanmaken, andermans content verwijderen en downloaden.',
    levels: [
      { key: 'geen',      label: 'Geen',      adds: [] },
      { key: 'bekijken',  label: 'Bekijken',  adds: ['preassist'] },
      { key: 'bijdragen', label: 'Bijdragen', adds: ['preassist_toevoegen'] },
      { key: 'beheren',   label: 'Beheren',   adds: ['preassist_beheer', 'preassist_verwijderen', 'preassist_downloaden'] },
    ],
  },
  {
    key: 'mijn-gedacht', label: 'Mijn gedacht!', group: 'Werkvloer',
    levels: [
      { key: 'geen',      label: 'Geen',      adds: [] },
      { key: 'gebruiken', label: 'Gebruiken', adds: ['mijn-gedacht'] },
      { key: 'beheren',   label: 'Ook types aanmaken', adds: ['mijn_gedacht_types_beheren'] },
    ],
  },

  {
    key: 'wachtwoorden', label: 'Wachtwoorden', group: 'Gevoelig',
    hint: 'Welke wachtwoorden iemand ziet stel je per persoon in.',
    levels: [
      { key: 'geen',      label: 'Geen',      adds: [] },
      { key: 'bekijken',  label: 'Bekijken',  adds: ['wachtwoorden_bekijken'] },
      { key: 'toevoegen', label: 'Toevoegen', adds: ['wachtwoorden_toevoegen'] },
      { key: 'beheren',   label: 'Beheren',   adds: ['wachtwoorden_verwijderen'] },
    ],
  },
  {
    key: 'financien', label: 'Financiën', group: 'Gevoelig',
    levels: [
      { key: 'geen',     label: 'Geen',     adds: [] },
      { key: 'bekijken', label: 'Bekijken', adds: ['financien_bekijken'] },
      { key: 'beheren',  label: 'Beheren',  adds: ['financien_beheren'] },
    ],
  },
  {
    key: 'administratie', label: 'Administratie', group: 'Gevoelig',
    levels: [
      { key: 'geen',     label: 'Geen',     adds: [] },
      { key: 'bekijken', label: 'Bekijken', adds: ['administratie_bekijken'] },
      { key: 'beheren',  label: 'Beheren',  adds: ['administratie_beheren'] },
    ],
  },
  {
    key: 'beheer', label: 'Beheer', group: 'Gevoelig',
    hint: 'Gebruikers, rollen en klanten beheren. Wie dit heeft, mag overal alles.',
    levels: AAN_UIT('beheer'),
  },
]

// Onderdelen in de koelkast (zie src/lib/features.ts) verdwijnen uit het
// scherm en geven niemand nog rechten; hun niveaus blijven in de rollen staan
// en komen terug zodra het onderdeel weer aan staat.
const FROZEN_MODULES = new Set(PROJECTKALENDER_ENABLED ? [] : ['projectkalender'])
export const ACCESS_MODULES: AccessModule[] = ALL_MODULES.filter(m => !FROZEN_MODULES.has(m.key))

export const ACCESS_GROUPS = [...new Set(ACCESS_MODULES.map(m => m.group))]

// Elke sleutel die via een niveau te bereiken is. De test controleert dat
// dit exact de oude vakjeslijst is, zodat er niets tussen de mazen valt.
export const ALL_SECTION_KEYS = ACCESS_MODULES.flatMap(m => m.levels.flatMap(l => l.adds))

export type AccessLevels = Record<string, string>

// 'all': ziet alle klanten, tenzij je per persoon beperkt.
// 'chosen': ziet alleen de klanten die je per persoon aanvinkt — niets
// aangevinkt is ook echt niets (zie NO_CLIENTS).
export type ClientScope = 'all' | 'chosen'

export interface AccessRole {
  id: string
  label: string
  color: string
  levels: AccessLevels
  sort_order: number
  client_scope?: ClientScope
  requires_end_date?: boolean
}

// Een lege klantenlijst betekent overal "alle klanten" — in de app
// (hasClientAccess), in de RLS (user_has_client_access) en in de kalender.
// Om "geen enkele klant" te kunnen zeggen zonder al die plekken te wijzigen,
// staat er dan één id in de lijst die nooit bestaat. Het is een geldige uuid,
// zodat een .in('id', clients) gewoon niets teruggeeft in plaats van te falen.
export const NO_CLIENTS = '00000000-0000-0000-0000-000000000000'

export function chosenClients(clients: unknown): string[] {
  return Array.isArray(clients) ? clients.filter((c): c is string => typeof c === 'string' && c !== NO_CLIENTS) : []
}

function moduleByKey(key: string) {
  return ACCESS_MODULES.find(m => m.key === key)
}

export function lowestLevel(mod: AccessModule) {
  return mod.levels[0].key
}

export function highestLevel(mod: AccessModule) {
  return mod.levels[mod.levels.length - 1].key
}

// Een onbekend niveau (een oude rol, een module die hernoemd is) valt terug
// op het laagste. Bij twijfel minder, nooit meer.
export function levelOf(levels: AccessLevels | null | undefined, mod: AccessModule) {
  const wanted = levels?.[mod.key]
  return mod.levels.some(l => l.key === wanted) ? wanted! : lowestLevel(mod)
}

export function sectionsForLevels(levels: AccessLevels | null | undefined): string[] {
  const out: string[] = []
  for (const mod of ACCESS_MODULES) {
    const chosen = levelOf(levels, mod)
    for (const level of mod.levels) {
      out.push(...level.adds)
      if (level.key === chosen) break
    }
  }
  return out
}

// Rolniveaus met de afwijkingen van één persoon erover. Een afwijking die
// gelijk is aan de rol telt niet als afwijking — die wordt weggelaten, zodat
// "Creator + 2 aanpassingen" ook echt twee verschillen betekent.
export function effectiveLevels(roleLevels: AccessLevels | null | undefined, overrides: AccessLevels | null | undefined): AccessLevels {
  const out: AccessLevels = {}
  for (const mod of ACCESS_MODULES) {
    out[mod.key] = levelOf(overrides && mod.key in overrides ? overrides : roleLevels, mod)
  }
  return out
}

export function cleanOverrides(roleLevels: AccessLevels | null | undefined, overrides: AccessLevels | null | undefined): AccessLevels {
  const out: AccessLevels = {}
  if (!overrides) return out
  for (const [key, value] of Object.entries(overrides)) {
    const mod = moduleByKey(key)
    if (!mod || !mod.levels.some(l => l.key === value)) continue
    if (levelOf(roleLevels, mod) === value) continue
    out[key] = value
  }
  return out
}

// Omgekeerd: voor een account van vóór de rollen (alleen een sleutellijst)
// het hoogste niveau per module waarvan álle sleutels er zijn. Zo toont het
// scherm iets zinnigs en verandert opslaan niets wat al klopte.
export function levelsFromSections(sections: string[]): AccessLevels {
  const have = new Set(sections)
  const out: AccessLevels = {}
  for (const mod of ACCESS_MODULES) {
    let reached = lowestLevel(mod)
    for (const level of mod.levels) {
      if (!level.adds.every(k => have.has(k))) break
      reached = level.key
    }
    out[mod.key] = reached
  }
  return out
}

export function allHighest(): AccessLevels {
  return Object.fromEntries(ACCESS_MODULES.map(m => [m.key, highestLevel(m)]))
}

export function allLowest(): AccessLevels {
  return Object.fromEntries(ACCESS_MODULES.map(m => [m.key, lowestLevel(m)]))
}

export function levelLabel(mod: AccessModule, levelKey: string) {
  return mod.levels.find(l => l.key === levelKey)?.label ?? levelKey
}

export const ROLE_COLORS = ['#f59e0b', '#3b82f6', '#06b6d4', '#22c55e', '#ec4899', '#a855f7', '#ef4444', '#71717a']

export function slugifyRoleId(label: string) {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export interface AccessInput {
  access_role?: string | null
  overrides?: AccessLevels | null
  clients?: string[]
  planning_column?: string | null
  credentials?: string[] | null
}

// De enige plek waar een rol een sleutellijst wordt. Wat de browser stuurt is
// een rol en een paar afwijkingen; welke sleutels daaruit volgen beslist de
// server, met de rol zoals die nú in de database staat.
function resolveClients(role: AccessRole | null, prevRole: AccessRole | null, input: string[] | undefined, prev: unknown): string[] {
  if (role?.client_scope === 'chosen') {
    const picked = chosenClients(input !== undefined ? input : prev)
    return picked.length > 0 ? picked : [NO_CLIENTS]
  }
  if (input !== undefined) return chosenClients(input)
  // Van een rol met gekozen klanten naar een rol die alles ziet (een stagiair
  // die medewerker wordt): de oude keuze was een rolkeuze, geen beperking.
  if (prevRole?.client_scope === 'chosen') return []
  return chosenClients(prev)
}

export function buildAppMetadata(
  existing: Record<string, unknown> | undefined,
  input: AccessInput,
  roles: AccessRole[],
): Record<string, unknown> {
  const prevPerms = (existing?.permissions ?? {}) as Record<string, unknown>
  const roleId = input.access_role !== undefined ? input.access_role : (existing?.role as string | undefined) ?? null
  const role = roles.find(r => r.id === roleId) ?? null
  const rawOverrides = input.overrides !== undefined ? input.overrides : (existing?.role_overrides as AccessLevels | undefined)
  const overrides = cleanOverrides(role?.levels, rawOverrides)

  // Een account van vóór de rollen, waar alleen iets anders aan verandert
  // (klanten, vervaldatum): zijn sleutellijst blijft zoals hij was.
  const untouchedLegacy = !role && input.overrides === undefined && !existing?.role_overrides
  const permissions: Record<string, unknown> = {
    sections: untouchedLegacy && Array.isArray(prevPerms.sections)
      ? prevPerms.sections
      : sectionsForLevels(effectiveLevels(role?.levels, overrides)),
    clients: resolveClients(role, roles.find(r => r.id === existing?.role) ?? null, input.clients, prevPerms.clients),
  }

  const planningColumn = input.planning_column !== undefined ? input.planning_column : prevPerms.planning_column
  if (planningColumn) permissions.planning_column = planningColumn

  const credentials = input.credentials !== undefined ? input.credentials : prevPerms.credentials
  if (credentials && (permissions.sections as string[]).includes('wachtwoorden_bekijken')) {
    permissions.credentials = credentials
  }

  return {
    ...existing,
    role: role?.id ?? null,
    role_overrides: overrides,
    permissions,
    allowed: true,
  }
}

// Wie zijn eigen Beheer wegklikt, staat buiten en kan het niet meer
// terugzetten. De twee vaste admins kunnen dat altijd (ADMIN_EMAILS), de rest
// niet — dus dat weigeren we vóór het gebeurt.
export function locksOutCaller(caller: { id: string; email?: string | null }, targetId: string, newMeta: Record<string, unknown>) {
  if (caller.id !== targetId) return false
  if (ADMIN_EMAILS.includes(caller.email ?? '')) return false
  const sections = ((newMeta.permissions as { sections?: string[] } | undefined)?.sections) ?? []
  return !sections.includes('beheer')
}
