import { hasOpenSection } from '@/lib/auth-permissions'

type User = Parameters<typeof hasOpenSection>[0]

// Wie de materiaalplanning mag inrichten: categorieën, materiaal, volgorde,
// verantwoordelijken, defect melden en vaste projecten. Dat is het niveau
// Materiaal → Beheren uit Beheer → Rollen; materiaal_toevoegen hoort alleen
// bij dat niveau. "Open" zoals de rest van de planner: een account zonder
// ingestelde rechten mag alles, net als de knoppen in het scherm al toonden.
export function canManageEquipment(user: User): boolean {
  return hasOpenSection(user, 'materiaal_toevoegen')
}
