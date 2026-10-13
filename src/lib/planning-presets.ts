// Gedeelde vorm van een kleur-preset (SHG, FOS, …), gebruikt door zowel het
// raster (om de knopjes te tonen) als de beheer-tab (om ze te bewerken).
export interface PlanningPreset {
  id: string
  name: string
  color: string
  sort_order: number
  // 'werk' of 'afwezig'. Bepaalt waar hij in de kiezer staat en of de
  // thuisschakelaar zin heeft. Zie migratie 0054.
  category?: PresetCategory | null
  // Gezet = met pensioen. Hij verdwijnt uit de kiezer maar blijft bestaan
  // voor alles wat terugleest: de dageditor herkent oude cellen nog, en de
  // statistieken houden hem zolang er dagen op staan. Zie migratie 0055.
  archived_at?: string | null
  // Of hij meetelt in de statistieken. NB staat standaard uit: dat is een
  // roosterafspraak, geen opgenomen dag.
  in_stats?: boolean | null
}

export const PRESET_CATEGORIES = ['werk', 'afwezig'] as const
export type PresetCategory = (typeof PRESET_CATEGORIES)[number]

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  werk:    'Waar je werkt',
  afwezig: 'Afwezig',
}

export function presetCategory(p: { category?: string | null }): PresetCategory {
  return p.category === 'afwezig' ? 'afwezig' : 'werk'
}

export function isArchived(p: { archived_at?: string | null }): boolean {
  return Boolean(p.archived_at)
}

// Standaard aan: een preset van voor migratie 0055 heeft het veld niet, en
// weglaten uit de statistieken is iets wat je kiest, niet iets wat je overkomt.
export function telMeeInStats(p: { in_stats?: boolean | null }): boolean {
  return p.in_stats !== false
}
