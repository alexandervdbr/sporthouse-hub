import { createClient } from '@/lib/supabase/server'
import { OAuth2Client } from 'google-auth-library'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']
const PROPERTY_ID = process.env.GA4_PROPERTY_ID

async function getAccessToken(): Promise<string> {
  const oAuth2Client = new OAuth2Client(
    process.env.GA4_OAUTH_CLIENT_ID,
    process.env.GA4_OAUTH_CLIENT_SECRET,
  )
  oAuth2Client.setCredentials({ refresh_token: process.env.GA4_REFRESH_TOKEN })
  const token = await oAuth2Client.getAccessToken()
  if (!token.token) throw new Error('Kon geen access token ophalen')
  return token.token
}

async function runReport(token: string, body: object) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GA4 ${res.status}: ${text}`)
  }
  return res.json()
}

type Row = { dimensionValues: { value: string }[]; metricValues: { value: string }[] }

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return parseFloat(((current - previous) / previous * 100).toFixed(1))
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return new Response('Forbidden', { status: 403 })
  }

  if (!PROPERTY_ID || !process.env.GA4_OAUTH_CLIENT_ID || !process.env.GA4_REFRESH_TOKEN) {
    return Response.json({ error: 'GA4 credentials niet geconfigureerd.' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const startParam = searchParams.get('start')
  const endParam   = searchParams.get('end')
  const range      = parseInt(searchParams.get('range') ?? '30', 10)

  let currentRange: { startDate: string; endDate: string }
  let previousRange: { startDate: string; endDate: string }

  if (startParam && endParam) {
    // Custom date range — previous period = same duration before startParam
    const startMs  = new Date(startParam).getTime()
    const endMs    = new Date(endParam).getTime()
    const duration = Math.ceil((endMs - startMs) / 86400000) + 1
    const prevEnd  = new Date(startMs - 86400000)
    const prevStart= new Date(startMs - duration * 86400000)
    currentRange  = { startDate: startParam, endDate: endParam }
    previousRange = {
      startDate: prevStart.toISOString().slice(0, 10),
      endDate:   prevEnd.toISOString().slice(0, 10),
    }
  } else {
    currentRange  = { startDate: `${range}daysAgo`,     endDate: 'today' }
    previousRange = { startDate: `${range * 2}daysAgo`, endDate: `${range + 1}daysAgo` }
  }

  try {
    const token = await getAccessToken()

    const [
      totalsData, timelineData, prevTimelineData,
      topPagesData, sourcesData, devicesData,
      newVsReturningData, countriesData, citiesData,
      landingPagesData, dayOfWeekData, hourData,
    ] = await Promise.all([
      runReport(token, {
        dateRanges: [currentRange, previousRange],
        metrics: [
          { name: 'sessions' }, { name: 'activeUsers' },
          { name: 'screenPageViews' }, { name: 'bounceRate' },
          { name: 'averageSessionDuration' }, { name: 'engagementRate' },
          { name: 'newUsers' },
        ],
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'newUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      runReport(token, {
        dateRanges: [previousRange],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'newUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'newVsReturning' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'city' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'landingPage' }],
        metrics: [{ name: 'sessions' }, { name: 'bounceRate' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'dayOfWeek' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'dayOfWeek' } }],
      }),
      runReport(token, {
        dateRanges: [currentRange],
        dimensions: [{ name: 'hour' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'hour' } }],
      }),
    ])

    // --- Totals ---
    const findRow = (rows: Row[], rangeKey: string) =>
      rows?.find(r => r.dimensionValues?.[0]?.value === rangeKey)

    const curRow  = findRow(totalsData.rows ?? [], 'date_range_0')
    const prevRow = findRow(totalsData.rows ?? [], 'date_range_1')

    const cur = {
      sessions:       Number(curRow?.metricValues?.[0]?.value ?? 0),
      users:          Number(curRow?.metricValues?.[1]?.value ?? 0),
      pageviews:      Number(curRow?.metricValues?.[2]?.value ?? 0),
      bounceRate:     parseFloat((Number(curRow?.metricValues?.[3]?.value ?? 0) * 100).toFixed(1)),
      avgDuration:    Math.round(Number(curRow?.metricValues?.[4]?.value ?? 0)),
      engagementRate: parseFloat((Number(curRow?.metricValues?.[5]?.value ?? 0) * 100).toFixed(1)),
      newUsers:       Number(curRow?.metricValues?.[6]?.value ?? 0),
    }
    const prev = {
      sessions:       Number(prevRow?.metricValues?.[0]?.value ?? 0),
      users:          Number(prevRow?.metricValues?.[1]?.value ?? 0),
      pageviews:      Number(prevRow?.metricValues?.[2]?.value ?? 0),
      bounceRate:     parseFloat((Number(prevRow?.metricValues?.[3]?.value ?? 0) * 100).toFixed(1)),
      avgDuration:    Math.round(Number(prevRow?.metricValues?.[4]?.value ?? 0)),
      engagementRate: parseFloat((Number(prevRow?.metricValues?.[5]?.value ?? 0) * 100).toFixed(1)),
      newUsers:       Number(prevRow?.metricValues?.[6]?.value ?? 0),
    }

    const totals = {
      ...cur,
      change: {
        sessions:       pct(cur.sessions,       prev.sessions),
        users:          pct(cur.users,          prev.users),
        pageviews:      pct(cur.pageviews,      prev.pageviews),
        bounceRate:     pct(cur.bounceRate,      prev.bounceRate),
        avgDuration:    pct(cur.avgDuration,    prev.avgDuration),
        engagementRate: pct(cur.engagementRate, prev.engagementRate),
        newUsers:       pct(cur.newUsers,       prev.newUsers),
      },
    }

    // --- Timeline ---
    const timeline = (timelineData.rows ?? []).map((row: Row) => ({
      date:      row.dimensionValues?.[0]?.value ?? '',
      sessions:  Number(row.metricValues?.[0]?.value ?? 0),
      users:     Number(row.metricValues?.[1]?.value ?? 0),
      pageviews: Number(row.metricValues?.[2]?.value ?? 0),
      newUsers:  Number(row.metricValues?.[3]?.value ?? 0),
    }))

    const prevTimeline = (prevTimelineData.rows ?? []).map((row: Row, i: number) => ({
      date:          timeline[i]?.date ?? '',
      prevSessions:  Number(row.metricValues?.[0]?.value ?? 0),
      prevUsers:     Number(row.metricValues?.[1]?.value ?? 0),
      prevPageviews: Number(row.metricValues?.[2]?.value ?? 0),
      prevNewUsers:  Number(row.metricValues?.[3]?.value ?? 0),
    }))

    const chartData = timeline.map((d: typeof timeline[number], i: number) => ({
      ...d,
      ...(prevTimeline[i] ?? {}),
    }))

    // --- Other reports ---
    const topPages = (topPagesData.rows ?? []).map((row: Row) => ({
      page:  row.dimensionValues?.[0]?.value ?? '',
      views: Number(row.metricValues?.[0]?.value ?? 0),
      users: Number(row.metricValues?.[1]?.value ?? 0),
    }))

    const sources = (sourcesData.rows ?? []).map((row: Row) => ({
      source:   row.dimensionValues?.[0]?.value ?? '',
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))

    const devices = (devicesData.rows ?? []).map((row: Row) => ({
      device:   row.dimensionValues?.[0]?.value ?? '',
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))

    const newVsReturning = (newVsReturningData.rows ?? [])
      .map((row: Row) => ({
        type:     row.dimensionValues?.[0]?.value ?? '',
        sessions: Number(row.metricValues?.[0]?.value ?? 0),
        users:    Number(row.metricValues?.[1]?.value ?? 0),
      }))
      .filter((r: { type: string }) => r.type === 'new' || r.type === 'returning')

    const countries = (countriesData.rows ?? []).map((row: Row) => ({
      country:  row.dimensionValues?.[0]?.value ?? '',
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))

    const cities = (citiesData.rows ?? []).map((row: Row) => ({
      city:     row.dimensionValues?.[0]?.value ?? '',
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))

    const landingPages = (landingPagesData.rows ?? []).map((row: Row) => ({
      page:       row.dimensionValues?.[0]?.value ?? '',
      sessions:   Number(row.metricValues?.[0]?.value ?? 0),
      bounceRate: parseFloat((Number(row.metricValues?.[1]?.value ?? 0) * 100).toFixed(1)),
    }))

    const DAYS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']
    const dayOfWeek = (dayOfWeekData.rows ?? []).map((row: Row) => ({
      day:      DAYS[Number(row.dimensionValues?.[0]?.value ?? 0)] ?? '',
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))

    const hourOfDay = (hourData.rows ?? []).map((row: Row) => ({
      hour:     `${row.dimensionValues?.[0]?.value ?? '0'}u`,
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))

    return Response.json({
      totals, timeline: chartData,
      topPages, sources, devices,
      newVsReturning, countries, cities,
      landingPages, dayOfWeek, hourOfDay,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Analytics error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
