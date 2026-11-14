import { describe, it, expect } from 'vitest'
import {
  ASSIGNMENT_STATUSES, checkTransition, nextTransitions, type Actor, type AssignmentStatus,
} from '@/features/freelancers/lib/statuses'

// Elke denkbare overgang: 7 statussen × 7 statussen × 2 actoren = 98 gevallen.
// Precies deze mogen; alles andere wordt geweigerd (docs/freelancers-redesign.md,
// "Statusflow van een opdracht").

const ALLOWED: [AssignmentStatus, AssignmentStatus, Actor][] = [
  ['concept', 'gedeeld', 'team'],
  ['gedeeld', 'geaccepteerd', 'freelancer'],
  ['gedeeld', 'geweigerd', 'freelancer'],
  ['geaccepteerd', 'opgeleverd', 'freelancer'],
  ['opgeleverd', 'afgerond', 'team'],
  ['opgeleverd', 'geaccepteerd', 'team'],          // terugsturen met feedback
  ['afgerond', 'opgeleverd', 'team'],              // heropenen
  ['concept', 'geannuleerd', 'team'],
  ['gedeeld', 'geannuleerd', 'team'],
  ['geaccepteerd', 'geannuleerd', 'team'],
  ['geweigerd', 'geannuleerd', 'team'],
  ['opgeleverd', 'geannuleerd', 'team'],
]
const key = (f: string, t: string, a: string) => `${f}→${t} (${a})`
const allowedKeys = new Set(ALLOWED.map(([f, t, a]) => key(f, t, a)))

// Bericht meegeven zodat "verplicht" nooit de reden van een weigering is.
const MSG = 'Kan je de kleuren nog aanpassen?'

describe('statusovergangen — de volledige matrix', () => {
  for (const from of ASSIGNMENT_STATUSES) {
    for (const to of ASSIGNMENT_STATUSES) {
      for (const actor of ['team', 'freelancer'] as Actor[]) {
        const k = key(from, to, actor)
        if (allowedKeys.has(k)) {
          it(`toegelaten: ${k}`, () => {
            expect(checkTransition(from, to, actor, MSG).ok).toBe(true)
          })
        } else {
          it(`geweigerd: ${k}`, () => {
            const r = checkTransition(from, to, actor, MSG)
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.reason).toBe('niet_toegelaten')
          })
        }
      }
    }
  }

  it('er zijn er precies 12', () => {
    let n = 0
    for (const f of ASSIGNMENT_STATUSES) for (const t of ASSIGNMENT_STATUSES) for (const a of ['team', 'freelancer'] as Actor[]) {
      if (checkTransition(f, t, a, MSG).ok) n++
    }
    expect(n).toBe(ALLOWED.length)
  })
})

describe('statusovergangen — regels per overgang', () => {
  it('terugsturen met feedback vraagt een bericht, en de freelancer ziet het', () => {
    const zonder = checkTransition('opgeleverd', 'geaccepteerd', 'team', '   ')
    expect(zonder.ok).toBe(false)
    if (!zonder.ok) expect(zonder.reason).toBe('bericht_verplicht')
    const met = checkTransition('opgeleverd', 'geaccepteerd', 'team', '  Logo iets groter  ')
    expect(met.ok && met.message).toBe('Logo iets groter')
    expect(met.ok && met.transition.visibleToFreelancer).toBe(true)
  })

  it('weigeren mag zonder reden; een reden wordt bewaard en is zichtbaar op de link', () => {
    const zonder = checkTransition('gedeeld', 'geweigerd', 'freelancer')
    expect(zonder.ok && zonder.message).toBe(null)
    const met = checkTransition('gedeeld', 'geweigerd', 'freelancer', 'Ben dan op reis')
    expect(met.ok && met.message).toBe('Ben dan op reis')
    expect(met.ok && met.transition.visibleToFreelancer).toBe(true)
  })

  it('een bericht bij een overgang zonder bericht wordt genegeerd', () => {
    const r = checkTransition('concept', 'gedeeld', 'team', 'iets')
    expect(r.ok && r.message).toBe(null)
  })

  it('een te lang bericht wordt geweigerd', () => {
    const r = checkTransition('opgeleverd', 'geaccepteerd', 'team', 'x'.repeat(2001))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bericht_te_lang')
  })

  it('afgerond kan niet geannuleerd worden, wel heropend', () => {
    expect(checkTransition('afgerond', 'geannuleerd', 'team').ok).toBe(false)
    expect(checkTransition('afgerond', 'opgeleverd', 'team').ok).toBe(true)
  })

  it('de freelancer kan niets annuleren, afronden of terugsturen', () => {
    for (const from of ASSIGNMENT_STATUSES) {
      expect(checkTransition(from, 'geannuleerd', 'freelancer').ok).toBe(false)
      expect(checkTransition(from, 'afgerond', 'freelancer').ok).toBe(false)
    }
    expect(checkTransition('opgeleverd', 'geaccepteerd', 'freelancer', MSG).ok).toBe(false)
  })

  it('nextTransitions geeft de knoppen per status', () => {
    expect(nextTransitions('gedeeld', 'freelancer').map(t => t.action).sort()).toEqual(['accepteren', 'weigeren'])
    expect(nextTransitions('opgeleverd', 'team').map(t => t.action).sort()).toEqual(['afronden', 'annuleren', 'terugsturen'])
    expect(nextTransitions('geannuleerd', 'team')).toEqual([])
  })
})
