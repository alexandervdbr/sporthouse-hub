'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'
import {
  Users, Eye, MousePointerClick, Clock, TrendingUp, TrendingDown,
  Minus, UserPlus, Zap, CalendarDays,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────── */
interface Totals {
  sessions: number; users: number; pageviews: number
  bounceRate: number; avgDuration: number
  engagementRate: number; newUsers: number
  change: Record<string, number | null>
}
interface AnalyticsData {
  totals: Totals
  timeline: {
    date: string; sessions: number; users: number
    pageviews: number; newUsers: number
    prevSessions?: number; prevUsers?: number
    prevPageviews?: number; prevNewUsers?: number
  }[]
  topPages:       { page: string; views: number; users: number }[]
  sources:        { source: string; sessions: number }[]
  devices:        { device: string; sessions: number }[]
  newVsReturning: { type: string; sessions: number; users: number }[]
  countries:      { country: string; sessions: number }[]
  cities:         { city: string; sessions: number }[]
  landingPages:   { page: string; sessions: number; bounceRate: number }[]
  dayOfWeek:      { day: string; sessions: number }[]
  hourOfDay:      { hour: string; sessions: number }[]
}

/* ── Constants ──────────────────────────────────────────────────────── */
const DEVICE_COLORS: Record<string, string> = {
  desktop: '#3A913F', mobile: '#22d3ee', tablet: '#f59e0b',
}
const PALETTE = ['#3A913F', '#22d3ee', '#f59e0b', '#a78bfa', '#f87171', '#34d399', '#fb923c', '#818cf8']

const CARD: React.CSSProperties = {
  background: '#181818',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14,
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#111',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#e4e4e7',
  fontSize: 12,
  padding: '8px 12px',
}

const RANGES = [
  { label: '7 dagen',  value: '7' },
  { label: '30 dagen', value: '30' },
  { label: '90 dagen', value: '90' },
]

const METRICS = [
  { key: 'sessions',  prev: 'prevSessions',  label: 'Sessies' },
  { key: 'users',     prev: 'prevUsers',     label: 'Gebruikers' },
  { key: 'newUsers',  prev: 'prevNewUsers',  label: 'Nieuw' },
  { key: 'pageviews', prev: 'prevPageviews', label: 'Weergaven' },
] as const
type MetricKey = typeof METRICS[number]['key']

/* ── Helpers ────────────────────────────────────────────────────────── */
function formatDuration(s: number) {
  const m = Math.floor(s / 60); const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}
function formatDate(d: string) {
  if (!d || d.length !== 8) return d
  return `${d.slice(6, 8)}/${d.slice(4, 6)}`
}
function toYMD(date: Date) { return date.toISOString().slice(0, 10) }
function formatLabel(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Small components ───────────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-3 px-0.5">
      {children}
    </p>
  )
}

function Trend({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="text-[11px] text-zinc-700">—</span>
  const positive = inverse ? value < 0 : value > 0
  const neutral  = value === 0
  const bg    = neutral ? 'rgba(113,113,122,0.12)' : positive ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)'
  const color = neutral ? '#71717a' : positive ? '#4ade80' : '#f87171'
  const Icon  = neutral ? Minus : positive ? TrendingUp : TrendingDown
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: bg, color }}>
      <Icon size={10} />
      {neutral ? '0%' : `${value > 0 ? '+' : ''}${value}%`}
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, change, inverse = false }: {
  icon: React.ElementType; label: string; value: string
  change: number | null; inverse?: boolean
}) {
  return (
    <div style={{ ...CARD, padding: '18px 20px' }} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
        <Icon size={13} color="#3f3f46" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-[28px] font-bold leading-none text-zinc-100">{value}</span>
        <div className="mb-0.5"><Trend value={change} inverse={inverse} /></div>
      </div>
    </div>
  )
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div style={{ ...CARD, padding: '20px 22px' }} className={className}>
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">{title}</p>
      {children}
    </div>
  )
}

function RankedList({ rows, labelKey, valueKey }: {
  rows: Record<string, unknown>[]
  labelKey: string; valueKey: string
}) {
  const max = Math.max(...rows.map(r => Number(r[valueKey])), 1)
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const val = Number(r[valueKey])
        const pct = (val / max) * 100
        return (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-zinc-700 w-4 text-right flex-shrink-0">{i + 1}</span>
              <span className="text-xs text-zinc-400 truncate flex-1" title={String(r[labelKey])}>
                {String(r[labelKey]) || '(onbekend)'}
              </span>
              <span className="text-xs font-medium text-zinc-300 flex-shrink-0">{val.toLocaleString('nl-BE')}</span>
            </div>
            <div className="ml-6 h-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
            </div>
          </div>
        )
      })}
      {rows.length === 0 && <p className="text-xs text-zinc-700">Geen data beschikbaar</p>}
    </div>
  )
}

