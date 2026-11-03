import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/access-roles-server'
import { isKnownTool, toStatusMap } from '@/lib/tool-status'

const COLUMNS = 'tool, in_development, message, updated_at, updated_by'

// GET — de status van elke tool die ooit is ingesteld (ontbrekend = live)
export async function GET() {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('tool_status').select(COLUMNS)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(toStatusMap(data))
}

// PUT — één tool in of uit ontwikkeling zetten, eventueel met eigen melding
export async function PUT(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const body = await req.json().catch(() => null)
  const tool = String(body?.tool ?? '')
  if (!isKnownTool(tool)) return new Response('Onbekende tool', { status: 400 })
  if (typeof body?.in_development !== 'boolean') return new Response('in_development ontbreekt', { status: 400 })

  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 500) : ''

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tool_status')
    .upsert({
      tool,
      in_development: body.in_development,
      message: message || null,
      updated_at: new Date().toISOString(),
      updated_by: user.email ?? null,
    })
    .select(COLUMNS)
    .single()
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(toStatusMap([data])[tool])
}
