'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { usePreview } from '@/lib/preview-context'
import { isInDevelopment, type ToolStatusMap } from '@/lib/tool-status'

interface ToolStatusContextType {
  status: ToolStatusMap
  setStatus: (s: ToolStatusMap) => void
  // Echte admin, los van "Bekijk als".
  realIsAdmin: boolean
  // Mag deze tool nu getoond worden? Een admin die iemand nadoet, krijgt
  // wat die persoon zou krijgen: de melding.
  canUseTool: (key: string) => boolean
  // Ziet de huidige kijker deze tool als dev-versie (dus met de balk)?
  seesDevVersion: (key: string) => boolean
}

const ToolStatusContext = createContext<ToolStatusContextType>({
  status: {},
  setStatus: () => {},
  realIsAdmin: false,
  canUseTool: () => true,
  seesDevVersion: () => false,
})

export function ToolStatusProvider({ initialStatus, isAdmin, children }: {
  initialStatus: ToolStatusMap
  isAdmin: boolean
  children: ReactNode
}) {
  const [status, setStatus] = useState<ToolStatusMap>(initialStatus)
  const { preview } = usePreview()
  const actsAsAdmin = isAdmin && !preview

  const canUseTool = (key: string) => !isInDevelopment(status, key) || actsAsAdmin
  const seesDevVersion = (key: string) => isInDevelopment(status, key) && actsAsAdmin

  return (
    <ToolStatusContext.Provider value={{ status, setStatus, realIsAdmin: isAdmin, canUseTool, seesDevVersion }}>
      {children}
    </ToolStatusContext.Provider>
  )
}

export function useToolStatus() {
  return useContext(ToolStatusContext)
}
