'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, ChevronDown, ChevronUp, BarChart3, Users, Package, TrendingUp } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EquipmentStat {
  name: string
  category: string
  count: number
}

interface UserStat {
  user: string
  total: number
  byEquipment: { name: string; count: number }[]
}

interface DowStat {
  label: string
  count: number
}

interface MonthStat {
  month: string
  count: number
}

interface StatsData {
  totalReservations: number
  uniqueUsers: number
  equipmentStats: EquipmentStat[]
  userStats: UserStat[]
  dayOfWeekStats: DowStat[]
  monthlyStats: MonthStat[]
}

// ─── Category colours (same as planner) ──────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'SET 1 VIDEO':               '#3A913F',
  'SET 2 VIDEO':               '#34a33a',
  'SET 3 VIDEO':               '#2eb535',
  'SET 4 VIDEO':               '#28c730',
  'SET 5 VIDEO':               '#22d92b',
  'FOTO':                      '#facc15',
  'EXTRA LENZEN':              '#0ea5e9',
  'Tentacle':                  '#a855f7',
  'Sennheiser':                '#c084fc',
  'LICHT':                     '#f59e0b',
  'GoPro':                     '#22d3ee',
  'Drone':                     '#38bdf8',
  'Statieven':                 '#64748b',
  'Extra':                     '#71717a',
  'Ballieman + mobiele studio':'#ec4899',
}

function catColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? '#3A913F'
}

// ─── Range options ────────────────────────────────────────────────────────────

const RANGES = [
  { label: 'Alles',            value: 'all' },
  { label: 'Dit jaar',         value: 'year' },
  { label: 'Laatste 6 maanden',value: '6m' },
  { label: 'Deze maand',       value: 'month' },
]

function getDateRange(range: string): { start?: string; end?: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start: iso(start), end: iso(end) }
  }
  if (range === '6m') {
    const start = new Date(now)
    start.setMonth(start.getMonth() - 6)
    return { start: iso(start), end: iso(now) }
  }
  if (range === 'year') {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
  }
  return {}
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div
      className="relative rounded-xl p-5 overflow-hidden"
      style={{
        background: 'rgba(22,22,22,0.97)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-kurdis)' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-500 mt-1 truncate">{sub}</p>}
    </div>
  )
}

// ─── Horizontal bar ───────────────────────────────────────────────────────────

