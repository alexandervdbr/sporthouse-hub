export interface Department {
  name: string
  employees: string[]
}

export interface PlanningOption {
  label: string
  bgColor: string
  textColor: string
}

export const PLANNING_OPTIONS: PlanningOption[] = [
  { label: 'Play Sports', bgColor: '#ca8a04', textColor: '#ffffff' },
  { label: 'SHG',         bgColor: '#059669', textColor: '#ffffff' },
  { label: 'Sport Vl',    bgColor: '#6d28d9', textColor: '#ffffff' },
  { label: 'FOS',         bgColor: '#c2410c', textColor: '#ffffff' },
  { label: 'De Spor',     bgColor: '#b45309', textColor: '#ffffff' },
  { label: 'Verlof',      bgColor: '#be185d', textColor: '#ffffff' },
  { label: 'Recup',       bgColor: '#0891b2', textColor: '#ffffff' },
  { label: 'Ziek',        bgColor: '#9a3412', textColor: '#ffffff' },
  { label: 'RBFA',        bgColor: '#be123c', textColor: '#ffffff' },
]

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

// Eén persoon in het rooster is (afdeling, naam) — niet de naam alleen. Het
// rooster heeft namelijk echt dubbele voornamen: "Thibault" staat bij Stags PS
// én bij STAGS Projectkant, en dat zijn twee mensen. Op de naam alleen
// vergelijken betekende dat de tweede zichzelf niet kon kiezen in de
// naamkiezer, dat één toegewezen permissie-kolom ze beide ontgrendelde, en dat
// hun dagen in Statistieken bij elkaar opgeteld werden.
//
// Zelfde scheidingsteken als de archief- en staleness-sleutels die hier al
// rondgingen, zodat er één vorm is in plaats van twee.
export function personKey(p: { dept: string; emp: string }) {
  return `${p.dept}|${p.emp}`
}

// Een opgeslagen keuze van vóór deze wijziging is een kale naam zonder
// scheidingsteken. Die hoeft niet weggegooid te worden: `null` hier betekent
// "los dit nog op tegen het rooster", en de keuze wordt daarna in de nieuwe
// vorm teruggeschreven.
export function parsePersonKey(key: string): { dept: string; emp: string } | null {
  const i = key.indexOf('|')
  if (i <= 0 || i === key.length - 1) return null
  return { dept: key.slice(0, i), emp: key.slice(i + 1) }
}
