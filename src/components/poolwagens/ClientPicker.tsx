'use client'

import { useId, useRef, useState } from 'react'
import { Check, ChevronDown, PenLine, X } from 'lucide-react'
import { inputCls } from './ui'
import type { ClientRef } from '@/lib/poolwagens/types'

// Klant kiezen in het reserveerformulier. Een <datalist> toont op iOS alleen
// een suggestie boven het toetsenbord en op desktop pas iets na typen; dit is
// een gewone keuzelijst: bij het aantikken staan alle klanten er, typen
// filtert, en een naam die niet in de lijst staat kies je bewust als vrije
// naam. De lijst staat in de flow (niet zwevend), zodat ze in het dialoog-
// venster nooit wordt afgeknipt en op een gsm gewoon meescrollt.
//
// De waarde blijft tekst: het formulier koppelt aan een klant als de naam er
// exact op past, net als voorheen.

/** Zoveel klanten tonen we tegelijk; typen verfijnt de rest. */
const MAX_SHOWN = 50

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

export default function ClientPicker({ clients, value, onChange, matched }: {
  clients: ClientRef[]
  value: string
  onChange: (v: string) => void
  /** De klant uit de lijst waar de tekst exact op past, of null. */
  matched: ClientRef | null
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const typed = value.trim()
  // Staat er al een gekozen klant, dan opent de lijst volledig (om te wisselen).
  const query = matched ? '' : norm(typed)
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  const hits = query ? sorted.filter(c => norm(c.name).includes(query)) : sorted
  const shown = hits.slice(0, MAX_SHOWN)
  const freeOption = !!typed && !matched
  const count = shown.length + (freeOption ? 1 : 0)

  function pick(v: string) {
    onChange(v)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else setActive(a => Math.min(a + 1, count - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && count > 0) {
      e.preventDefault()
      pick(active < shown.length ? shown[active].name : typed)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  const optionCls = (i: number) =>
    `w-full flex items-center gap-2 px-3 min-h-11 md:min-h-9 text-left text-sm ${i === active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'}`

  return (
    <div>
      <div className="relative">
        <input ref={inputRef} className={`${inputCls} pr-16`} value={value} maxLength={200} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && count > 0 ? `${listId}-${active}` : undefined}
          placeholder="Kies een klant of typ een naam"
          onFocus={() => { setOpen(true); setActive(0) }}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={e => { onChange(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={onKeyDown} />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {matched && <Check size={14} className="text-emerald-400 mr-1" aria-label="Gekoppeld aan een klant" />}
          {value ? (
            <button type="button" aria-label="Klant wissen" onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(''); setOpen(true); setActive(0); inputRef.current?.focus() }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60"><X size={14} /></button>
          ) : (
            <button type="button" aria-label="Klanten tonen" tabIndex={-1} onMouseDown={e => e.preventDefault()}
              onClick={() => { setOpen(o => !o); inputRef.current?.focus() }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200"><ChevronDown size={14} /></button>
          )}
        </div>
      </div>

      {open && (
        <ul id={listId} role="listbox" aria-label="Klanten"
          // Een tik op de lijst mag het veld niet laten vervagen (anders sluit ze vóór de klik).
          onMouseDown={e => e.preventDefault()}
          className="mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {shown.map((c, i) => (
            <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={matched?.id === c.id}>
              <button type="button" tabIndex={-1} onClick={() => pick(c.name)} onMouseEnter={() => setActive(i)} className={optionCls(i)}>
                <span className="flex-1 min-w-0 truncate">{c.name}</span>
                {matched?.id === c.id && <Check size={14} className="text-emerald-400 flex-shrink-0" />}
              </button>
            </li>
          ))}
          {hits.length > shown.length && (
            <li className="px-3 py-1.5 text-[11px] text-zinc-500">Nog {hits.length - shown.length} klanten — typ om te verfijnen.</li>
          )}
          {freeOption && (
            <li id={`${listId}-${shown.length}`} role="option" aria-selected={false} className={shown.length ? 'border-t border-zinc-800 mt-1 pt-1' : ''}>
              <button type="button" tabIndex={-1} onClick={() => pick(typed)} onMouseEnter={() => setActive(shown.length)} className={optionCls(shown.length)}>
                <PenLine size={14} className="text-zinc-500 flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate">‘{typed}’ gebruiken als vrije naam</span>
              </button>
            </li>
          )}
          {count === 0 && <li className="px-3 py-2 text-sm text-zinc-500">Nog geen klanten in de hub.</li>}
        </ul>
      )}

      {typed && !open && (
        <p className="mt-1 text-[11px] text-zinc-500">
          {matched ? 'Gekoppeld aan deze klant in de hub.' : 'Staat niet in de klantenlijst: wordt bewaard zoals getypt.'}
        </p>
      )}
    </div>
  )
}
