import { z } from 'zod'

// Whitelists voor elke schrijfroute van het freelanceroverzicht
// (docs/freelancers-overzicht.md). Alles is strict: een veld dat hier niet
// staat is een 400, nooit een stille doorgifte naar de database.
//
// Bewust niet in de PATCH: archived_at (eigen route), en alles wat de
// database zelf zet (id, created_at, updated_at).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Tekst die leeg mag zijn: getrimd, en '' wordt null. */
const optText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform(v => (v === '' ? null : v))
const requiredText = (max: number) => z.string().trim().min(1).max(max)

const optEmail = z.string().trim().toLowerCase().max(320).nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || EMAIL.test(v), 'Ongeldig e-mailadres')

const optDate = z.string().nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || (DATE.test(v) && !Number.isNaN(Date.parse(v))), 'Ongeldige datum')

export const httpUrl = z.string().trim().min(1).max(2000).refine(v => /^https?:\/\/\S+$/i.test(v), 'Ongeldige link')
const score = z.number().int().min(1).max(5)

export const FREELANCER_STATUSES = ['vast', 'proefopdracht', 'kandidaat', 'inactief'] as const
export const RATE_UNITS = ['uur', 'dag', 'project'] as const

export const disciplineKey = z.string().regex(SLUG).max(60)
const disciplines = z.array(disciplineKey).min(1, 'Kies minstens één discipline').max(20)
  .transform(a => [...new Set(a)])

/** Een of meer links; het label is optioneel. */
export const portfolioLinks = z.array(z.strictObject({
  label: z.string().trim().max(80).nullish().transform(v => (v ? v : undefined)),
  url: httpUrl,
})).max(20).transform(a => a.map(l => (l.label ? { label: l.label, url: l.url } : { url: l.url })))

// Een tarief heeft een bedrag én een eenheid, of geen van beide (de check
// freelancers_rate_unit_with_amount in 0093).
const rateConsistent = (o: { rate_amount?: number | null; rate_unit?: string | null }) =>
  o.rate_amount === undefined && o.rate_unit === undefined
    ? true
    : (o.rate_amount ?? null) === null ? (o.rate_unit ?? null) === null : (o.rate_unit ?? null) !== null
const RATE_MSG = { message: 'Geef een bedrag én een eenheid, of geen van beide', path: ['rate_unit'] }

const fields = {
  email: optEmail,
  phone: optText(50),
  status: z.enum(FREELANCER_STATUSES).optional(),
  rate_amount: z.number().nonnegative().max(10_000_000).nullable().optional(),
  rate_unit: z.enum(RATE_UNITS).nullable().optional(),
  rate_note: optText(500),
  overall_rating: score.nullable().optional(),
  overall_rating_note: optText(2000),
  portfolio_links: portfolioLinks.optional(),
  notes: optText(10_000),
}

/** "+ Freelancer": alleen naam en minstens één discipline zijn verplicht. */
export const freelancerCreateSchema = z.strictObject({
  name: requiredText(200),
  disciplines,
  ...fields,
}).refine(rateConsistent, RATE_MSG)

/** Het hele formulier van het paneel (of een deel ervan). */
export const freelancerUpdateSchema = z.strictObject({
  name: requiredText(200).optional(),
  disciplines: disciplines.optional(),
  ...fields,
})
  .refine(o => Object.keys(o).length > 0, 'Niets om te wijzigen')
  .refine(rateConsistent, RATE_MSG)

const projectFields = {
  client_name: optText(200),
  date: optDate,
  score: score.nullable().optional(),
  notes: optText(5000),
}

/** Een samenwerking. */
export const projectCreateSchema = z.strictObject({
  project_name: requiredText(300),
  ...projectFields,
})

export const projectUpdateSchema = z.strictObject({
  project_name: requiredText(300).optional(),
  ...projectFields,
}).refine(o => Object.keys(o).length > 0, 'Niets om te wijzigen')

export const disciplineCreateSchema = z.strictObject({
  label: requiredText(60),
})

/**
 * Importeren: wat de browser na het voorbeeld en de bevestiging opstuurt.
 * Elke rij wordt opnieuw gevalideerd met dezelfde whitelists als het
 * formulier; een nieuwe discipline heeft de sleutel die uit zijn label volgt.
 */
const line = z.number().int().min(1).max(100_000)
export const IMPORT_MAX_ROWS = 2000
export const importSchema = z.strictObject({
  new_disciplines: z.array(z.strictObject({ key: disciplineKey, label: requiredText(60) })).max(100),
  create: z.array(z.strictObject({ line, data: freelancerCreateSchema })).max(IMPORT_MAX_ROWS),
  update: z.array(z.strictObject({ line, id: z.uuid(), data: freelancerUpdateSchema })).max(IMPORT_MAX_ROWS),
}).refine(o => o.create.length + o.update.length + o.new_disciplines.length > 0, 'Niets om te importeren')
