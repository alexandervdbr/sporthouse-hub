'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface TourContextType {
  isActive: boolean
  stepIndex: number
  pendingStep: number | null
  start: () => void
  stop: () => void
  next: () => void
  prev: () => void
  goToStep: (index: number) => void
  setPendingStep: (index: number | null) => void
  setRunning: (running: boolean) => void
}

const TourContext = createContext<TourContextType | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [pendingStep, setPendingStep] = useState<number | null>(null)

  const start = useCallback(() => {
    setStepIndex(0)
    setPendingStep(null)
    setIsActive(true)
  }, [])

  const stop = useCallback(() => {
    setIsActive(false)
    setStepIndex(0)
    setPendingStep(null)
  }, [])

  const next = useCallback(() => setStepIndex(prev => prev + 1), [])
  const prev = useCallback(() => setStepIndex(prev => Math.max(0, prev - 1)), [])
  const goToStep = useCallback((index: number) => setStepIndex(index), [])
  const setRunning = useCallback((running: boolean) => setIsActive(running), [])

  return (
    <TourContext.Provider value={{
      isActive, stepIndex, pendingStep,
      start, stop, next, prev, goToStep,
      setPendingStep, setRunning,
    }}>
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}
