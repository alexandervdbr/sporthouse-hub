'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, buttonCls } from '@/components/materiaal/ui'
import { useUrlState } from './useUrlState'
import { TabBar } from './ui'
import FreelancerList from './list/FreelancerList'
import AssignmentsOverview from './assignments/AssignmentsOverview'
import AssignmentPanel from './assignments/AssignmentPanel'
import AddFreelancerModal from './AddFreelancerModal'
import PageScroll from './PageScroll'

// /freelancers: twee tabbladen, Freelancers | Opdrachten. Tabblad, filters
// en de geopende opdracht staan in de URL. Knoppen om iets te wijzigen
// bestaan alleen bij "beheren" — bij "bekijken" zijn ze er niet (niet
// uitgeschakeld, gewoon weg).
export default function FreelancersShell({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const { params, set } = useUrlState()
  const tab = params.get('tab') === 'opdrachten' ? 'opdrachten' : 'freelancers'
  const openId = params.get('opdracht')
  const [adding, setAdding] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <PageScroll>
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-zinc-100">Freelancers</h1>
        {canManage && (
          <div className="flex gap-2">
            <Button onClick={() => setAdding(true)} className="!h-11 sm:!h-9">+ Freelancer</Button>
            <Link href="/freelancers/opdrachten/nieuw" className={`${buttonCls('primary')} !h-11 sm:!h-9`}>+ Nieuwe opdracht</Link>
          </div>
        )}
      </div>

      <div className="max-w-xs">
        <TabBar value={tab} onChange={t => set({ tab: t === 'freelancers' ? null : t }, 'push')}
          tabs={[{ key: 'freelancers', label: 'Freelancers' }, { key: 'opdrachten', label: 'Opdrachten' }]} />
      </div>

      {tab === 'freelancers'
        ? <FreelancerList canManage={canManage} onAdd={() => setAdding(true)} />
        : <AssignmentsOverview canManage={canManage} reloadKey={reloadKey} onOpen={id => set({ opdracht: id }, 'push')} />}

      {openId && <AssignmentPanel id={openId} canManage={canManage} onClose={() => set({ opdracht: null }, 'push')} onChanged={() => setReloadKey(k => k + 1)} />}
      {adding && <AddFreelancerModal onClose={() => setAdding(false)} onCreated={f => router.push(`/freelancers/${f.id}`)} />}
    </div>
    </PageScroll>
  )
}
