'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface PreviewUser {
  email: string
  name: string
  permissions: { sections: string[]; clients: string[] } | null
  isFreelancer: boolean
}

interface PreviewContextType {
  preview: PreviewUser | null
  setPreview: (u: PreviewUser | null) => void
}

const PreviewContext = createContext<PreviewContextType>({
  preview: null,
  setPreview: () => {},
})

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreviewState] = useState<PreviewUser | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('preview_as')
    if (stored) {
      try { setPreviewState(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  function setPreview(u: PreviewUser | null) {
    if (u) sessionStorage.setItem('preview_as', JSON.stringify(u))
    else sessionStorage.removeItem('preview_as')
    setPreviewState(u)
  }

  return (
    <PreviewContext.Provider value={{ preview, setPreview }}>
      {children}
    </PreviewContext.Provider>
  )
}

export function usePreview() {
  return useContext(PreviewContext)
}
