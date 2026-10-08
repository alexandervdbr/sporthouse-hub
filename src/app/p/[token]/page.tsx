// Persoonlijke planning achter een link, zonder login.
//
// Voor weekendstudenten, die geen account hebben en er ook geen krijgen — zie
// supabase/migrations/0052_planning_links.sql voor waarom.
//
// Staat buiten (app), dus zonder zijbalk, zoekbalk of iets anders uit de hub.
// Wie deze link opent kan niets anders bereiken, en dat is niet omdat het
// afgeschermd is maar omdat het er niet is.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePlanningLink } from '@/lib/planning-links'
import type { PlanningPreset } from '@/lib/planning-presets'
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

  // De statusknoppen komen van de server mee: /api/planning/presets vraagt een
  // login, en die is er hier per definitie niet.
  const admin = createAdminClient()
  const { data: presets } = await admin
    .from('planning_presets')
    .select('*')
    .order('sort_order')
    .order('name')

  return (
    <MyPlanningLink
      token={token}
      dept={link.department}
      emp={link.employee}
      presets={(presets ?? []) as PlanningPreset[]}
    />
  )
}
