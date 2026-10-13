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