function Bar({ count, max, color }: { count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EquipmentStats() {
  const [range,    setRange]    = useState('all')
  const [data,     setData]     = useState<StatsData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    const { start, end } = getDateRange(range)
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end)   params.set('end', end)
    try {
      const r = await fetch(`/api/reservations/stats?${params}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
    } catch (e) {
      console.error('Statistieken laden mislukt:', e)
      setLoadError(true)
    }
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const maxEquip = data ? Math.max(...data.equipmentStats.map(e => e.count), 1) : 1
  const maxUser  = data ? Math.max(...data.userStats.map(u => u.total), 1) : 1
  const maxDow   = data ? Math.max(...data.dayOfWeekStats.map(d => d.count), 1) : 1
  const maxMonth = data ? Math.max(...data.monthlyStats.map(m => m.count), 1) : 1

  const DUTCH_MONTHS: Record<string, string> = {
    '01':'Jan','02':'Feb','03':'Mrt','04':'Apr','05':'Mei','06':'Jun',
    '07':'Jul','08':'Aug','09':'Sep','10':'Okt','11':'Nov','12':'Dec',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Link
            href="/equipment"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeft size={14} />
            Planning
          </Link>
          <span className="text-zinc-700">/</span>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Statistieken</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Materiaalgebruik & reserveringsdata</p>
          </div>
        </div>

        {/* Range tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
              style={range === r.value
                ? { background: '#3A913F', color: '#fff' }
                : { color: '#71717a' }
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-zinc-600" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-zinc-500">Statistieken laden mislukt.</p>
            <button onClick={load} className="text-xs font-medium text-blue-400 hover:text-blue-300">Opnieuw proberen</button>
          </div>
        ) : !data ? null : (
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Totaal reserveringen"
                value={data.totalReservations}
                icon={BarChart3}
                color="#3A913F"
              />
              <SummaryCard
                label="Gebruikers"
                value={data.uniqueUsers}
                icon={Users}
                color="#3b82f6"
              />
              <SummaryCard
                label="Meest gebruikt"
                value={data.equipmentStats[0]?.count ?? 0}
                sub={data.equipmentStats[0]?.name ?? '—'}
                icon={TrendingUp}
                color="#f59e0b"
              />
              <SummaryCard
                label="Minst gebruikt"
                value={data.equipmentStats[data.equipmentStats.length - 1]?.count ?? 0}
                sub={data.equipmentStats[data.equipmentStats.length - 1]?.name ?? '—'}
                icon={Package}
                color="#71717a"
              />
            </div>

            {/* Main grid: Equipment ranking + User breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Equipment ranking */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <div className="px-5 py-4 border-b border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-100">Materiaalgebruik</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Gesorteerd op aantal reserveringen</p>
                </div>
                <div className="p-4 space-y-2 max-h-[480px] overflow-y-auto">
                  {data.equipmentStats.length === 0 ? (
                    <p className="text-sm text-zinc-600 py-8 text-center">Nog geen data</p>
                  ) : data.equipmentStats.map((item, i) => {
                    const color = catColor(item.category)
                    return (
                      <div key={item.name} className="flex items-center gap-3 group">
                        <span className="text-[10px] text-zinc-600 tabular-nums w-4 flex-shrink-0 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-xs text-zinc-300 truncate">{item.name}</span>
                            </div>
                            <span className="text-xs font-semibold text-zinc-300 tabular-nums ml-2 flex-shrink-0">{item.count}×</span>
                          </div>
                          <Bar count={item.count} max={maxEquip} color={color} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* User breakdown */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <div className="px-5 py-4 border-b border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-100">Per gebruiker</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Klik op een naam voor details</p>
                </div>
                <div className="p-4 space-y-1.5 max-h-[480px] overflow-y-auto">
                  {data.userStats.length === 0 ? (
                    <p className="text-sm text-zinc-600 py-8 text-center">Nog geen data</p>
                  ) : data.userStats.map(u => {
                    const isOpen = expanded === u.user
                    return (
                      <div key={u.user} className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                        {/* Row header */}
                        <button
                          onClick={() => setExpanded(isOpen ? null : u.user)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                        >
                          {/* Avatar */}
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                            style={{ background: 'rgba(58,145,63,0.2)', color: '#3A913F' }}>
                            {u.user.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-zinc-200 font-medium truncate">{u.user}</span>
                              <span className="text-xs font-semibold text-zinc-400 tabular-nums ml-2">{u.total}×</span>
                            </div>
                            <Bar count={u.total} max={maxUser} color="#3A913F" />
                          </div>
                          {isOpen
                            ? <ChevronUp size={13} className="text-zinc-600 flex-shrink-0" />
                            : <ChevronDown size={13} className="text-zinc-600 flex-shrink-0" />
                          }
                        </button>

                        {/* Expanded: per-equipment breakdown */}
                        {isOpen && (
                          <div className="px-3 pb-3 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="text-[10px] text-zinc-600 uppercase tracking-widest pt-2 mb-2">Gereserveerde materialen</p>
                            {u.byEquipment.map(item => {
                              const color = catColor(
                                data.equipmentStats.find(e => e.name === item.name)?.category ?? ''
                              )
                              return (
                                <div key={item.name} className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                  <span className="text-xs text-zinc-400 flex-1 truncate">{item.name}</span>
                                  <span className="text-xs font-semibold text-zinc-300 tabular-nums">{item.count}×</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Bottom row: Day of week + Monthly trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Day of week */}
              <div className="rounded-xl p-5" style={{ background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <h2 className="text-sm font-semibold text-zinc-100 mb-1">Populairste dagen</h2>
                <p className="text-xs text-zinc-500 mb-5">Totaal reserveringen per dag van de week</p>
                <div className="flex items-end gap-3 h-32">
                  {data.dayOfWeekStats.map(d => {
                    const pct = maxDow > 0 ? (d.count / maxDow) * 100 : 0
                    const isWeekend = d.label === 'Za' || d.label === 'Zo'
                    return (
                      <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500 tabular-nums">{d.count || ''}</span>
                        <div className="w-full rounded-t-md transition-all duration-500 relative overflow-hidden"
                          style={{
                            height: `${Math.max(pct, 4)}%`,
                            background: isWeekend
                              ? 'rgba(255,255,255,0.06)'
                              : `linear-gradient(180deg, #4ade80 0%, #3A913F 100%)`,
                            minHeight: 4,
                          }}>
                        </div>
                        <span className={`text-[11px] font-medium ${isWeekend ? 'text-zinc-600' : 'text-zinc-400'}`}>
                          {d.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Monthly trend */}
              <div className="rounded-xl p-5" style={{ background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <h2 className="text-sm font-semibold text-zinc-100 mb-1">Maandelijkse trend</h2>
                <p className="text-xs text-zinc-500 mb-5">Aantal reserveringen per maand</p>
                {data.monthlyStats.length === 0 ? (
                  <p className="text-sm text-zinc-600 text-center py-10">Nog geen data</p>
                ) : (
                  <div className="flex items-end gap-2 h-32">
                    {data.monthlyStats.map(m => {
                      const pct = maxMonth > 0 ? (m.count / maxMonth) * 100 : 0
                      const [year, monthNum] = m.month.split('-')
                      const label = `${DUTCH_MONTHS[monthNum] ?? monthNum} '${year.slice(2)}`
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-zinc-500 tabular-nums">{m.count}</span>
                          <div className="w-full rounded-t-md"
                            style={{
                              height: `${Math.max(pct, 4)}%`,
                              background: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)',
                              minHeight: 4,
                            }} />
                          <span className="text-[10px] text-zinc-500 truncate w-full text-center">{label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
