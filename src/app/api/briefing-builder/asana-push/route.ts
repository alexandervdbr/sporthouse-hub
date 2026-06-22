import { createClient, createAdminClient } from '@/lib/supabase/server'

const ASANA_API = 'https://app.asana.com/api/1.0'

function asanaHeaders() {
  return {
    Authorization: `Bearer ${process.env.ASANA_PAT}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function buildDescription(row: PushRow) {
  const lines: string[] = []

  if (row.deadline) lines.push(`DEADLINE: ${fmtDate(row.deadline)}`, '')

  if (row.description?.trim()) {
    lines.push('Opdracht:', row.description.trim(), '')
  }
  if (row.audience?.trim()) {
    lines.push('Doelgroep / Context:', row.audience.trim(), '')
  }
  if (row.style?.trim()) {
    lines.push('Stijl / Tone of voice:', row.style.trim(), '')
  }
  if (row.assets && row.assets.length > 0) {
    lines.push('Assets:')
    row.assets.forEach(a => {
      lines.push(a.label ? `${a.label}: ${a.url}` : a.url)
    })
    lines.push('')
  }
  if (row.notes?.trim()) {
    lines.push('Opmerkingen:', row.notes.trim(), '')
  }

  return lines.join('\n').trimEnd()
}

interface Asset {
  label: string
  url: string
}

interface PushRow {
  title: string
  assignee: string
  deadline: string
  description?: string
  audience?: string
  style?: string
  assets?: Asset[]
  notes?: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { clientId, rows }: { clientId: string; rows: PushRow[] } = await req.json()
  if (!clientId || !Array.isArray(rows) || rows.length === 0) {
    return new Response('Bad request', { status: 400 })
  }

  const admin = createAdminClient()

  const [{ data: cfg }, { data: members }] = await Promise.all([
    admin.from('briefing_builder_config').select('asana_project_gid, asana_extra_project_gids').eq('client_id', clientId).maybeSingle(),
    admin.from('briefing_builder_members').select('contact_name, contact_email').eq('client_id', clientId),
  ])

  if (!cfg?.asana_project_gid) {
    return Response.json({ error: 'Geen Asana Project GID geconfigureerd.' }, { status: 400 })
  }

  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  const extraGids: string[] = (cfg.asana_extra_project_gids ?? []).map((p: { gid: string }) => p.gid).filter(Boolean)
  const allProjectGids = [cfg.asana_project_gid, ...extraGids]

  const usersRes = await fetch(
    `${ASANA_API}/workspaces/${workspaceGid}/users?opt_fields=email,gid`,
    { headers: asanaHeaders() }
  )

  if (!usersRes.ok) {
    return Response.json({ error: 'Kon gebruikers niet ophalen uit Asana.' }, { status: 502 })
  }

  const usersData = await usersRes.json()
  const emailToGid: Record<string, string> = {}
  for (const u of usersData.data ?? []) {
    if (u.email) emailToGid[u.email.toLowerCase()] = u.gid
  }

  const results = []

  for (const row of rows) {
    const member = members?.find(m => m.contact_name === row.assignee)
    const assigneeGid = member ? emailToGid[member.contact_email.toLowerCase()] : undefined
    const description = buildDescription(row)

    let result: { ok: boolean; error?: string }
    if (!assigneeGid) {
      result = {
        ok: false,
        error: member
          ? `${member.contact_name} niet gevonden in Asana`
          : 'Geen persoon geselecteerd',
      }
    } else {
      const res = await fetch(`${ASANA_API}/tasks`, {
        method: 'POST',
        headers: asanaHeaders(),
        body: JSON.stringify({
          data: {
            name: row.title,
            assignee: assigneeGid,
            due_on: row.deadline || undefined,
            notes: description,
            projects: allProjectGids,
          },
        }),
      })
      result = res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    }

    results.push({ rowTitle: row.title, task: result })
  }

  return Response.json({ results })
}
