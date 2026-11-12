// Gearchiveerde mensen: niet meer in de actieve ploeg, wel nog zichtbaar in
// de weken waarin ze werkten. Een lijst contact-id's in planning_config
// (key: 'archived_employees'). Zie src/lib/planning-id-list-server.ts.

import { idListRoute } from '@/lib/planning-id-list-server'

const route = idListRoute('archived_employees')

export const GET = route.GET
export const PUT = route.PUT
