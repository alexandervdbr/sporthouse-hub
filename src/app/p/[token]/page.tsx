// Persoonlijke planning achter een link, zonder login.
//
// Voor weekendstudenten, die geen account hebben en er ook geen krijgen — zie
// supabase/migrations/0052_planning_links.sql voor waarom.
//
// Staat buiten (app), dus zonder zijbalk, zoekbalk of iets anders uit de hub.
// Wie deze link opent kan niets anders bereiken, en dat is niet omdat het
// afgeschermd is maar omdat het er niet is.
//
// Alleen lezen, en daarom worden de statuspresets hier bewust niet opgehaald:
// die lijst is de klantenlijst (Play Sports, FOS, RBFA, Sport Vlaanderen) en
// zou anders in de broncode van deze pagina staan, ook zonder dat iemand een
// knop ziet.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePlanningLink } from '@/lib/planning-links'
import MyPlanningLink from '@/components/planning/MyPlanningLink'

export const dynamic = 'force-dynamic'

export default async function PlanningLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const link = await resolvePlanningLink(token)
  if (!link) notFound()

  // De naam staat niet in de link, alleen het contact-id. Hier opgezocht,
  // zodat een hernoeming in Team ook op deze pagina meteen klopt.
  const { data: contact } = await createAdminClient()
    .from('contacts')
    .select('name')
    .eq('id', link.contact_id)
    .maybeSingle()

  return (
    <MyPlanningLink
      token={token}
      contactId={link.contact_id}
      name={contact?.name ?? 'Jouw planning'}
    />
  )
}
