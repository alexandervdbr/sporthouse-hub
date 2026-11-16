'use client'

import { useState, useSyncExternalStore } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/materiaal/ui'
import { TabBar } from '../internal/ui'
import LinkReveal from '../internal/LinkReveal'
import PageScroll from '../internal/PageScroll'
import { ProtoProvider, useProto } from './store'
import List from './List'
import Board from './Board'
import Profile from './Profile'
import Detail from './Detail'
import NewAssignment from './NewAssignment'
import Changes from './Changes'

// /freelancers/prototype — klikbaar voorstel voor de herwerkte schermen,
// alleen voor admins, met nepdata. Niets wordt bewaard.
const noop = () => () => {}

export default function Prototype() {
  // Pas na het laden tekenen: de nepdata rekent met "nu", zo verschillen server en browser niet.
  const ready = useSyncExternalStore(noop, () => true, () => false)
  if (!ready) return null
  return <ProtoProvider><Shell /></ProtoProvider>
}

function Shell() {
  const { view, profileId, openId, go, reveal, setReveal, toast } = useProto()
  const embed = useSearchParams().get('embed') === '1'
  const pathname = usePathname()
  const [changes, setChanges] = useState(false)
  const [phone, setPhone] = useState(false)
  const top = view === 'lijst' || view === 'opdrachten'

  return (
    <PageScroll>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 px-3 py-2 text-sm text-violet-200">
          <span className="flex-1">Prototype met nepdata. Niets wordt bewaard; herladen zet alles terug.</span>
          <Button size="sm" onClick={() => setChanges(true)}>Wat verandert er?</Button>
          {!embed && <Button size="sm" className="hidden md:inline-flex" onClick={() => setPhone(true)}><Smartphone size={13} /> Gsm-weergave</Button>}
        </div>

        {top && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full max-w-xs">
              <TabBar value={view} onChange={v => go(v)} tabs={[{ key: 'lijst', label: 'Freelancers' }, { key: 'opdrachten', label: 'Opdrachten' }]} />
            </div>
            <Button variant="primary" className="hidden !h-10 md:inline-flex" onClick={() => go('nieuw')}>+ Nieuwe opdracht</Button>
          </div>
        )}

        {view === 'lijst' && <List />}
        {view === 'opdrachten' && <Board />}
        {view === 'profiel' && profileId && <Profile id={profileId} />}
        {view === 'nieuw' && <NewAssignment />}

        {/* Gsm: hoofdknop onderaan op de twee overzichten */}
        {top && <div className="h-20 md:hidden" />}
        {top && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <Button variant="primary" className="!h-12 w-full" onClick={() => go('nieuw')}>+ Nieuwe opdracht</Button>
          </div>
        )}
      </div>

      {openId && <Detail id={openId} />}
      {reveal && <LinkReveal name={reveal.name} url={reveal.url} pin={reveal.pin} onClose={() => setReveal(null)} />}
      {changes && <Changes onClose={() => setChanges(false)} />}
      {toast && <div role="status" className="fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-2xl md:bottom-6">{toast}</div>}
      {phone && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setPhone(false)}>
          <div className="flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
            <iframe title="Gsm-weergave" src={`${pathname}?embed=1`} className="h-[min(844px,85dvh)] w-[390px] rounded-[2rem] border-8 border-zinc-800 bg-zinc-950" />
            <Button size="sm" onClick={() => setPhone(false)}>Sluiten</Button>
          </div>
        </div>
      )}
    </PageScroll>
  )
}
