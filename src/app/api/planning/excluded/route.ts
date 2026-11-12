// Mensen die een beheerder bewust uit het rooster haalde. De automatische
// aanvulling met nieuwe Team-contacten ("Nieuw") slaat hen over; zonder deze
// lijst stonden ze bij de volgende lading gewoon terug. Opnieuw toevoegen in
// de configuratie haalt iemand van de lijst.
//
// Een lijst contact-id's in planning_config (key: 'excluded_contacts'). Zie
// src/lib/planning-id-list-server.ts.

import { idListRoute } from '@/lib/planning-id-list-server'

const route = idListRoute('excluded_contacts')

export const GET = route.GET
export const PUT = route.PUT
