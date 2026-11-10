// Dev-modus per tool.
//
// Een admin kan een tool in Beheer → Tools op "in ontwikkeling" zetten. Dan:
// - zien admins de tool gewoon, met een oranje balk erboven, zodat je op het
//   live platform kunt werken en testen;
// - zien alle anderen een melding in plaats van de tool (ook een admin die
//   via "Bekijk als" iemand anders nadoet);
// - krijgt de tool in de zijbalk een label.
//
// Let op: dit verbergt de schermen, niet de data. De tool praat met dezelfde
// live database als altijd. Migraties voor een tool in ontwikkeling dus
// alleen additief, en testen met testgegevens.
//
// De status staat in de tabel tool_status (migratie 0069) en wordt één keer
// per sessie geladen in (app)/layout.tsx, samen met de gebruiker. Een
// collega met een tabblad dat al open stond, ziet een wijziging pas na
// herladen.
//
// Een nieuwe tool toevoegen: zet hem in DEV_TOOLS hieronder. Meer niet —
// zolang zijn pagina onder src/app/(app)/ staat, want daar zit de poort
// (AppShell → ToolGate). Een pagina daarbuiten kan niet in dev-modus; de
// test in __tests__/tool-status.test.ts bewaakt dat.
//
// Geen server-only imports: de zijbalk en het beheerscherm lezen dit ook.

export interface DevTool {
  key: string
  label: string
  // Elke route die met dit pad begint, hoort bij de tool (/equipment dekt
  // ook /equipment/stats en /equipment/extern).
  path: string
}

export const DEV_TOOLS: DevTool[] = [
  { key: 'planning',     label: 'Planning',      path: '/planning' },
  // De oude materiaalplanner: staat in de koelkast en stuurt door naar
  // /materiaal (src/lib/legacy-equipment.ts). De sleutel en zijn rij in
  // tool_status blijven, zodat er niets verschuift.
  { key: 'materiaal',    label: 'Materiaal (oud, in de koelkast)', path: '/equipment' },
  { key: 'materiaalplanner', label: 'Materiaal', path: '/materiaal' },
  // Poolwagens: blijft in ontwikkeling tot de vrijgave; tot dan zien alleen
  // admins het.
  { key: 'poolwagens',   label: 'Poolwagens',    path: '/poolwagens' },
  { key: 'projecten',    label: 'Projecten',     path: '/projects' },
  { key: 'team',         label: 'Team',          path: '/team' },
  { key: 'freelancers',  label: 'Freelancers',   path: '/freelancers' },
  { key: 'preassist',    label: 'Pré-assist',    path: '/preassist' },
  { key: 'mijn-gedacht', label: 'Mijn gedacht!', path: '/mijn-gedacht' },
]

export interface ToolStatusEntry {
  in_development: boolean
  message: string | null
  updated_at?: string
  updated_by?: string | null
}

export type ToolStatusMap = Record<string, ToolStatusEntry>

export const DEFAULT_DEV_MESSAGE =
  'We werken aan deze tool. Hij is even niet beschikbaar — probeer het later opnieuw.'

export function toolForPath(pathname: string): DevTool | null {
  return DEV_TOOLS.find(t => pathname === t.path || pathname.startsWith(t.path + '/')) ?? null
}

export function isInDevelopment(map: ToolStatusMap, key: string): boolean {
  return map[key]?.in_development === true
}

export function isKnownTool(key: string): boolean {
  return DEV_TOOLS.some(t => t.key === key)
}

// Rijen uit de database → map. Onbekende tools (bv. een tool die uit
// DEV_TOOLS is gehaald) vallen weg, zodat ze niets meer kunnen blokkeren.
export function toStatusMap(rows: ({ tool: string } & ToolStatusEntry)[] | null | undefined): ToolStatusMap {
  const map: ToolStatusMap = {}
  for (const r of rows ?? []) {
    if (!isKnownTool(r.tool)) continue
    map[r.tool] = {
      in_development: r.in_development === true,
      message: r.message ?? null,
      updated_at: r.updated_at,
      updated_by: r.updated_by ?? null,
    }
  }
  return map
}
