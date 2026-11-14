import { z } from 'zod'

// Whitelists voor de OUDE geneste routes (/api/freelancers/[id]/projects/**
// en /api/freelancers/[id]/assignments/**) van vóór het nieuwe datamodel.
// Verdwijnen samen met die routes (Fase 5/6 van docs/freelancers-redesign.md).
// Nieuwe code gebruikt ./schemas.ts.

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Tekst die leeg mag zijn: getrimd, en '' wordt null. */
const optText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform(v => (v === '' ? null : v))

const requiredText = (max: number) => z.string().trim().min(1).max(max)

const optDate = z.string().nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || (DATE.test(v) && !Number.isNaN(Date.parse(v))), 'Ongeldige datum')

const optScore = z.number().int().min(1).max(5).nullable().optional()

export const ASSIGNMENT_STATUSES = ['nieuw', 'in_behandeling', 'afgerond'] as const

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

