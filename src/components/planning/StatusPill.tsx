import { cellHalves, cellLabel, isHalfDay, type CellData } from '@/lib/planning-week'

// De gekleurde status in een cel, overal hetzelfde: raster, maand, gsm, link.
//
// Een halve dag zijn twee helften naast elkaar, voormiddag links en namiddag
// rechts, elk in zijn eigen kleur. Een hele dag ziet eruit zoals altijd.
//
// `className` is de vorm van het geheel (breedte, afronding, lettergrootte),
// `pad` de binnenruimte van elke helft. Ze staan apart omdat de padding bij
// een halve dag per helft moet, anders loopt de kleur van de ene helft niet
// tot de rand.
export default function StatusPill({
  cell, className = '', pad = 'px-1.5 py-1', mutedColor = '#a1a1aa', title, center = true,
}: {
  cell: CellData
  center?: boolean
  className?: string
  pad?: string
  mutedColor?: string
  // Standaard de status, met de notitie erbij als die er is.
  title?: string
}) {
  const label = cellLabel(cell)
  const tip = title ?? (cell.note ? `${label} — ${cell.note}` : label)
  const half = isHalfDay(cell)

  return (
    <span className={`${className} flex overflow-hidden`} title={tip}>
      {cellHalves(cell).map((h, i) => (
        <span
          key={i}
          className={`${pad} flex-1 min-w-0 truncate ${center || half ? 'text-center' : 'text-left'}`}
          style={{
            backgroundColor: h.bgColor ?? 'rgba(255,255,255,0.08)',
            color: h.bgColor ? '#fff' : mutedColor,
            // Een dunne naad tussen voormiddag en namiddag, ook als ze
            // toevallig dezelfde kleur hebben.
            borderLeft: half && i === 1 ? '1px solid rgba(0,0,0,0.45)' : undefined,
          }}
        >
          {h.value}
        </span>
      ))}
    </span>
  )
}