/* ── Main dashboard ─────────────────────────────────────────────────── */
export default function AnalyticsDashboard() {
  const [data,       setData]       = useState<AnalyticsData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [range,      setRange]      = useState('30')
  const [metric,     setMetric]     = useState<MetricKey>('sessions')
  const [showCustom, setShowCustom] = useState(false)

  const today      = toYMD(new Date())
  const default30  = toYMD(new Date(Date.now() - 30 * 86400000))
  const [customStart,  setCustomStart]  = useState(default30)
  const [customEnd,    setCustomEnd]    = useState(today)
  const [appliedStart, setAppliedStart] = useState('')
  const [appliedEnd,   setAppliedEnd]   = useState('')

  useEffect(() => {
    setLoading(true); setError(null)
    const url = appliedStart && appliedEnd
      ? `/api/analytics?start=${appliedStart}&end=${appliedEnd}`
      : `/api/analytics?range=${range}`
    fetch(url)
      .then(r => r.json())
      .then(json => { if (json.error) throw new Error(json.error); setData(json) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [range, appliedStart, appliedEnd])

  function applyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return
    setAppliedStart(customStart); setAppliedEnd(customEnd); setShowCustom(false)
  }
  function selectPreset(val: string) {
    setRange(val); setAppliedStart(''); setAppliedEnd(''); setShowCustom(false)
  }

  const prevKey     = METRICS.find(m => m.key === metric)?.prev ?? 'prevSessions'
  const deviceTotal = data?.devices.reduce((s, d) => s + d.sessions, 0) ?? 1
  const nvr         = data?.newVsReturning ?? []
  const nvrTotal    = nvr.reduce((s, r) => s + r.sessions, 0) || 1
  const newRow      = nvr.find(r => r.type === 'new')
  const returnRow   = nvr.find(r => r.type === 'returning')
  const newPct      = newRow    ? Math.round((newRow.sessions    / nvrTotal) * 100) : 0
  const returnPct   = returnRow ? Math.round((returnRow.sessions / nvrTotal) * 100) : 0

  return (
    <div className="h-full overflow-y-auto bg-[#111]">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">Website Analytics</h1>
            <p className="text-sm text-zinc-500 mt-0.5">sporthouse.be — vergelijking met vorige periode</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 p-1 rounded-lg" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.07)' }}>
                {RANGES.map(r => (
                  <button key={r.value} onClick={() => selectPreset(r.value)}
                    className="px-3 py-1.5 text-[11px] rounded-md transition-all font-medium"
                    style={!appliedStart && range === r.value
                      ? { background: '#3A913F', color: '#fff' }
                      : { color: '#52525b' }}>
                    {r.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowCustom(v => !v)}
                className="flex items-center gap-1.5 px-3 py-[7px] text-[11px] font-medium rounded-lg transition-all"
                style={appliedStart
                  ? { background: '#3A913F', color: '#fff', border: '1px solid transparent' }
                  : { background: '#1a1a1a', color: '#52525b', border: '1px solid rgba(255,255,255,0.07)' }}>
                <CalendarDays size={12} />
                {appliedStart ? `${formatLabel(appliedStart)} – ${formatLabel(appliedEnd)}` : 'Aangepast'}
              </button>
            </div>

            {showCustom && (
              <div className="flex items-end gap-3 p-4 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.09)' }}>
                {[
                  { label: 'Van', value: customStart, max: customEnd || today, min: undefined, set: setCustomStart },
                  { label: 'Tot', value: customEnd,   max: today,              min: customStart, set: setCustomEnd  },
                ].map(f => (
                  <div key={f.label} className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{f.label}</label>
                    <input type="date" value={f.value} max={f.max} min={f.min}
                      onChange={e => f.set(e.target.value)}
                      className="text-xs rounded-lg px-3 py-2 outline-none"
                      style={{ background: '#111', border: '1px solid rgba(255,255,255,0.09)', color: '#d4d4d8', colorScheme: 'dark' }} />
                  </div>
                ))}
                <button onClick={applyCustom}
                  disabled={!customStart || !customEnd || customStart > customEnd}
                  className="px-4 py-2 text-[11px] font-semibold rounded-lg transition-all disabled:opacity-30"
                  style={{ background: '#3A913F', color: '#fff' }}>
                  Toepassen
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl p-4 text-sm text-red-400" style={{ background: '#1a0a0a', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-8">
            <div className="grid grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: '#181818' }} />
              ))}
            </div>
            <div className="h-64 rounded-2xl animate-pulse" style={{ background: '#181818' }} />
          </div>
        ) : data ? (
          <>
            {/* ── KPI cards ──────────────────────────────────────── */}
            <div>
              <SectionLabel>Overzicht</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon={TrendingUp}       label="Sessies"          value={data.totals.sessions.toLocaleString('nl-BE')}     change={data.totals.change.sessions} />
                <KpiCard icon={Users}            label="Gebruikers"       value={data.totals.users.toLocaleString('nl-BE')}         change={data.totals.change.users} />
                <KpiCard icon={UserPlus}         label="Nieuwe bezoekers" value={data.totals.newUsers.toLocaleString('nl-BE')}      change={data.totals.change.newUsers} />
                <KpiCard icon={Eye}              label="Paginaweergaven"  value={data.totals.pageviews.toLocaleString('nl-BE')}     change={data.totals.change.pageviews} />
                <KpiCard icon={Zap}              label="Engagement"       value={`${data.totals.engagementRate}%`}                 change={data.totals.change.engagementRate} />
                <KpiCard icon={MousePointerClick} label="Bounce rate"     value={`${data.totals.bounceRate}%`}                     change={data.totals.change.bounceRate} inverse />
                <KpiCard icon={Clock}            label="Gem. sessieduur"  value={formatDuration(data.totals.avgDuration)}          change={data.totals.change.avgDuration} />

                {/* Nieuw vs terugkerend */}
                <div style={{ ...CARD, padding: '18px 20px' }} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Nieuw vs terugkerend</span>
                    <Users size={13} color="#3f3f46" />
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <span className="text-[28px] font-bold leading-none text-zinc-100">{newPct}%</span>
                      <span className="text-[11px] text-zinc-600 ml-1.5">nieuw</span>
                    </div>
                    <span className="text-[11px] text-zinc-700 mb-0.5">·</span>
                    <div>
                      <span className="text-[18px] font-semibold leading-none text-zinc-500">{returnPct}%</span>
                      <span className="text-[11px] text-zinc-700 ml-1">terug</span>
                    </div>
                  </div>
                  <div className="h-[3px] rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ width: `${newPct}%`, background: '#3A913F' }} className="h-full" />
                    <div style={{ width: `${returnPct}%`, background: '#22d3ee' }} className="h-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Timeline chart ─────────────────────────────────── */}
            <div>
              <SectionLabel>Trend over tijd</SectionLabel>
              <div style={{ ...CARD, padding: '20px 22px' }}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-5">
                    <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span className="w-4 h-0.5 rounded inline-block" style={{ background: '#3A913F' }} />
                      Deze periode
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-zinc-600">
                      <span className="w-4 h-0 rounded inline-block border-t border-dashed border-zinc-700" />
                      Vorige periode
                    </span>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {METRICS.map(m => (
                      <button key={m.key} onClick={() => setMetric(m.key)}
                        className="px-2.5 py-1 text-[11px] rounded-md transition-all font-medium"
                        style={metric === m.key
                          ? { background: 'rgba(58,145,63,0.18)', color: '#4ade80' }
                          : { color: '#52525b' }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={data.timeline} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#3A913F" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#3A913F" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tickFormatter={formatDate}
                      tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false}
                      interval={Math.max(0, Math.ceil(data.timeline.length / 8) - 1)} />
                    <YAxis tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(l: unknown) => formatDate(String(l ?? ''))}
                      formatter={(v: unknown, n: unknown) => [
                        Number(v).toLocaleString('nl-BE'),
                        n === prevKey ? 'Vorige periode' : 'Deze periode',
                      ]} />
                    <Area type="monotone" dataKey={metric}
                      stroke="#3A913F" strokeWidth={2}
                      fill="url(#gradCurrent)" dot={false}
                      activeDot={{ r: 4, fill: '#3A913F', strokeWidth: 0 }} />
                    <Area type="monotone" dataKey={prevKey}
                      stroke="#3f3f46" strokeWidth={1.5} strokeDasharray="4 4"
                      fill="none" dot={false} activeDot={{ r: 3, fill: '#71717a', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Verkeer ────────────────────────────────────────── */}
            <div>
              <SectionLabel>Verkeer</SectionLabel>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card title="Verkeersbronnen">
                  <RankedList rows={data.sources as Record<string, unknown>[]} labelKey="source" valueKey="sessions" />
                </Card>

                <Card title="Apparaten">
                  {data.devices.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={110}>
                        <PieChart>
                          <Pie data={data.devices} dataKey="sessions" cx="50%" cy="50%"
                            innerRadius={32} outerRadius={50} paddingAngle={3} startAngle={90} endAngle={-270}>
                            {data.devices.map((d, i) => <Cell key={i} fill={DEVICE_COLORS[d.device] ?? PALETTE[i]} />)}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-4 space-y-2">
                        {data.devices.map((d, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DEVICE_COLORS[d.device] ?? PALETTE[i] }} />
                            <span className="text-xs text-zinc-400 capitalize flex-1">{d.device}</span>
                            <span className="text-xs font-semibold text-zinc-300">{((d.sessions / deviceTotal) * 100).toFixed(0)}%</span>
                            <span className="text-[11px] text-zinc-600">{d.sessions.toLocaleString('nl-BE')}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <p className="text-xs text-zinc-700">Geen data</p>}
                </Card>

                <Card title="Nieuwe vs terugkerende bezoekers">
                  {nvr.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={110}>
                        <PieChart>
                          <Pie data={nvr} dataKey="sessions" cx="50%" cy="50%"
                            innerRadius={32} outerRadius={50} paddingAngle={3} startAngle={90} endAngle={-270}>
                            {nvr.map((r, i) => <Cell key={i} fill={r.type === 'new' ? '#3A913F' : '#22d3ee'} />)}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP_STYLE}
                            formatter={(v: unknown, n: unknown) => [Number(v).toLocaleString('nl-BE'), n === 'new' ? 'Nieuw' : 'Terugkerend']} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-4 space-y-2">
                        {nvr.map((r, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.type === 'new' ? '#3A913F' : '#22d3ee' }} />
                            <span className="text-xs text-zinc-400 flex-1">{r.type === 'new' ? 'Nieuw' : 'Terugkerend'}</span>
                            <span className="text-xs font-semibold text-zinc-300">{((r.sessions / nvrTotal) * 100).toFixed(0)}%</span>
                            <span className="text-[11px] text-zinc-600">{r.sessions.toLocaleString('nl-BE')}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <p className="text-xs text-zinc-700">Geen data</p>}
                </Card>
              </div>
            </div>

            {/* ── Geografie & pagina's ───────────────────────────── */}
            <div>
              <SectionLabel>Geografie &amp; pagina&apos;s</SectionLabel>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card title="Landen">
                  <RankedList rows={data.countries as Record<string, unknown>[]} labelKey="country" valueKey="sessions" />
                </Card>
                <Card title="Steden">
                  <RankedList rows={data.cities as Record<string, unknown>[]} labelKey="city" valueKey="sessions" />
                </Card>
                <Card title="Landingspagina's">
                  <div className="space-y-3">
                    {data.landingPages.map((p, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-zinc-700 w-4 text-right flex-shrink-0">{i + 1}</span>
                          <span className="text-xs text-zinc-400 truncate flex-1" title={p.page}>{p.page || '/'}</span>
                          <span className="text-[11px] text-zinc-600 flex-shrink-0">{p.bounceRate}%</span>
                          <span className="text-xs font-medium text-zinc-300 flex-shrink-0">{p.sessions.toLocaleString('nl-BE')}</span>
                        </div>
                        <div className="ml-6 h-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(p.sessions / (data.landingPages[0]?.sessions || 1)) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
                        </div>
                      </div>
                    ))}
                    {data.landingPages.length === 0 && <p className="text-xs text-zinc-700">Geen data</p>}
                  </div>
                </Card>
              </div>
            </div>

            {/* ── Populairste pagina's & patronen ───────────────── */}
            <div>
              <SectionLabel>Populairste pagina&apos;s &amp; patronen</SectionLabel>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card title="Populairste pagina's">
                  <RankedList rows={data.topPages as Record<string, unknown>[]} labelKey="page" valueKey="views" />
                </Card>
                <Card title="Dag van de week">
                  <ResponsiveContainer width="100%" height={185}>
                    <BarChart data={data.dayOfWeek} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="sessions" name="Sessies" fill="#3A913F" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card title="Uur van de dag">
                  <ResponsiveContainer width="100%" height={185}>
                    <BarChart data={data.hourOfDay} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} interval={3} />
                      <YAxis tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="sessions" name="Sessies" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
