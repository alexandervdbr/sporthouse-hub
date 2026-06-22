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

function buildDescription(date: string, notes?: string) {
  const lines = [
    `DEADLINE: ${fmtDate(date)}`,
    '',
    'Stats:',
    'Titel:',
    'Banner:',
    'Copy:',
    'CTA:',
  ]
  if (notes?.trim()) lines.push('', 'Notities:', notes.trim())
  return lines.join('\n')
}

interface PushRow {
  date: string
  title: string
  designer: string
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

  const [{ data: cfg }, { data: members }, { data: client }] = await Promise.all([
    admin.from('content_planner_config').select('asana_project_gid, asana_extra_project_gids, active_pm_email').eq('client_id', clientId).maybeSingle(),
    admin.from('content_planner_members').select('contact_name, contact_email, role').eq('client_id', clientId),
    admin.from('clients').select('name').eq('id', clientId).single(),
  ])

  if (!cfg?.asana_project_gid) {
    return Response.json({ error: 'Geen Asana Project GID geconfigureerd.' }, { status: 400 })
  }
  // Gebruik actieve PM als die ingesteld is, anders de eerste PM
  const activePmEmail = cfg.active_pm_email
  const pm = activePmEmail
    ? members?.find(m => m.role === 'pm' && m.contact_email === activePmEmail)
    : members?.find(m => m.role === 'pm')
  if (!pm) {
    return Response.json({ error: 'Geen (actieve) PM geconfigureerd.' }, { status: 400 })
  }

  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  const extraGids: string[] = (cfg.asana_extra_project_gids ?? []).map((p: { gid: string }) => p.gid).filter(Boolean)
  const allProjectGids = [cfg.asana_project_gid, ...extraGids]
  const clientPrefix = (client?.name ?? 'CONTENT').split(' ')[0].toUpperCase()

  // Resolve all emails to Asana GIDs in one call
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
    const designer = members?.find(m => m.role === 'designer' && m.contact_name === row.designer)
    const pmGid = emailToGid[pm.contact_email.toLowerCase()]
    const designerGid = designer ? emailToGid[designer.contact_email.toLowerCase()] : undefined
    const description = buildDescription(row.date, row.notes)

    // POSTEN task — assigned to PM
    let pmResult: { ok: boolean; error?: string }
    if (!pmGid) {
      pmResult = { ok: false, error: `${pm.contact_name} niet gevonden in Asana` }
    } else {
      const res = await fetch(`${ASANA_API}/tasks`, {
        method: 'POST',
        headers: asanaHeaders(),
        body: JSON.stringify({
          data: {
            name: `POSTEN: ${row.title}`,
            assignee: pmGid,
            due_on: row.date,
            notes: description,
            projects: [cfg.asana_project_gid],
          },
        }),
      })
      pmResult = res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    }

    // CREATIE task — assigned to designer
    let designerResult: { ok: boolean; error?: string }
    if (!designerGid) {
      designerResult = {
        ok: false,
        error: designer ? `${designer.contact_name} niet gevonden in Asana` : 'Geen designer geselecteerd',
      }
    } else {
      const res = await fetch(`${ASANA_API}/tasks`, {
        method: 'POST',
        headers: asanaHeaders(),
        body: JSON.stringify({
          data: {
            name: `${clientPrefix}: ${row.title}`,
            assignee: designerGid,
            due_on: row.date,
            notes: description,
            projects: allProjectGids,
          },
        }),
      })
      designerResult = res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    }

    results.push({ rowTitle: row.title, pm: pmResult, designer: designerResult })

    // Log succesvolle pushes voor de stats tab
    if (pmResult.ok && designerResult.ok) {
      await admin.from('content_planner_push_log').insert({
        client_id: clientId,
        post_date: row.date,
        post_title: row.title,
        designer: row.designer ?? '',
        pushed_by: user.email ?? '',
      })
    }
  }

  return Response.json({ results })
}
