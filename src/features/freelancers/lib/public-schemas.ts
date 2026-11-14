import { z } from 'zod'
import { MAX_FILES_PER_REQUEST } from './config'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-policy'

// Whitelists voor de publieke link. Strict: elk ander veld is een 400.

export const sessionSchema = z.strictObject({ token: z.string().max(100).optional() })
export const pinSchema = z.strictObject({ token: z.string().max(100), pin: z.string().max(10) })

const DATE = /^\d{4}-\d{2}-\d{2}$/
export const availabilitySchema = z.strictObject({
  availability: z.enum(['beschikbaar', 'beperkt', 'niet_beschikbaar']),
  available_from: z.string().regex(DATE).nullable().optional(),
})

export const actionSchema = z.strictObject({
  action: z.enum(['accepteren', 'weigeren', 'opleveren']),
  reason: z.string().trim().max(2000).nullable().optional(),
})

export const publicUploadSchema = z.strictObject({
  files: z.array(z.strictObject({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    mimeType: z.string().max(200).optional(),
  })).min(1).max(MAX_FILES_PER_REQUEST),
})

export const publicFinalizeSchema = z.strictObject({
  uploads: z.array(z.strictObject({
    uploadUrl: z.string().max(4000).refine(u => u.startsWith('https://www.googleapis.com/upload/drive/v3/files?'), 'Ongeldige upload-URL'),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  })).min(1).max(MAX_FILES_PER_REQUEST),
})

/** Body lezen + valideren; null bij elke fout (de route geeft dan een 400). */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | null> {
  try {
    const parsed = schema.safeParse(await req.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
