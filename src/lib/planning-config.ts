// Een afdeling in het rooster. `employees` zijn contact-id's, geen namen.
//
// Dat is het hele punt: de naam leeft op één plek (contacts) en wordt hier
// nooit gekopieerd. Hernoemen in Team plant zich daarmee vanzelf voort, en de
// klasse bugs waarin het rooster en Team uit elkaar lopen bestaat niet meer.
// Zie supabase/migrations/0053_planning_op_contact_id.sql.
export interface Department {
  name: string
  employees: string[]
}

// Iemand in het rooster, met zijn naam er al bij opgezocht. Dit is wat de
// rasters doorkrijgen; de losse id komt uit Department.employees.
export interface Person {
  // Het contact-id. Dit is waar een planningsdag aan hangt.
  id: string
  // Waar hij nu in het rooster staat, en hoe hij nu in Team heet. Allebei
  // afgeleid bij het opbouwen van de lijst, niet opgeslagen — vandaar dat een
  // hernoeming in Team vanzelf doorkomt.
  dept: string
  emp: string
}

// De hardcoded statuslijst die hier stond is weg.
//
// Migratie 0044 heeft die statussen als echte rijen in planning_presets gezet,
// waarmee deze lijst overbodig werd. Hij bleef als terugval staan en deed
// daarna hetzelfde als de oude DEPARTMENTS-fallback hierboven: wat een
// beheerder in Beheer → Presets weggooide of hernoemde, kwam vanuit de code
// terug. Zo stonden "Play Sports" naast "PS" en "Sport Vl" naast
// "Sport Vlaanderen" in de kiezer, zonder manier om ze kwijt te raken.
//
// De presets in de database zijn nu de enige lijst.

// Leeg, en dat is de bedoeling.
//
// Hier stond tot oktober 2026 een hardcoded rooster uit 2024 — met namen van
// mensen die er niet meer werken, en kale voornamen waar het echte rooster
// allang volledige namen gebruikt. Het diende als terugval wanneer
// /api/planning/config niets teruggaf, maar dat maakte een storing onzichtbaar:
// je kreeg een rooster te zien dat er plausibel uitzag en nergens op sloeg.
// Erger nog, de zelfherstellende effecten in PlanningApp schreven die lijst
// dan weg als het echte rooster.
//
// Een leeg rooster is het eerlijke antwoord op "ik kon het niet ophalen". De
// melding boven de planning zegt dan wat er aan de hand is, in plaats van dat
// iemand naar een verzonnen bezetting zit te kijken.
export const DEPARTMENTS: Department[] = []

export const DUTCH_DAYS = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
export const DUTCH_MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']

export function getDaysInMonth(year: number, month: number) {
  const count = new Date(year, month, 0).getDate()
  const today = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = i + 1
    const date = new Date(year, month - 1, d)
    const dow = date.getDay()
    return {
      day: d,
      dayName: DUTCH_DAYS[dow],
      isWeekend: dow === 0 || dow === 6,
      isToday: d === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear(),
    }
  })
}

export function cellKey(day: number, dept: string, emp: string) {
  return `${day}|${dept}|${emp}`
}

// Accent/case-insensitive match, used wherever a planning employee name is
// compared against a real Team contact's name (adding new team members
// automatically, flagging entries that aren't linked to Team). Shared here
// so both sides of that comparison normalize identically.
export function normName(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// New Team contacts nobody's assigned to a real planning group yet land
// here automatically, so they at least get a spot to pick from day one —
// admins move them into the right department via drag and drop afterwards.
export const UNASSIGNED_DEPT = 'Nieuw'

// Een cel hangt aan een contact-id, niet aan een naam en niet aan een
// afdeling. Een dag is van een persoon; waar die persoon op dat moment in het
// rooster stond is een eigenschap van het rooster, niet van die dag.
export function personKey(p: { id: string }) {
  return p.id
}
