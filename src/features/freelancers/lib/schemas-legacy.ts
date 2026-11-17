import { z } from 'zod'

// Whitelists van de OUDE opdracht- en matchroutes. Die routes worden door
// geen enkel scherm meer gebruikt en verdwijnen in Fase 3
// (docs/freelancers-overzicht.md §4), samen met dit bestand.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const optText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform(v => (v === '' ? null : v))
const requiredText = (max: number) => z.string().trim().min(1).max(max)
const optDate = z.string().nullable().optional()
  .transform(v => (v === '' ? null : v))
  .refine(v => v == null || (DATE.test(v) && !Number.isNaN(Date.parse(v))), 'Ongeldige datum')

export const ASSIGNMENT_STATUSES = ['nieuw', 'in_behandeling', 'afgerond'] as const

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

export const matchSchema = z.strictObject({
  description: requiredText(4000),
  freelancers: z.array(z.looseObject({ id: z.uuid() })).max(1000),
})
