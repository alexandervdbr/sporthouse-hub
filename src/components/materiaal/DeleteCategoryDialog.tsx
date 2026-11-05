'use client'

import { useEffect, useState } from 'react'
import { Package, X } from 'lucide-react'
import { Button, ErrorLine, Field, IconButton, Select, formGap } from '@/components/materiaal/ui'
import { categoryContents } from '@/lib/gear/inventory'
import type { GearCatalog, GearCategory } from '@/lib/gear/types'

// Een categorie verwijderen. Wat erin zit, gaat naar één andere categorie die
// je zelf kiest (niets is voorgekozen): de kits, de losse items en de
// onderdelen die in een kit elders zitten maar deze als eigen categorie
// hebben — die blijven in hun kit. Pas met een doel wordt de knop actief, en
// de knop zegt wat er gebeurt. Daarna kan het nog ongedaan (melding).

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function DeleteCategoryDialog({ category, catalog, onCancel, onDelete }: {
  category: GearCategory
  catalog: GearCatalog
  onCancel: () => void
  /** Gooit bij een fout; het venster blijft dan open en toont die. */
  onDelete: (intoId: string | null) => Promise<void>
}) {
  const c = categoryContents(catalog, category.id)
  const others = [...catalog.categories].filter(x => x.id !== category.id).sort((a, b) => a.sort_order - b.sort_order)
  const [into, setInto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Leeg volgens de catalogus, maar de database vond nog iets (een opgeheven kit): dan toch een doel.
  const [needsInto, setNeedsInto] = useState(false)
  const askInto = !c.empty || needsInto
  const intoName = others.find(x => x.id === into)?.name
  const label = !askInto ? 'Verwijderen'
    : !intoName ? 'Verwijderen en verplaatsen'
    : `Verwijderen en ${c.count ? `${c.count} ` : ''}verplaatsen naar ${intoName}`

  // Escape sluit alleen dit venster, niet ook het zijpaneel eronder.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  async function submit() {
    setBusy(true); setError('')
    try { await onDelete(askInto ? into : null) }
    catch (e) {
      const msg = e instanceof Error ? e.message : 'Verwijderen mislukt.'
      if (!askInto && msg.startsWith('Kies waar')) setNeedsInto(true)
      setError(msg)
      setBusy(false)
    }
  }

  const summary = [
    c.kits.length ? plural(c.kits.length, 'kit', 'kits') : null,
    c.loose.length ? plural(c.loose.length, 'los item', 'losse items') : null,
    c.partsElsewhere.length ? plural(c.partsElsewhere.length, 'onderdeel in een kit elders', 'onderdelen in kits elders') : null,
  ].filter(Boolean).join(', ')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="delcat-title"
        className="relative w-full max-w-md max-h-[92dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
          <h2 id="delcat-title" className="min-w-0 text-sm font-semibold text-zinc-100 truncate" title={category.name}>{category.name} verwijderen</h2>
          <IconButton label="Sluiten" onClick={onCancel}><X size={15} /></IconButton>
        </div>

        <div className={`px-5 py-4 overflow-y-auto ${formGap}`}>
          {others.length === 0 ? (
            <p className="text-sm text-zinc-300">Er moet minstens één categorie blijven. Maak eerst een andere categorie.</p>
          ) : c.empty && !needsInto ? (
            <p className="text-sm text-zinc-300">{category.name} is leeg. Verwijderen?</p>
          ) : (
            <>
              <p className="text-sm text-zinc-300">
                {summary ? <>Hierin: <strong className="font-medium text-zinc-100">{summary}</strong>.</> : 'Hierin zit nog iets dat niet meer zichtbaar is (een opgeheven kit).'}
                {' '}Dat gaat allemaal naar de categorie die je hieronder kiest.
              </p>
              {c.kits.length > 0 && (
                <Group title={plural(c.kits.length, 'kit', 'kits')}
                  names={c.kits.map(k => `${k.name} · ${plural(k.item_ids.length, 'onderdeel', 'onderdelen')}`)} icon />
              )}
              {c.loose.length > 0 && <Group title={plural(c.loose.length, 'los item', 'losse items')} names={c.loose.map(i => i.name)} />}
              {c.partsElsewhere.length > 0 && (
                <Group title={plural(c.partsElsewhere.length, 'onderdeel in een kit elders', 'onderdelen in kits elders')}
                  note="Die blijven in hun kit; alleen hun eigen categorie verandert."
                  names={c.partsElsewhere.map(i => {
                    const k = catalog.kits.find(x => x.item_ids.includes(i.id))
                    return k ? `${i.name} (in ${k.name})` : i.name
                  })} />
              )}
              <Field label="Verplaatsen naar">
                <Select value={into} onChange={e => setInto(e.target.value)} aria-required="true">
                  <option value="">Kies een categorie…</option>
                  {others.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
            </>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
          <Button variant="text" onClick={onCancel}>Annuleren</Button>
          {others.length > 0 && (
            <Button variant="destructive" onClick={submit} busy={busy} disabled={askInto && !into}
              className="!flex-shrink min-w-0" title={label}>
              <span className="truncate">{label}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Group({ title, names, note, icon }: { title: string; names: string[]; note?: string; icon?: boolean }) {
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-950/40">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-100">{title}</summary>
      <div className="px-3 pb-2">
        {note && <p className="mb-1 text-[11px] text-zinc-500">{note}</p>}
        <ul className="max-h-40 overflow-y-auto space-y-0.5">
          {names.map((n, i) => (
            <li key={i} className="flex items-center gap-1.5 min-w-0 text-xs text-zinc-400" title={n}>
              {icon && <Package size={11} className="flex-shrink-0 text-zinc-600" />}
              <span className="truncate">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
