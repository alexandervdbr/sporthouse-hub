'use client'

import { useEffect, useState } from 'react'
import { X, ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sortCategories, moveCategory, type CredentialCategory } from '@/lib/credential-categories'

// Categorieën beheren: toevoegen, hernoemen, ordenen, verwijderen. Mag
// iedereen die Wachtwoorden kan openen (RLS in migratie 0089). Verwijderen
// laat de logins staan; ze komen onder "Zonder categorie".

function friendlyError(error: { code?: string } | null): string | null {
  if (!error) return null
  if (error.code === '23505') return 'Die categorie bestaat al.'
  return 'Opslaan mislukt. Probeer opnieuw.'
}

function CategoryRow({
  cat,
  count,
  first,
  last,
  busy,
  onRename,
  onMove,
  onDelete,
}: {
  cat: CredentialCategory
  count: number
  first: boolean
  last: boolean
  busy: boolean
  onRename: (name: string) => Promise<boolean>
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(cat.name)
  const [confirming, setConfirming] = useState(false)

  function commit() {
    const trimmed = name.trim()
    if (!trimmed) { setName(cat.name); return }
    if (trimmed !== cat.name) onRename(trimmed).then(ok => { if (!ok) setName(cat.name) })
  }

  const iconButton = 'p-1.5 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors'

  if (confirming) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-lg bg-red-950/20 border border-red-900/40">
        <p className="text-sm text-zinc-300">
          “{cat.name}” verwijderen?{count > 0 && <span className="text-zinc-500"> {count === 1 ? '1 login gaat' : `${count} logins gaan`} naar Zonder categorie.</span>}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setConfirming(false)} className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-200">Annuleren</button>
          <button onClick={onDelete} disabled={busy} className="px-3 py-1 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white disabled:opacity-40">Verwijderen</button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        aria-label={`Naam van categorie ${cat.name}`}
        className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors"
      />
      <span className="w-8 text-right text-xs text-zinc-600 tabular-nums" title="Aantal logins">{count}</span>
      <button onClick={() => onMove(-1)} disabled={first || busy} aria-label={`${cat.name} omhoog`} title="Omhoog" className={iconButton}><ChevronUp size={15} /></button>
      <button onClick={() => onMove(1)} disabled={last || busy} aria-label={`${cat.name} omlaag`} title="Omlaag" className={iconButton}><ChevronDown size={15} /></button>
      <button onClick={() => setConfirming(true)} aria-label={`${cat.name} verwijderen`} title="Verwijderen" className="p-1.5 rounded text-zinc-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
    </li>
  )
}

export default function CategoriesModal({
  categories,
  counts,
  onClose,
  onChanged,
}: {
  categories: CredentialCategory[]
  // aantal zichtbare logins per categorie-id
  counts: Record<string, number>
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const supabase = createClient()
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ordered = sortCategories(categories)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(action: () => PromiseLike<{ error: { code?: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await action()
    if (error) console.error('Categorie aanpassen mislukt:', error)
    setError(friendlyError(error))
    await onChanged()
    setBusy(false)
    return !error
  }

  async function add() {
    const name = newName.trim()
    if (!name) return
    const nextOrder = ordered.length ? Math.max(...ordered.map(c => c.sort_order)) + 1 : 0
    if (await run(() => supabase.from('credential_categories').insert({ name, sort_order: nextOrder }))) setNewName('')
  }

  async function move(id: string, direction: -1 | 1) {
    const changes = moveCategory(categories, id, direction)
    await run(async () => {
      for (const c of changes) {
        const { error } = await supabase.from('credential_categories').update({ sort_order: c.sort_order }).eq('id', c.id)
        if (error) return { error }
      }
      return { error: null }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md max-h-[92vh] rounded-2xl shadow-2xl flex flex-col"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">Categorieën</h2>
          <button onClick={onClose} aria-label="Sluiten" title="Sluiten" className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 space-y-4">
          <p className="text-sm text-zinc-500">
            De volgorde hier is de volgorde op de pagina. Logins zonder categorie staan altijd onderaan.
          </p>

          {ordered.length === 0 ? (
            <p className="text-sm text-zinc-600">Nog geen categorieën.</p>
          ) : (
            <ul className="space-y-1.5">
              {ordered.map((cat, i) => (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  count={counts[cat.id] ?? 0}
                  first={i === 0}
                  last={i === ordered.length - 1}
                  busy={busy}
                  onRename={name => run(() => supabase.from('credential_categories').update({ name }).eq('id', cat.id))}
                  onMove={direction => move(cat.id, direction)}
                  onDelete={() => run(() => supabase.from('credential_categories').delete().eq('id', cat.id))}
                />
              ))}
            </ul>
          )}

          <form
            onSubmit={e => { e.preventDefault(); add() }}
            className="flex gap-2"
          >
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nieuwe categorie, bv. Social media"
              aria-label="Nieuwe categorie"
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#3A913F', color: '#fff' }}
            >
              <Plus size={14} /> Toevoegen
            </button>
          </form>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end px-6 pt-4 pb-6 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors">Klaar</button>
        </div>
      </div>
    </div>
  )
}
