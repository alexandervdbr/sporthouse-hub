import { describe, it, expect } from 'vitest'
import { canEditPerson, ownContactIdFor, isContactId, NO_COLUMN } from '../planning-access'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const anna = { id: ID_A, emp: 'Anna Peeters' }
const bert = { id: ID_B, emp: 'Bert Janssens' }

describe('canEditPerson', () => {
  it('lets planning_volledig edit everyone', () => {
    const r = { editAll: true, column: null, ownContactId: null }
    expect(canEditPerson(r, anna)).toBe(true)
    expect(canEditPerson(r, bert)).toBe(true)
  })

  it('"Volgens de rol" without edit rights only allows your own row', () => {
    const r = { editAll: false, column: null, ownContactId: ID_A }
    expect(canEditPerson(r, anna)).toBe(true)
    expect(canEditPerson(r, bert)).toBe(false)
  })

  it('is read-only when no own row is found — this used to allow everything', () => {
    const r = { editAll: false, column: null, ownContactId: null }
    expect(canEditPerson(r, anna)).toBe(false)
    expect(canEditPerson(r, bert)).toBe(false)
  })

  it('treats an empty column like no column', () => {
    const r = { editAll: false, column: '  ', ownContactId: ID_B }
    expect(canEditPerson(r, anna)).toBe(false)
    expect(canEditPerson(r, bert)).toBe(true)
  })

  it('"Mag niets bewerken" blocks even your own row', () => {
    const r = { editAll: false, column: NO_COLUMN, ownContactId: ID_A }
    expect(canEditPerson(r, anna)).toBe(false)
  })

  it('an assigned contact id allows only that row, not your own', () => {
    const r = { editAll: false, column: ID_B, ownContactId: ID_A }
    expect(canEditPerson(r, anna)).toBe(false)
    expect(canEditPerson(r, bert)).toBe(true)
  })

  it('still honours legacy name and dept|name assignments', () => {
    expect(canEditPerson({ editAll: false, column: 'anna peeters', ownContactId: null }, anna)).toBe(true)
    expect(canEditPerson({ editAll: false, column: 'Content|Anna Peeters', ownContactId: null }, anna)).toBe(true)
    expect(canEditPerson({ editAll: false, column: 'Content|Anna Peeters', ownContactId: null }, bert)).toBe(false)
  })

  it('does not mistake a hyphenated legacy name for a contact id', () => {
    const jp = { id: ID_A, emp: 'Jean-Pierre' }
    expect(isContactId('Jean-Pierre')).toBe(false)
    expect(canEditPerson({ editAll: false, column: 'Jean-Pierre', ownContactId: null }, jp)).toBe(true)
  })
})

describe('ownContactIdFor', () => {
  const contacts = [
    { id: ID_A, email: ' Anna@Sporthouse.be ' },
    { id: ID_B, email: null },
  ]

  it('matches on email, ignoring case and whitespace', () => {
    expect(ownContactIdFor('anna@sporthouse.be', contacts)).toBe(ID_A)
  })

  it('returns null without email or match', () => {
    expect(ownContactIdFor(undefined, contacts)).toBeNull()
    expect(ownContactIdFor('', contacts)).toBeNull()
    expect(ownContactIdFor('x@y.be', contacts)).toBeNull()
  })
})
