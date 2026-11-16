'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useUrlState } from '../internal/useUrlState'
import { makeData, type AStatus, type PAssignment, type PEvent, type PFreelancer } from './data'

// Toestand van het prototype: alles in het geheugen van de browser.
// Navigatie staat in de URL (?v=…&id=…&a=…), zodat de terugknop werkt.

export type View = 'lijst' | 'opdrachten' | 'profiel' | 'nieuw'
export interface Draft { title: string; briefing: string; discipline: string; client: string; deadline: string; files: string[]; freelancerId: string }

interface Store {
  freelancers: PFreelancer[]; assignments: PAssignment[]
  view: View; profileId: string | null; openId: string | null; preset: string | null
  go: (v: View, extra?: Record<string, string | null>) => void
  open: (id: string | null) => void
  reveal: { name: string; url: string; pin: string } | null; setReveal: (r: Store['reveal']) => void
  toast: string; say: (s: string) => void
  updateFreelancer: (id: string, patch: Partial<PFreelancer>) => void
  addFreelancer: (f: Pick<PFreelancer, 'name' | 'disciplines' | 'phone' | 'email'>) => string
  updateAssignment: (id: string, patch: Partial<PAssignment>) => void
  move: (id: string, to: AStatus, ev: Omit<PEvent, 'at'>, patch?: Partial<PAssignment>) => void
  share: (id: string, freelancerId?: string) => void
  remove: (id: string) => void
  create: (d: Draft, share: boolean, failFile: boolean) => string
}

const Ctx = createContext<Store | null>(null)
export const useProto = () => useContext(Ctx)!

const pin = () => String(1000 + Math.floor(Math.random() * 9000))

export function ProtoProvider({ children }: { children: ReactNode }) {
  const { params, set } = useUrlState()
  const [data, setData] = useState(makeData)
  const [reveal, setReveal] = useState<Store['reveal']>(null)
  const [toast, setToast] = useState('')

  const say = useCallback((s: string) => { setToast(s); setTimeout(() => setToast(t => (t === s ? '' : t)), 3500) }, [])
  const updateAssignment = useCallback((id: string, patch: Partial<PAssignment>) =>
    setData(d => ({ ...d, assignments: d.assignments.map(a => (a.id === id ? { ...a, ...patch } : a)) })), [])
  const updateFreelancer = useCallback((id: string, patch: Partial<PFreelancer>) =>
    setData(d => ({ ...d, freelancers: d.freelancers.map(f => (f.id === id ? { ...f, ...patch } : f)) })), [])

  const move = useCallback((id: string, to: AStatus, ev: Omit<PEvent, 'at'>, patch: Partial<PAssignment> = {}) =>
    setData(d => ({ ...d, assignments: d.assignments.map(a => a.id !== id ? a : {
      ...a, ...patch, status: to, changedAt: new Date().toISOString(), events: [{ ...ev, at: new Date().toISOString() }, ...a.events],
    }) })), [])

  // Delen. Heeft de freelancer nog geen link, dan verschijnen link en pincode één keer.
  const share = useCallback((id: string, freelancerId?: string) => {
    // Een net aangemaakte opdracht zit nog niet in `data`: dan komt freelancerId mee.
    const fid = freelancerId ?? data.assignments.find(x => x.id === id)?.freelancerId
    const f = data.freelancers.find(x => x.id === fid)
    if (!f) return
    move(id, 'gedeeld', { who: 'team', text: 'Gedeeld' }, { pending: null, seen: false })
    if (!f.link.active) {
      updateFreelancer(f.id, { link: { active: true, lastOpened: null } })
      setReveal({ name: f.name, url: `https://hub.sporthousegroup.com/f#voorbeeld-${f.id}`, pin: pin() })
    } else say(`Staat nu op de link van ${f.name.split(' ')[0]}. Stuur even een seintje — de app mailt niet.`)
  }, [data, move, updateFreelancer, say])

  // Nieuwe opdracht: eerst bewaren, dan bijlagen, dan pas delen. Lukt een
  // bijlage niet, dan wordt er niet gedeeld en ga je verder in het paneel.
  const create = useCallback((d: Draft, doShare: boolean, failFile: boolean) => {
    const id = `n${Date.now()}`
    const now = new Date().toISOString()
    const ok = failFile ? d.files.slice(0, -1) : d.files
    const failed = failFile ? d.files.slice(-1) : []
    const a: PAssignment = {
      id, title: d.title, freelancerId: d.freelancerId, client: d.client, discipline: d.discipline, briefing: d.briefing,
      deadline: d.deadline || null, status: 'concept', changedAt: now, seen: false, review: null,
      files: ok.map(name => ({ name, size: '1,4 MB', by: 'team' as const, at: now })),
      events: [{ at: now, who: 'team', text: 'Aangemaakt' }],
      pending: failed.length ? { failedFiles: failed, share: doShare } : null,
    }
    setData(s => ({ ...s, assignments: [a, ...s.assignments] }))
    return id
  }, [])

  const remove = useCallback((id: string) => setData(d => ({ ...d, assignments: d.assignments.filter(a => a.id !== id) })), [])

  const addFreelancer = useCallback((f: Pick<PFreelancer, 'name' | 'disciplines' | 'phone' | 'email'>) => {
    const id = `nf${Date.now()}`
    setData(d => ({ ...d, freelancers: [...d.freelancers, {
      ...f, id, status: 'kandidaat', teamRating: null, teamNote: '', availability: 'beschikbaar', availableFrom: null, availabilityBy: 'team',
      rate: '', notes: '', portfolio: [], link: { active: false, lastOpened: null },
    }] }))
    return id
  }, [])

  const v = params.get('v')
  const view: View = v === 'opdrachten' || v === 'profiel' || v === 'nieuw' ? v : 'lijst'
  const go = useCallback((to: View, extra: Record<string, string | null> = {}) =>
    set({ v: to === 'lijst' ? null : to, id: null, a: null, f: null, ...extra }, 'push'), [set])
  const open = useCallback((id: string | null) => set({ a: id }, 'push'), [set])

  const value = useMemo<Store>(() => ({
    ...data, view, profileId: params.get('id'), openId: params.get('a'), preset: params.get('f'),
    go, open, reveal, setReveal, toast, say, updateFreelancer, addFreelancer, updateAssignment, move, share, remove, create,
  }), [data, view, params, go, open, reveal, toast, say, updateFreelancer, addFreelancer, updateAssignment, move, share, remove, create])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
