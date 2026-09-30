'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { DUTCH_MONTHS, type Department } from '@/lib/planning-config'
import type { PlanningPreset } from '@/lib/planning-presets'
import { mergedStatusOptions } from './DayEditor'

interface StatRow { employee: string; value: string; count: number }

// A monthly (or yearly) tally per person, per status — "did Kenny take 15
// Verlof days this month" at a glance, without counting cells by hand. Not
// balance-vs-allotment (no entitlement number exists anywhere yet) — just a
// clean count of what's actually in the planning for the chosen period.
export default function PlanningStats({
  departments, archived, presets,
}: {
  departments: Department[]
  archived: { dept: string; emp: string }[]
  presets: PlanningPreset[]
}) {
  const [currentYear] = useState(() => new Date().getFullYear())
  const [currentMonth] = useState(() => new Date().getMonth() + 1)
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState<number | null>(currentMonth)
  const [rows, setRows] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ year: String(year) })
    if (month) params.set('month', String(month))
    fetch(`/api/planning/stats?${params}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.text().catch(() => '')
          throw new Error(`${r.status}${body ? `: ${body}` : ''}`)
        }
        return r.json()
      })
      .then(setRows)
      .catch(e => {
        console.error('Statistieken ophalen mislukt:', e)
        setError(`Kon statistieken niet laden (${e instanceof Error ? e.message : 'onbekende fout'}).`)
      })
      .finally(() => setLoading(false))
  }, [year, month])

  const options = useMemo(() => mergedStatusOptions(presets), [presets])

  // Keyed by the UPPERCASE value on purpose — every saved cell's value is
  // always uppercased (see DayEditor's handleSave), but a preset's display
  // name usually isn't ("Recup", "Verlof", "De Spor", ...). Comparing the
  // raw strings meant any preset whose name wasn't already all-caps (so,
  // most of them) silently showed 0 here regardless of real data —
  // "SHG"/"NB"/"PS" happened to look right purely by accident of already
  // being uppercase to begin with.
  const countsByEmployee = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const r of rows) {
      const byValue = m.get(r.employee) ?? new Map<string, number>()
      byValue.set(r.value.toUpperCase(), r.count)
      m.set(r.employee, byValue)
    }
    return m
  }, [rows])

  // Same roster shape as the rest of the app — one row per non-archived
  // person, grouped by department in the same order as the config.
  const groups = useMemo(
    () => departments
      .map(d => ({
        name: d.name,
        employees: d.employees.filter(emp => !archived.some(a => a.dept === d.name && a.emp === emp)),
      }))
      .filter(d => d.employees.length > 0),
    [departments, archived]
  )

  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month ?? 'jaar'}
          onChange={e => setMonth(e.target.value === 'jaar' ? null : Number(e.target.value))}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          <option value="jaar">Heel jaar</option>
          {DUTCH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-zinc-950 px-3 py-2 text-left font-semibold text-zinc-400 border-b border-r border-zinc-800 whitespace-nowrap">
                Naam
              </th>
              {options.map(opt => (
                <th
                  key={opt.name}
                  className="sticky top-0 z-10 bg-zinc-950 px-2 py-2 text-center font-medium border-b border-zinc-800 whitespace-nowrap"
                  style={{ color: opt.color }}
                >
                  {opt.name}
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-400 border-b border-l border-zinc-800 whitespace-nowrap">
                Totaal
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <Fragment key={g.name}>
                <tr>
                  <td
                    colSpan={options.length + 2}
                    className="sticky left-0 bg-zinc-900 px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"
                  >
                    {g.name}
                  </td>
                </tr>
                {g.employees.map(emp => {
                  const byValue = countsByEmployee.get(emp)
                  const total = byValue ? [...byValue.values()].reduce((a, b) => a + b, 0) : 0
                  return (
                    <tr key={emp} className="hover:bg-zinc-900/50">
                      <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-1.5 text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
                        {emp}
                      </td>
                      {options.map(opt => {
                        const count = byValue?.get(opt.name.toUpperCase()) ?? 0
                        return (
                          <td
                            key={opt.name}
                            className="px-2 py-1.5 text-center tabular-nums"
                            style={count > 0 ? { backgroundColor: `${opt.color}18`, color: opt.color, fontWeight: 600 } : { color: '#3f3f46' }}
                          >
                            {count > 0 ? count : '–'}
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 text-center font-semibold text-zinc-300 border-l border-zinc-800 tabular-nums">
                        {total || '–'}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={options.length + 2} className="py-8 text-center text-zinc-600">
                  Geen medewerkers om te tonen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
