'use client'

import { useEffect, useRef } from 'react'
import { getMonthWeeks, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import WeekGrid from './WeekGrid'

interface Target { wd: WeekDay; dept: string; emp: string }

// Desktop-only "Mijn maand": the whole month as full calendar weeks stacked
// on top of each other. Each week is a real WeekGrid (embedded, one shared
// scroll container around them) — same drag-to-paint, copy/paste and hover
// affordances as Mijn week, instead of a stripped-down click-only grid.
// Auto-scrolls to the current week on first load. Mobile keeps the old
// compact day-grid (MyMonthCalendar) — a 7-wide spacious row doesn't fit a
// phone.
export default function MyMonthWeeks({
  year, month, dept, emp, data, readOnly, presets, onApply, onClear,
}: {
  year: number
  month: number
  dept: string
  emp: string
  data: PlanningWeekData
  readOnly: boolean
  presets: PlanningPreset[]
  onApply: (targets: Target[], value: CellData) => void
  onClear: (targets: Target[]) => void
}) {
  const weeks = getMonthWeeks(year, month)
  const todayRowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: 'center' })
  }, [year, month])

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-zinc-800">
      {weeks.map((week, wi) => {
        const containsToday = week.some(wd => wd.isToday)
        return (
          <div key={wi} ref={containsToday ? todayRowRef : undefined}>
            <WeekGrid
              week={week}
              people={[{ dept, emp }]}
              data={data}
              canEditCol={() => !readOnly}
              presets={presets}
              onApply={onApply}
              onClear={onClear}
              groupHeaders={false}
              showNameColumn={false}
              variant="spacious"
              embedded
              dimDay={wd => wd.month !== month}
            />
          </div>
        )
      })}
    </div>
  )
}
