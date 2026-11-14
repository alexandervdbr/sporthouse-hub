import type { SupabaseClient } from '@supabase/supabase-js'
import { checkTransition, isAssignmentStatus, type Actor, type AssignmentStatus, type Transition } from './statuses'
import { ASSIGNMENT_COLUMNS } from './columns'

// Statuswijzigingen van een opdracht. applyTransition is de enige plek waar
// een status verandert — voor het team (interne API) én voor de freelancer
// (publieke link, Fase 4). Hij toetst via checkTransition, schrijft de status
// alleen als die intussen niet veranderd is, en legt een event vast.

type Db = SupabaseClient

export interface TransitionInput {
  assignmentId: string
  to: AssignmentStatus
  actor: Actor
  /** Medewerker die het doet; null bij de freelancer. */
  actorId: string | null
  message?: string | null
  /** Bij de publieke link: de opdracht moet van deze freelancer zijn. */
  freelancerId?: string
}

export type TransitionResult =
  | { ok: true; assignment: Record<string, unknown>; transition: Transition }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }

export async function applyTransition(db: Db, input: TransitionInput): Promise<TransitionResult> {
  let q = db.from('freelancer_assignments').select('id, freelancer_id, status, shared_at').eq('id', input.assignmentId)
  if (input.freelancerId) q = q.eq('freelancer_id', input.freelancerId)
  const { data: current, error: readError } = await q.maybeSingle()
  if (readError) return { ok: false, status: 500, error: 'Kon de opdracht niet lezen.' }
  if (!current) return { ok: false, status: 404, error: 'Opdracht niet gevonden.' }

  const from = current.status as unknown
  if (!isAssignmentStatus(from)) return { ok: false, status: 500, error: 'Onbekende status.' }

  const check = checkTransition(from, input.to, input.actor, input.message)
  if (!check.ok) return { ok: false, status: check.reason === 'niet_toegelaten' ? 409 : 400, error: check.error }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: input.to, status_changed_at: now }
  if (input.to === 'gedeeld' && !current.shared_at) patch.shared_at = now

  // Alleen als de status nog dezelfde is als net gelezen: twee gelijktijdige
  // klikken (of team en freelancer tegelijk) kunnen niet allebei winnen.
  const { data: updated, error: writeError } = await db
    .from('freelancer_assignments')
    .update(patch)
    .eq('id', input.assignmentId)
    .eq('status', from)
    .select(ASSIGNMENT_COLUMNS)
    .maybeSingle()
  if (writeError) return { ok: false, status: 500, error: 'Kon de status niet wijzigen.' }
  if (!updated) return { ok: false, status: 409, error: 'De opdracht is intussen gewijzigd. Vernieuw de pagina.' }

  await recordEvent(db, {
    assignmentId: input.assignmentId,
    actorType: input.actor,
    actorId: input.actor === 'team' ? input.actorId : null,
    kind: 'status',
    from,
    to: input.to,
    message: check.message,
    visibleToFreelancer: check.transition.visibleToFreelancer,
  })

  return { ok: true, assignment: updated as unknown as Record<string, unknown>, transition: check.transition }
}

export interface EventInput {
  assignmentId: string
  actorType: 'team' | 'freelancer' | 'systeem'
  actorId?: string | null
  kind: 'status' | 'bericht' | 'bestand' | 'bekeken' | 'beschikbaarheid' | 'notitie'
  from?: AssignmentStatus | null
  to?: AssignmentStatus | null
  message?: string | null
  visibleToFreelancer?: boolean
}

/** Een event mislukken laat de handeling zelf niet mislukken; wel loggen. */
export async function recordEvent(db: Db, e: EventInput): Promise<void> {
  const { error } = await db.from('freelancer_assignment_events').insert({
    assignment_id: e.assignmentId,
    actor_type: e.actorType,
    actor_id: e.actorType === 'team' ? e.actorId ?? null : null,
    kind: e.kind,
    from_status: e.from ?? null,
    to_status: e.to ?? null,
    message: e.message ?? null,
    visible_to_freelancer: e.visibleToFreelancer ?? false,
  })
  if (error) console.error('Freelancers: event niet opgeslagen:', error.message)
}
