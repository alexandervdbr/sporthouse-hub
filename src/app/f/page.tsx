import { Suspense } from 'react'
import LinkApp from '@/features/freelancers/public/LinkApp'

// /f#<token> — zie src/features/freelancers/public/LinkApp.tsx. De server
// kent het token niet (het staat achter #); alles gebeurt na het laden.
export const dynamic = 'force-static'

export default function FreelancerLinkPage() {
  return (
    <Suspense>
      <LinkApp />
    </Suspense>
  )
}
