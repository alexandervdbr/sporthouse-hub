import type { SupabaseClient } from '@supabase/supabase-js'
import { applyTransition, type TransitionResult } from './assignments-server'
import { createLink, linkStatus } from './links-server'

// "Delen met [naam]": concept → gedeeld. Heeft de freelancer nog geen
// actieve link, dan wordt die eerst aangemaakt in dezelfde stap, en komt de
// pincode één keer mee terug zodat het scherm hem kan tonen.
//
// Eerst de link, dan de status: lukt de link niet, dan blijft de opdracht een
// concept (een gedeelde opdracht zonder link zou niemand zien).

export type ShareResult =
  | (Extract<TransitionResult, { ok: true }> & { link: { url: string; pin: string } | null })
  | { ok: false; status: number; error: string }

export async function shareAssignment(
  userDb: SupabaseClient, admin: SupabaseClient,
  a: { id: string; freelancer_id: string }, userId: string,
): Promise<ShareResult> {
  let link: { url: string; pin: string } | null = null
  const status = await linkStatus(admin, a.freelancer_id)
  if (status.state === 'geen') {
    const created = await createLink(admin, a.freelancer_id, userId)
    if (!created.ok) return { ok: false, status: created.status, error: created.error }
    link = { url: created.url, pin: created.pin }
  }

  const r = await applyTransition(userDb, { assignmentId: a.id, to: 'gedeeld', actor: 'team', actorId: userId })
  if (!r.ok) return r
  return { ...r, link }
}
