import type { ReactNode } from 'react'
import { LogoMark } from '@/components/public/PublicShell'
import { LEGAL } from '@/lib/legal'

// Het kader van de link: bovenaan logo en bedrijfsnaam, zodat de freelancer
// ziet dat de pagina echt van ons komt. Eerst voor de gsm (360–430px); op
// een groter scherm gecentreerd, max. ~720px breed.
export default function Shell({ children, bottomBar }: { children: ReactNode; bottomBar?: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-900">
        <div className="mx-auto max-w-[720px] px-4 h-14 flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="text-base font-semibold text-white">{LEGAL.legalEntity ?? LEGAL.operator}</span>
        </div>
      </header>
      <main className={`mx-auto max-w-[720px] px-4 py-5 ${bottomBar ? 'pb-36' : 'pb-10'}`}>{children}</main>
      {bottomBar && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto max-w-[720px] px-4 py-3">{bottomBar}</div>
        </div>
      )}
    </div>
  )
}

export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mt-10 text-center">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      {children && <div className="mt-3 text-base text-zinc-400 leading-relaxed">{children}</div>}
    </div>
  )
}
