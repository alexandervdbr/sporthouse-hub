// Gedeelde vorm van een kleur-preset (SHG, FOS, …), gebruikt door zowel het
// raster (om de knopjes te tonen) als de beheer-tab (om ze te bewerken).
export interface PlanningPreset {
  id: string
  name: string
  color: string
  sort_order: number
}
