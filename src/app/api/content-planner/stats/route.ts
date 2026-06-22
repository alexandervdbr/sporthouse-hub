import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const period = searchParams.get('period') ?? '3m'
  if (!clientId) return new Response('clientId required', { status: 400 })

  const now = new Date()
  let from: Date

  if (period === '1m') {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (period === 'prev') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    now.setDate(0) // last day of previous month
  } else if (period === '1y') {
    from = new Date(now.getFullYear(), 0, 1)
  } else {
    // default: 3m
    from = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_planner_push_log')
    .select('post_date, post_title, designer, pushed_by, pushed_at')
    .eq('client_id', clientId)
    .gte('post_date', from.toISOString().slice(0, 10))
    .lte('post_date', now.toISOString().slice(0, 10))
    .order('post_date', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })

  const posts = data ?? []

  // Posts per week (ISO week key: YYYY-Www)
  const weekMap: Record<string, number> = {}
  for (const p of posts) {
    const d = new Date(p.post_date)
    const week = getISOWeekKey(d)
    weekMap[week] = (weekMap[week] ?? 0) + 1
  }

  // Posts per designer
  const designerMap: Record<string, number> = {}
  for (const p of posts) {
    const name = p.designer || 'Onbekend'
    designerMap[name] = (designerMap[name] ?? 0) + 1
  }

  const totalPosts = posts.length
  const weeks = Object.keys(weekMap)
  const avgPerWeek = weeks.length > 0 ? Math.round((totalPosts / weeks.length) * 10) / 10 : 0
  const topDesigner = Object.entries(designerMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  return Response.json({
    totalPosts,
    avgPerWeek,
    topDesigner,
    perWeek: Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count })),
    perDesigner: Object.entries(designerMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
  })
}

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
