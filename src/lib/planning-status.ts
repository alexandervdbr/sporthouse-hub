// Van preset naar status: wat de kiezer toont, en wat hij herkent.
//
// Dit stond in DayEditor.tsx. Het zijn functies zonder scherm eromheen —
// PlanningStats haalde ze daar al vandaan — en sinds archiveren erbij kwam
// zit het verschil tussen "aan te klikken" en "te herkennen" hierin. Dat is
// precies het soort regel dat je getest wil hebben, en de testopstelling
// kijkt alleen naar src/lib.
import { presetCategory, isArchived, type PlanningPreset, type PresetCategory } from './planning-presets'
import type { CellData } from './planning-week'

export interface StatusOption {
  name: string
  color: string
  category: PresetCategory
}

// De statuslijst is wat er in Beheer → Presets staat, en niets anders.
//
// Hier stond een samenvoeging met een hardcoded lijst (PLANNING_OPTIONS) als
// terugval voor wie nog geen presets had aangemaakt. Migratie 0044 heeft die
// lijst als echte rijen in de database gezet, waarmee de terugval overbodig
// werd — maar hij bleef staan, en deed daarna hetzelfde als de oude
// DEPARTMENTS-fallback: wat je in Beheer weggooide kwam terug. Zo stonden
// "Play Sports" naast "PS" en "Sport Vl" naast "Sport Vlaanderen" in de
// kiezer, onverwijderbaar.
export function allStatusOptions(presets: PlanningPreset[]): StatusOption[] {
  return presets
    .map(p => ({ name: p.name, color: p.color, category: presetCategory(p) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}

// Thuiswerk is geen status maar een eigenschap van een status: "PS - THUIS"
// is PS, ergens anders gedaan. Als aparte knoppen verdubbelden ze de lijst en
// vertroebelden ze de keuze die je eigenlijk maakt.
//
// Ze blijven als preset bestaan — de opgeslagen waarde is nog steeds
// "PS - THUIS", dus oude cellen en de statistieken kloppen gewoon door — maar
// in de kiezer zijn ze een schakelaar geworden. Dat werkt meteen ook voor een
// klant waar nog geen THUIS-preset voor bestaat.
export const THUIS_SUFFIX = ' - THUIS'

export function splitThuis(value: string): { base: string; thuis: boolean } {
  const upper = value.toUpperCase()
  return upper.endsWith(THUIS_SUFFIX)
    ? { base: value.slice(0, value.length - THUIS_SUFFIX.length), thuis: true }
    : { base: value, thuis: false }
}

// Wat de kiezer toont: alles behalve de THUIS-varianten waarvan de basis ook
// bestaat. Een losse "X - THUIS" zonder "X" blijft gewoon staan, anders zou
// hij onbereikbaar worden.
//
// Gearchiveerde presets vallen hier weg en blijven in allStatusOptions staan.
// Dat is precies het verschil waar archiveren voor bedoeld is: niet meer aan
// te klikken, wel nog te herkennen. Een cel die er al mee gestempeld is opent
// dus met zijn status geselecteerd, in plaats van met "geen bestaande status"
// — en je kan hem sluiten zonder hem kwijt te raken.
export function pickerStatusOptions(presets: PlanningPreset[]): StatusOption[] {
  const all = allStatusOptions(presets.filter(p => !isArchived(p)))
  const names = new Set(all.map(o => o.name.toUpperCase()))
  return all.filter(o => {
    const { base, thuis } = splitThuis(o.name)
    return !thuis || !names.has(base.toUpperCase())
  })
}

// De kleur die bij "deze status, thuis" hoort. Bestaat er een echte
// THUIS-preset, dan die; anders houdt hij de kleur van de status zelf, zodat
// het in het raster nog steeds als diezelfde klant leest.
export function thuisColor(presets: PlanningPreset[], base: StatusOption): string {
  const wanted = (base.name + THUIS_SUFFIX).toUpperCase()
  return presets.find(p => p.name.toUpperCase() === wanted)?.color ?? base.color
}

// Welke knop hoort bij deze cel, en stond de thuisschakelaar aan?
//
// Op naam en niet op kleur: een preset kan hernoemd of van kleur veranderd
// zijn, en dan hoort de cel er nog steeds bij. Daarvoor werd ook de kleur
// vergeleken, en dan opende een oude cel als vrije tekst — en overschreef
// opslaan hem met bgColor null, dus verloor hij stil zijn kleur.
export function matchStatus(cell: CellData, options: StatusOption[]): { name: string; thuis: boolean } | null {
  const raw = cell.value.trim()
  if (!raw) return null
  const { base, thuis } = splitThuis(raw)
  const hit = options.find(o => o.name.toUpperCase() === base.toUpperCase())
  return hit ? { name: hit.name, thuis } : null
}
