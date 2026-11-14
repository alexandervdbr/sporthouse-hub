import { z } from 'zod'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-policy'
import { ASSIGNMENT_STATUSES, MAX_MESSAGE_LENGTH } from './statuses'
import { MAX_FILES_PER_REQUEST } from './config'

// Whitelists voor elke schrijfroute van de interne freelancer-API (nieuw
// datamodel, migratie 0093). Alles is strict: een veld dat hier niet staat
// is een 400, nooit een stille doorgifte naar de database.
//
// Bewust NIET in de gewone profiel-PATCH: overall_rating (eigen route, alleen
// handmatig), archived_at (eigen route), avatar_url (eigen route), en alles
// wat de server zelf zet (updated_at, *_updated_by, …).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const optText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform(v => (v === '' ? null : v))
const requiredText = (max: number) => z.string().trim().min(1).max(max)

const optEmail = z.string().trim().toLowerCase().max(320).nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || EMAIL.test(v), 'Ongeldig e-mailadres')

const optDate = z.string().nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || (DATE.test(v) && !Number.isNaN(Date.parse(v))), 'Ongeldige datum')

const httpUrl = z.string().trim().max(2000).refine(v => /^https?:\/\/\S+$/i.test(v), 'Ongeldige link')
const amount = z.number().nonnegative().max(10_000_000).nullable().optional()
const score = z.number().int().min(1).max(5)

export const FREELANCER_STATUSES = ['kandidaat', 'proefopdracht', 'vast', 'inactief'] as const
export const RATE_UNITS = ['uur', 'dag', 'project'] as const
export const AVAILABILITY = ['beschikbaar', 'beperkt', 'niet_beschikbaar'] as const

const disciplineKey = z.string().regex(SLUG).max(60)

const portfolioLinks = z.array(z.strictObject({
  label: z.string().trim().min(1).max(80),
  url: httpUrl,
})).max(20)

// Een tarief heeft een bedrag én een eenheid, of geen van beide (zoals de
// check freelancers_rate_unit_with_amount in 0093).
const rateConsistent = (o: { rate_amount?: number | null; rate_unit?: string | null }) =>
  o.rate_amount === undefined && o.rate_unit === undefined
    ? true
    : (o.rate_amount ?? null) === null ? (o.rate_unit ?? null) === null : (o.rate_unit ?? null) !== null

const profileFields = {
  email: optEmail,
  phone: optText(50),
  status: z.enum(FREELANCER_STATUSES).optional(),
  rate_amount: amount,
  rate_unit: z.enum(RATE_UNITS).nullable().optional(),
  rate_note: optText(500),
  portfolio_links: portfolioLinks.optional(),
  notes: optText(10_000),
}

/** "+ Freelancer": alleen naam en minstens één discipline zijn verplicht. */
export const freelancerCreateSchema = z.strictObject({
  name: requiredText(200),
  disciplines: z.array(disciplineKey).min(1).max(20),
  ...profileFields,
}).refine(rateConsistent, { message: 'Geef een bedrag én een eenheid, of geen van beide', path: ['rate_unit'] })

/** Eén kaart van het profiel tegelijk (Contact, Tarief, Beschikbaarheid, …). */
export const freelancerUpdateSchema = z.strictObject({
  name: requiredText(200).optional(),
  disciplines: z.array(disciplineKey).min(1).max(20).optional(),
  ...profileFields,
  availability: z.enum(AVAILABILITY).optional(),
  available_from: optDate,
})
  .refine(o => Object.keys(o).length > 0, 'Niets om te wijzigen')
  .refine(rateConsistent, { message: 'Geef een bedrag én een eenheid, of geen van beide', path: ['rate_unit'] })

/** Het handmatige, interne cijfer. Nooit automatisch. */
export const ratingSchema = z.strictObject({
  overall_rating: score.nullable(),
  overall_rating_note: optText(2000),
})

export const assignmentCreateSchema = z.strictObject({
  freelancer_id: z.uuid(),
  title: requiredText(300),
  discipline: disciplineKey.nullable().optional(),
  briefing: optText(50_000),
  client_id: z.uuid().nullable().optional(),
  client_name: optText(200),
  deadline: optDate,
  /** true = meteen delen (concept → gedeeld), anders een concept. */
  share: z.boolean().optional(),
})

export const assignmentUpdateSchema = z.strictObject({
  freelancer_id: z.uuid().optional(),   // alleen zolang de opdracht een concept is
  title: requiredText(300).optional(),
  discipline: disciplineKey.nullable().optional(),
  briefing: optText(50_000),
  client_id: z.uuid().nullable().optional(),
  client_name: optText(200),
  deadline: optDate,
}).refine(o => Object.keys(o).length > 0, 'Niets om te wijzigen')

export const transitionSchema = z.strictObject({
  to: z.enum(ASSIGNMENT_STATUSES),
  message: z.string().max(MAX_MESSAGE_LENGTH).nullable().optional(),
})

export const reviewSchema = z.strictObject({
  score,
  score_quality: score.nullable().optional(),
  score_deadline: score.nullable().optional(),
  score_communication: score.nullable().optional(),
  comment: optText(5000),
})

export const disciplineCreateSchema = z.strictObject({
  label: requiredText(60),
})

export const disciplineUpdateSchema = z.strictObject({
  label: requiredText(60).optional(),
  sort: z.number().int().min(0).max(100_000).optional(),
  archived: z.boolean().optional(),
}).refine(o => Object.keys(o).length > 0, 'Niets om te wijzigen')

export const uploadSessionSchema = z.strictObject({
  files: z.array(z.strictObject({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    mimeType: z.string().max(200).optional(),
  })).min(1).max(MAX_FILES_PER_REQUEST),
})

const DRIVE_UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files?'
export const finalizeSchema = z.strictObject({
  uploads: z.array(z.strictObject({
    uploadUrl: z.string().max(4000).refine(u => u.startsWith(DRIVE_UPLOAD_PREFIX), 'Ongeldige upload-URL'),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  })).min(1).max(MAX_FILES_PER_REQUEST),
})

export const AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const avatarRequestSchema = z.strictObject({
  contentType: z.enum(Object.keys(AVATAR_TYPES) as [keyof typeof AVATAR_TYPES, ...(keyof typeof AVATAR_TYPES)[]]),
  size: z.number().int().positive().max(AVATAR_MAX_BYTES),
})
export const avatarConfirmSchema = z.strictObject({
  path: z.string().max(200),
})

export const matchSchema = z.strictObject({
  description: requiredText(4000),
  discipline: disciplineKey.nullable().optional(),
  deadline: optDate,
})
