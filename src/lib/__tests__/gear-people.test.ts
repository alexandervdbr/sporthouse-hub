import { describe, it, expect } from 'vitest'
import { activePeople } from '@/lib/gear/people'

describe('activePeople', () => {
  const today = '2026-11-03'

  it('neemt de volledige naam, anders het e-mailadres, alfabetisch', () => {
    expect(activePeople([
      { id: '2', email: 'torken@x.be', user_metadata: { full_name: 'Torken Peeters' } },
      { id: '1', email: 'bram@x.be', user_metadata: { full_name: 'Bram Kreike' } },
      { id: '3', email: 'rane@x.be', user_metadata: {} },
    ], today)).toEqual([
      { id: '1', name: 'Bram Kreike', email: 'bram@x.be' },
      { id: '3', name: 'rane@x.be', email: 'rane@x.be' },
      { id: '2', name: 'Torken Peeters', email: 'torken@x.be' },
    ])
  })

  it('laat freelancer-accounts weg', () => {
    expect(activePeople([
      { id: '1', email: 'f@x.be', user_metadata: { full_name: 'Free' }, app_metadata: { freelancer: true } },
    ], today)).toEqual([])
  })

  it('laat verlopen accounts weg, maar niet wie vandaag nog loopt', () => {
    const people = activePeople([
      { id: '1', email: 'a@x.be', user_metadata: { full_name: 'Weg' }, app_metadata: { expires_at: '2026-11-02' } },
      { id: '2', email: 'b@x.be', user_metadata: { full_name: 'Vandaag' }, app_metadata: { expires_at: '2026-11-03' } },
      { id: '3', email: 'c@x.be', user_metadata: { full_name: 'Later' }, app_metadata: { expires_at: '2027-01-01T00:00:00Z' } },
    ], today)
    expect(people.map(p => p.name)).toEqual(['Later', 'Vandaag'])
  })

  it('valt terug op user_metadata.name', () => {
    expect(activePeople([{ id: '1', email: 'j@x.be', user_metadata: { name: 'Jelle' } }], today)[0].name).toBe('Jelle')
  })
})
