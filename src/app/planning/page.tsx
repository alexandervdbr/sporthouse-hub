import PlanningGrid from '@/components/planning/PlanningGrid'

export default function PlanningPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-8 pt-8 pb-5 border-b border-zinc-900">
        <h2 className="text-base font-semibold text-sh-grey mb-1">Planning</h2>
        <p className="text-sm text-zinc-500">Maandoverzicht van aanwezigheden per werknemer en afdeling.</p>
      </div>
      <div className="flex-1 min-h-0 p-4 sm:p-8">
        <PlanningGrid />
      </div>
    </div>
  )
}
