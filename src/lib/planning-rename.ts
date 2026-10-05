// Gedeelde vorm van een hernoeming/verplaatsing, gebruikt door zowel
// /api/planning/rename als de twee plekken die er een voorstel voor doen
// (het rooster-voorstel in PlanningApp en de configuratiemodal).
//
// Waarom dit een eigen begrip is en niet gewoon "config opslaan": zie de
// uitleg bovenaan src/app/api/planning/rename/route.ts — planning_entries
// staat op (afdeling, naam), dus de rijen moeten mee.

export interface PlanningRename {
  fromDept: string
  fromEmp: string
  toDept: string
  toEmp: string
}

export interface RenameResult extends PlanningRename {
  ok: boolean
  moved: number
  reason?: string
}

export interface RenameResponse {
  results: RenameResult[]
  configSaved: boolean
  reason?: string
}
