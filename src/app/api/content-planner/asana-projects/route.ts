import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  const pat = process.env.ASANA_PAT

  if (!workspaceGid || !pat) {
    return Response.json({ error: 'Asana niet geconfigureerd.' }, { status: 500 })
  }

  const res = await fetch(
    `https://app.asana.com/api/1.0/workspaces/${workspaceGid}/projects?opt_fields=gid,name&limit=100`,
    {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/json',
      },
    }
  )

  if (!res.ok) {
    return Response.json({ error: `Asana fout: HTTP ${res.status}` }, { status: 502 })
  }

  const data = await res.json()
  const projects = (data.data ?? [])
    .map((p: { gid: string; name: string }) => ({ gid: p.gid, name: p.name }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

  return Response.json(projects)
}
