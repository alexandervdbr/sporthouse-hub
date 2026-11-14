'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Modal } from '@/components/poolwagens/ui'
import { Button, ErrorLine, buttonCls } from '@/components/materiaal/ui'
import { internalApi } from '../api'
import { useUrlState } from '../useUrlState'
import { TabBar } from '../ui'
import type { Discipline, Freelancer } from '../types'
import PageScroll from '../PageScroll'
import AssignmentPanel from '../assignments/AssignmentPanel'
import ProfileHeader from './ProfileHeader'
import ProfileOverview from './ProfileOverview'
import ProfileAssignments from './ProfileAssignments'
import LinkTab from './LinkTab'

// /freelancers/[id]. Desktop: links de profielinfo (sticky), rechts de
// tabbladen. Gsm: één kolom, tabbladen als segmented control, en een vaste
// knop "Nieuwe opdracht" onderaan. Tabblad en geopende opdracht in de URL.
type Tab = 'overzicht' | 'opdrachten' | 'link'

export default function ProfilePage({ id, canManage }: { id: string; canManage: boolean }) {
  const { params, set } = useUrlState()
  const tab = (['opdrachten', 'link'].includes(params.get('tab') ?? '') ? params.get('tab') : 'overzicht') as Tab
  const openId = params.get('opdracht')
  const [f, setF] = useState<Freelancer | null>(null)
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [error, setError] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([internalApi.get(id), internalApi.disciplines()])
      .then(([fr, d]) => { if (alive) { setF(fr); setDisciplines(d) } })
      .catch(err => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [id])
  const labels = useMemo(() => Object.fromEntries(disciplines.map(d => [d.key, d.label])), [disciplines])

  if (error && !f) return <PageScroll><div className="p-6"><ErrorLine>{error}</ErrorLine></div></PageScroll>
  if (!f) return <PageScroll><Loader2 className="mx-auto mt-16 animate-spin text-zinc-500" aria-label="Laden" /></PageScroll>

  const tabs: { key: Tab; label: string }[] = [{ key: 'overzicht', label: 'Overzicht' }, { key: 'opdrachten', label: 'Opdrachten' }]
  if (canManage) tabs.push({ key: 'link', label: 'Link & pincode' })

  async function toggleArchive() {
    try { setF(await internalApi.archive(f!.id, !f!.archived_at)); setArchiving(false) } catch (err) { setError((err as Error).message) }
  }

  return (
    <PageScroll>
      <div className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 md:pb-8">
        <Link href="/freelancers" className="-ml-2 mb-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={16} /> Freelancers</Link>
        <div className="grid gap-6 md:grid-cols-[minmax(260px,320px)_1fr]">
          <aside className="md:sticky md:top-5 md:self-start">
            <ProfileHeader f={f} labels={labels} canManage={canManage} onChange={setF} />
            {canManage && (
              <button type="button" onClick={() => setArchiving(true)} className="mt-6 min-h-[44px] text-sm text-zinc-500 hover:text-zinc-300">
                {f.archived_at ? 'Terugzetten uit het archief' : 'Archiveren'}
              </button>
            )}
          </aside>
          <div className="min-w-0 space-y-4">
            <TabBar value={tab} tabs={tabs} onChange={t => set({ tab: t === 'overzicht' ? null : t }, 'push')} />
            <ErrorLine>{error}</ErrorLine>
            {tab === 'overzicht' && <ProfileOverview key={f.id} f={f} disciplines={disciplines} canManage={canManage} onChange={setF} />}
            {tab === 'opdrachten' && <ProfileAssignments freelancerId={f.id} canManage={canManage} reloadKey={reloadKey} onOpen={a => set({ opdracht: a }, 'push')} />}
            {tab === 'link' && canManage && <LinkTab f={f} />}
          </div>
        </div>
      </div>

      {canManage && !f.archived_at && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Link href={`/freelancers/opdrachten/nieuw?freelancer=${f.id}`} className={`${buttonCls('primary')} !h-12 w-full !text-base`}>Nieuwe opdracht</Link>
        </div>
      )}

      {openId && <AssignmentPanel id={openId} canManage={canManage} onClose={() => set({ opdracht: null }, 'push')} onChanged={() => setReloadKey(k => k + 1)} />}
      {archiving && (
        <Modal title={f.archived_at ? 'Terugzetten' : 'Archiveren'} onClose={() => setArchiving(false)} footer={<>
          <Button onClick={() => setArchiving(false)}>Annuleren</Button>
          <Button variant="primary" data-primary onClick={toggleArchive}>{f.archived_at ? 'Terugzetten' : 'Archiveren'}</Button>
        </>}>
          <p className="text-sm text-zinc-300">{f.archived_at
            ? 'De freelancer verschijnt weer in de lijst. De oude link blijft ingetrokken; maak een nieuwe link als je opdrachten wilt delen.'
            : 'De freelancer verdwijnt uit de lijst en de keuzelijst van de materiaalplanning. Zijn persoonlijke link wordt meteen ingetrokken. Opdrachten en reviews blijven bewaard.'}</p>
        </Modal>
      )}
    </PageScroll>
  )
}
