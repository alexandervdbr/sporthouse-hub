// De statussen van een opdracht en welke overgangen bestaan. Eén lijst, door
// de interne API (team) en de publieke link (freelancer) allebei gebruikt via
// checkTransition(). Alles wat hier niet staat, is niet toegelaten.
//
//   concept → gedeeld → geaccepteerd → opgeleverd → afgerond
//   gedeeld → geweigerd                       (freelancer, reden optioneel)
//   opgeleverd → geaccepteerd                 (team: terugsturen, bericht verplicht)
//   elke status behalve afgerond → geannuleerd (team)
//   afgerond → opgeleverd                     (team: heropenen)
//
// Wie wat mag, volgt de stroom: het team deelt, rondt af, stuurt terug,
// annuleert en heropent; de freelancer accepteert, weigert en levert op.

export const ASSIGNMENT_STATUSES = [
  'concept', 'gedeeld', 'geaccepteerd', 'geweigerd', 'opgeleverd', 'afgerond', 'geannuleerd',
] as const
export type AssignmentStatus = typeof ASSIGNMENT_STATUSES[number]
export type Actor = 'team' | 'freelancer'
export type MessageRule = 'verplicht' | 'optioneel' | 'geen'

export interface Transition {
  from: AssignmentStatus
  to: AssignmentStatus
  actor: Actor
  /** Korte naam van de handeling, voor knoppen en de activiteitenlog. */
  action: 'delen' | 'accepteren' | 'weigeren' | 'opleveren' | 'afronden' | 'terugsturen' | 'annuleren' | 'heropenen'
  message: MessageRule
  /** Ziet de freelancer dit event (en het bericht) op de link? */
  visibleToFreelancer: boolean
}

const CANCELLABLE: AssignmentStatus[] = ['concept', 'gedeeld', 'geaccepteerd', 'geweigerd', 'opgeleverd']

export const TRANSITIONS: readonly Transition[] = [
  { from: 'concept',      to: 'gedeeld',      actor: 'team',       action: 'delen',       message: 'geen',      visibleToFreelancer: false },
  { from: 'gedeeld',      to: 'geaccepteerd', actor: 'freelancer', action: 'accepteren',  message: 'geen',      visibleToFreelancer: false },
  { from: 'gedeeld',      to: 'geweigerd',    actor: 'freelancer', action: 'weigeren',    message: 'optioneel', visibleToFreelancer: true },
  { from: 'geaccepteerd', to: 'opgeleverd',   actor: 'freelancer', action: 'opleveren',   message: 'geen',      visibleToFreelancer: false },
  { from: 'opgeleverd',   to: 'afgerond',     actor: 'team',       action: 'afronden',    message: 'geen',      visibleToFreelancer: false },
  { from: 'opgeleverd',   to: 'geaccepteerd', actor: 'team',       action: 'terugsturen', message: 'verplicht', visibleToFreelancer: true },
  { from: 'afgerond',     to: 'opgeleverd',   actor: 'team',       action: 'heropenen',   message: 'optioneel', visibleToFreelancer: false },
  ...CANCELLABLE.map(from => ({
    from, to: 'geannuleerd' as const, actor: 'team' as const, action: 'annuleren' as const,
    message: 'optioneel' as const, visibleToFreelancer: false,
  })),
]

export const MAX_MESSAGE_LENGTH = 2000

export function isAssignmentStatus(v: unknown): v is AssignmentStatus {
  return typeof v === 'string' && (ASSIGNMENT_STATUSES as readonly string[]).includes(v)
}

export function findTransition(from: AssignmentStatus, to: AssignmentStatus, actor: Actor): Transition | null {
  return TRANSITIONS.find(t => t.from === from && t.to === to && t.actor === actor) ?? null
}

/** De overgangen die deze actor vanuit deze status mag doen (voor knoppen). */
export function nextTransitions(from: AssignmentStatus, actor: Actor): Transition[] {
  return TRANSITIONS.filter(t => t.from === from && t.actor === actor)
}

export type TransitionCheck =
  | { ok: true; transition: Transition; message: string | null }
  | { ok: false; reason: 'niet_toegelaten' | 'bericht_verplicht' | 'bericht_te_lang'; error: string }

/** De enige toets op een statuswijziging. Server-side, voor team én freelancer. */
export function checkTransition(
  from: AssignmentStatus,
  to: AssignmentStatus,
  actor: Actor,
  rawMessage?: string | null,
): TransitionCheck {
  const transition = findTransition(from, to, actor)
  if (!transition) {
    return { ok: false, reason: 'niet_toegelaten', error: `Van "${from}" naar "${to}" kan niet${actor === 'freelancer' ? ' vanaf de link' : ''}.` }
  }
  const message = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : null
  if (transition.message === 'verplicht' && !message) {
    return { ok: false, reason: 'bericht_verplicht', error: 'Schrijf een bericht voor de freelancer.' }
  }
  if (message && message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: 'bericht_te_lang', error: `Het bericht is te lang (max. ${MAX_MESSAGE_LENGTH} tekens).` }
  }
  return { ok: true, transition, message: transition.message === 'geen' ? null : message }
}
