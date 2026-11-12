import { describe, it, expect } from 'vitest'
import { cleanIdList, parseIdList } from '../planning-id-list'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('cleanIdList', () => {
  it('keeps contact ids and drops duplicates', () => {
    expect(cleanIdList([A, B, A])).toEqual([A, B])
  })

  it('drops the old {dept, emp} shape and other junk', () => {
    expect(cleanIdList([{ dept: 'Content', emp: 'Anna' }, 'Anna', 42, null, A])).toEqual([A])
  })

  it('treats anything but an array as empty', () => {
    expect(cleanIdList(null)).toEqual([])
    expect(cleanIdList({ a: 1 })).toEqual([])
  })
})

describe('parseIdList', () => {
  it('accepts a list of contact ids, deduplicated', () => {
    expect(parseIdList([A, B, B])).toEqual([A, B])
    expect(parseIdList([])).toEqual([])
  })

  it('rejects anything that is not a contact id', () => {
    expect(parseIdList([A, 'Anna'])).toBeNull()
    expect(parseIdList([{ dept: 'x', emp: 'y' }])).toBeNull()
    expect(parseIdList('nope')).toBeNull()
  })
})
