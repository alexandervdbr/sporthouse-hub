import { z } from 'zod'

// Whitelists voor elke schrijfroute van de freelancertool. Alles is strict:
// een veld dat hier niet staat is een 400, nooit een stille doorgifte naar
// de database. (De PATCH op een freelancer schreef vroeger de hele body weg,
// dus ook id, created_at of avatar_url.)
//
// Dit zijn de velden van het huidige datamodel. Fase 2/3 van het herontwerp
// (docs/freelancers-redesign.md) vervangt ze.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Tekst die leeg mag zijn: getrimd, en '' wordt null. */
const optText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform(v => (v === '' ? null : v))

const requiredText = (max: number) => z.string().trim().min(1).max(max)

const optEmail = z.string().trim().toLowerCase().max(320).nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || EMAIL.test(v), 'Ongeldig e-mailadres')

const optUrl = optText(2000).refine(v => v == null || /^https?:\/\/\S+$/i.test(v), 'Ongeldige link')

const optDate = z.string().nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || (DATE.test(v) && !Number.isNaN(Date.parse(v))), 'Ongeldige datum')

const optScore = z.number().int().min(1).max(5).nullable().optional()

export const TESTED_VALUES = ['nee', 'weinig', 'ja'] as const
export const ASSIGNMENT_STATUSES = ['nieuw', 'in_behandeling', 'afgerond'] as const

const freelancerFields = {
  email: optEmail,
  phone: optText(50),
  types: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  tested: z.enum(TESTED_VALUES).nullable().optional(),
  price_info: optText(500),
  rating: optScore,
  portfolio_url: optUrl,
  notes: optText(5000),
}

export const freelancerCreateSchema = z.strictObject({
  name: requiredText(200),
  ...freelancerFields,
})

export const freelancerUpdateSchema = z.strictObject({
  name: requiredText(200).optional(),
  ...freelancerFields,
}).refine(o => Object.keys(o).length > 0, 'Niets om te wijzigen')

export const projectCreateSchema = z.strictObject({
  project_name: requiredText(300),
  description: optText(5000),
  client_name: optText(200),
  date: optDate,
  score: optScore,
  notes: optText(5000),
})

const assignmentFields = {
  briefing: optText(20000),
  deadline: optDate,
  client_name: optText(200),
}

export const assignmentCreateSchema = z.strictObject({
  title: requiredText(300),
  ...assignmentFields,
})

export const assignmentUpdateSchema = z.strictObject({
  title: requiredText(300).optional(),
  ...assignmentFields,
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
}).refine(o => Object.keys(o).length > 0, 'Niets om te wijzigen')

export const fileDeleteSchema = z.strictObject({
  fileId: z.uuid(),
})

// De match leest alleen de ids uit wat de browser meestuurt; de profielen
// haalt de server zelf op. Wat er verder in die objecten staat, telt niet.
export const matchSchema = z.strictObject({
  description: requiredText(4000),
  freelancers: z.array(z.looseObject({ id: z.uuid() })).max(1000),
})
