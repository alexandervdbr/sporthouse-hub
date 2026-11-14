import type { ReactNode } from 'react'

// AppShell laat pagina's onder /freelancers zelf scrollen (overflow hidden op
// het hoofdvlak, src/components/layout/AppShell.tsx). Elke pagina van de
// freelancertool zit daarom in deze container.
export default function PageScroll({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto overscroll-contain">{children}</div>
}
