'use client'

import { useRouter } from 'next/navigation'
import PageScroll from '../PageScroll'
import AssignmentPanel from './AssignmentPanel'

// Eén opdracht als losse pagina (gsm, of een gedeelde link).
export default function AssignmentPage({ id, canManage }: { id: string; canManage: boolean }) {
  const router = useRouter()
  return (
    <PageScroll>
      <div className="sm:px-6 sm:py-5">
        <AssignmentPanel id={id} canManage={canManage} asPage onClose={() => router.push('/freelancers?tab=opdrachten')} />
      </div>
    </PageScroll>
  )
}
