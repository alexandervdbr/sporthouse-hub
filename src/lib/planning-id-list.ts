// Lijsten van contact-id's in planning_config: gearchiveerd
// ('archived_employees') en uit het rooster gehaald ('excluded_contacts').
//
// De archieflijst nam vroeger elke array aan, en was in de route nog
// beschreven als {dept, emp}[] uit de tijd dat het rooster op namen draaide.
// De client stuurt en leest contact-id's. Wat geen contact-id is, matcht
// nergens op en verdwijnt dus best bij het lezen, en wordt bij het schrijven
// geweigerd.

import { isContactId } from './planning-access'

// Bij het lezen: alles wat geen contact-id is valt weg, dubbels ook.
export function cleanIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && isContactId(v)))]
}

// Bij het schrijven: een lijst van uitsluitend contact-id's, of null.
export function parseIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(v => typeof v === 'string' && isContactId(v))) return null
  return [...new Set(value as string[])]
}
