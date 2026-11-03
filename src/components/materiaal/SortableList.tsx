'use client'

import type { ReactNode } from 'react'
import { DndContext, type DragEndEvent, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

// Een lijst die je met het greepje links in een andere volgorde sleept (ook
// met het toetsenbord). Geeft de nieuwe volgorde terug; opslaan doet de
// aanroeper.
export default function SortableList<T extends { id: string }>({
  items, onReorder, renderItem, disabled = false,
}: {
  items: T[]
  onReorder: (next: T[]) => void
  renderItem: (item: T) => ReactNode
  disabled?: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex(i => i.id === e.active.id)
    const to   = items.findIndex(i => i.id === e.over!.id)
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {items.map(item => (
            <Row key={item.id} id={item.id} disabled={disabled}>{renderItem(item)}</Row>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function Row({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`relative flex items-stretch rounded-xl border border-zinc-800 bg-zinc-900/60 ${isDragging ? 'shadow-xl opacity-90' : ''}`}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          aria-label="Verslepen"
          title="Sleep om de volgorde te wijzigen"
          className="flex-shrink-0 px-1.5 flex items-center text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical size={14} />
        </button>
      )}
      <div className={`flex-1 min-w-0 py-2 pr-2 ${disabled ? 'pl-3' : ''}`}>{children}</div>
    </div>
  )
}
