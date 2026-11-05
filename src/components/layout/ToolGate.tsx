'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wrench, FlaskConical } from 'lucide-react'
import { useToolStatus } from '@/contexts/ToolStatusContext'
import { toolForPath, DEFAULT_DEV_MESSAGE } from '@/lib/tool-status'

// Eén poort voor alle tools, op de plek waar AppShell de pagina toont — dan
// hoeft geen enkele tool-pagina zelf iets te weten van dev-modus.
//
// Voor wie geen admin is, wordt de tool niet eens gemount: geen fetches,
// geen timers, niets wat in de live data kan schrijven. De beslissing valt
// al bij de server-render (isAdmin komt van de server), dus een collega ziet
// de tool ook niet even flitsen. Alleen "Bekijk als" leeft in de browser;
// een admin die iemand nadoet, krijgt de melding na het laden.
export default function ToolGate({ scroll, children }: { scroll: 'auto' | 'hidden'; children: React.ReactNode }) {
  const pathname = usePathname()
  const { status, canUseTool, seesDevVersion } = useToolStatus()
  const tool = toolForPath(pathname)

  const frame = `flex-1 ${scroll === 'hidden' ? 'overflow-hidden' : 'overflow-y-auto'}`

  if (tool && !canUseTool(tool.key)) {
    const message = status[tool.key]?.message?.trim() || DEFAULT_DEV_MESSAGE
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center px-6 py-10 rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto mb-4 w-11 h-11 rounded-xl flex items-center justify-center bg-amber-950/50 border border-amber-900/50">
            <Wrench size={18} className="text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-zinc-100 mb-2">{tool.label} wordt aangepast</h2>
          <p className="text-sm text-zinc-400 whitespace-pre-line">{message}</p>
          <Link href="/dashboard"
            className="inline-flex mt-6 px-3 py-2 text-sm font-medium text-zinc-200 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors">
            Naar het dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (tool && seesDevVersion(tool.key)) {
    return (
      <>
        <div className="flex-shrink-0 flex items-center gap-2.5 px-4 py-2 text-xs font-medium"
          style={{ backgroundColor: '#431407', borderBottom: '1px solid #9a341260', color: '#fdba74' }}>
          <FlaskConical size={13} className="flex-shrink-0" />
          {/* Op een gsm afbreken in plaats van afkappen; vanaf 768 px één regel zoals voorheen. */}
          <span className="flex-1 min-w-0 leading-snug md:truncate">
            <span className="font-bold">{tool.label}</span> staat in ontwikkeling — alleen admins zien deze tool.
            {' '}<span className="opacity-70">Collega&apos;s krijgen een melding. Wat je hier doet, gebeurt wel in de live data.</span>
          </span>
          <Link href="/admin?tab=tools" className="px-2.5 py-1 rounded-md hover:bg-orange-900/40 transition-colors flex-shrink-0">
            Beheren
          </Link>
        </div>
        <div className={frame}>{children}</div>
      </>
    )
  }

  return <div className={frame}>{children}</div>
}
