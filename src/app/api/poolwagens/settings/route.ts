import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseRecipients } from '@/lib/poolwagens/damage-input'
import { mailConfig } from '@/lib/poolwagens/mail'
import { isPushConfigured } from '@/lib/poolwagens/push'
import { isSporthouseDriveConfigured } from '@/lib/drive-storage'
import type { PoolSettingsResponse } from '@/lib/poolwagens/types'

// Beheer: de ontvangers van de schademail, en of mail, push en Drive
// ingesteld zijn (alleen ja/nee, nooit de waarden).

async function status(): Promise<Omit<PoolSettingsResponse, 'recipients'>> {
  return { mailConfigured: !!mailConfig(), pushConfigured: isPushConfigured(), driveConfigured: isSporthouseDriveConfigured() }
}

export async function GET() {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase.from('pool_settings').select('damage_mail_recipients').maybeSingle()
  if (error) return dbErrorResponse(error)
  return Response.json({ recipients: data?.damage_mail_recipients ?? [], ...(await status()) } satisfies PoolSettingsResponse)
}

export async function PUT(req: Request) {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = (await readJson(req)) as { recipients?: unknown } | null
  const parsed = parseRecipients(body?.recipients ?? '')
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { data, error } = await supabase.rpc('pool_set_mail_recipients', { p_recipients: parsed.list })
  if (error) return dbErrorResponse(error)
  return Response.json({ recipients: (data as string[] | null) ?? parsed.list, ...(await status()) } satisfies PoolSettingsResponse)
}
