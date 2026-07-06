'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTour } from '@/contexts/TourContext'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'

type Placement = 'center' | 'top' | 'bottom' | 'right' | 'top-right' | 'bottom-right'

interface Step {
  target: string | null
  title: string
  content: string
  placement: Placement
  requiresPage?: string
}

const STEPS: Step[] = [
  {
    target: null,
    title: 'Welkom bij de Sporthouse Hub',
    content: 'Je centrale werkplek voor klanten, content en communicatie. We tonen je in 6 stappen wat je moet weten om meteen aan de slag te gaan.',
    placement: 'center',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'Navigatiebalk',
    content: 'De linkerkolom heeft twee lagen: bovenaan de globale secties — Planning, Projecten, Materiaal, Chat... — en onderaan al je klanten, atleten en podcasts per categorie.',
    placement: 'right',
  },
  {
    target: '[data-tour="search-button"]',
    title: 'Zoeken  ⌘K',
    content: 'Met ⌘K doorzoek je het hele platform in één keer — klanten, bestanden, vergaderingen en meer. De snelste manier om iets terug te vinden.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="tools-header"]',
    title: 'Klantomgeving',
    content: 'Elke klant heeft een eigen werkomgeving met tools op maat. Welke tools beschikbaar zijn hangt af van het type klant en de samenwerking.',
    placement: 'bottom',
    requiresPage: '/clients/',
  },
  {
    target: '[data-tour="tool-expert"]',
    title: 'Expert AI',
    content: 'Een AI die specifiek getraind is op alles wat we weten over deze klant — strategie, mensen, aanpak. Stel er vragen die je normaal aan een collega zou stellen.',
    placement: 'bottom',
    requiresPage: '/clients/',
  },
  {
    target: '[data-tour="tool-meetings"]',
    title: 'Vergaderingen',
    content: 'Je hoeft niet meer mee te noteren: de Hub neemt op, transcribeert live en genereert achteraf automatisch een samenvatting met actiepunten.',
    placement: 'bottom',
    requiresPage: '/clients/',
  },
  {
    target: '[data-tour="tour-button"]',
    title: 'Rondleiding voltooid!',
    content: 'Dat was de Hub in een notendop. Klik hier om de rondleiding altijd opnieuw te starten.',
    placement: 'bottom-right',
  },
]

export const TOUR_TOTAL = STEPS.length

interface TargetRect {
  left: number
  top: number
  width: number
  height: number
}

function getTooltipPosition(
  rect: TargetRect | null,
  placement: Placement,
  tooltipW: number,
): { left: number; top: number } {
  const gap = 14
  const edge = 16

  if (!rect || placement === 'center') {
    return {
      left: (window.innerWidth - tooltipW) / 2,
      top: window.innerHeight / 2 - 120,
    }
  }

  const clampLeft = (x: number) =>
    Math.min(Math.max(edge, x), window.innerWidth - tooltipW - edge)

  switch (placement) {
    case 'bottom':
    case 'bottom-right':
      return {
        left: clampLeft(placement === 'bottom-right' ? rect.left + rect.width - tooltipW : rect.left),
        top: rect.top + rect.height + gap,
      }
    case 'top':
    case 'top-right':
      return {
        left: clampLeft(placement === 'top-right' ? rect.left + rect.width - tooltipW : rect.left),
        top: Math.max(edge, rect.top - 220 - gap),
      }
    case 'right':
      return {
        left: rect.left + rect.width + gap,
        top: Math.min(
          Math.max(edge, rect.top + rect.height / 2 - 110),
          window.innerHeight - 240 - edge,
        ),
      }
    default:
      return { left: edge, top: edge }
  }
}

export default function TourOverlay() {
  const {
    isActive, stepIndex, pendingStep,
    stop, goToStep,
    setPendingStep, setRunning,
  } = useTour()

  const pathname = usePathname()
  const router = useRouter()
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const step = STEPS[stepIndex]

  // Measure target element position
  const measure = useCallback(() => {
    if (!step?.target) { setTargetRect(null); return }
    const el = document.querySelector(step.target)
    if (!el) { setTargetRect(null); return }
    el.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    setTargetRect({ left: r.left, top: r.top, width: r.width, height: r.height })
  }, [step])

  useEffect(() => {
    if (!isActive) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [isActive, stepIndex, measure])

  // Navigate to correct page when step requires it
  useEffect(() => {
    if (!isActive || !step?.requiresPage) return
    if (pathname.startsWith(step.requiresPage)) return

    setRunning(false)
    setPendingStep(stepIndex)

    if (step.requiresPage === '/clients/') {
      const firstCard = document.querySelector('[data-tour="client-card"]') as HTMLAnchorElement
      const href = firstCard?.getAttribute('href')
      if (href) { router.push(href); return }
    }

    router.push(step.requiresPage)
  }, [isActive, stepIndex, pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for target element after navigation
  useEffect(() => {
    if (pendingStep === null) return
    const pendingTourStep = STEPS[pendingStep]
    if (!pendingTourStep) return

    const poll = setInterval(() => {
      const target = pendingTourStep.target
      const found = !target || !!document.querySelector(target)
      if (found) {
        clearInterval(poll)
        goToStep(pendingStep)
        setPendingStep(null)
        setRunning(true)
      }
    }, 80)

    const fallback = setTimeout(() => {
      clearInterval(poll)
      setPendingStep(null)
      setRunning(true)
    }, 6000)

    return () => { clearInterval(poll); clearTimeout(fallback) }
  }, [pendingStep]) // eslint-disable-line react-hooks/exhaustive-deps

  function navigateAndResume(targetStep: number) {
    const s = STEPS[targetStep]
    if (!s) return

    if (s.requiresPage && !pathname.startsWith(s.requiresPage)) {
      setRunning(false)
      setPendingStep(targetStep)
      if (s.requiresPage === '/clients/') {
        const firstCard = document.querySelector('[data-tour="client-card"]') as HTMLAnchorElement
        const href = firstCard?.getAttribute('href')
        if (href) { router.push(href); return }
      }
      router.push(s.requiresPage)
    } else {
      goToStep(targetStep)
    }
  }

  function handleNext() {
    const nextIndex = stepIndex + 1
    if (nextIndex >= STEPS.length) { stop(); return }
    navigateAndResume(nextIndex)
  }

  function handlePrev() {
    const prevIndex = stepIndex - 1
    if (prevIndex < 0) return
    navigateAndResume(prevIndex)
  }

  if (!mounted || !isActive || !step) return null

  const PAD = 7
  const spotlight = step.target ? targetRect : null
  const tooltipW = 320
  const tooltipPos = getTooltipPosition(spotlight, step.placement, tooltipW)

  return (
    <>
      {/* Click-to-dismiss backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9997, cursor: 'default' }}
        onClick={stop}
      />

      {/* Spotlight (creates the dim effect via box-shadow) */}
      {spotlight ? (
        <div
          style={{
            position: 'fixed',
            left: spotlight.left - PAD,
            top: spotlight.top - PAD,
            width: spotlight.width + PAD * 2,
            height: spotlight.height + PAD * 2,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.68)',
            outline: '2px solid rgba(58,145,63,0.35)',
            zIndex: 9998,
            pointerEvents: 'none',
            transition: 'left 0.25s ease, top 0.25s ease, width 0.25s ease, height 0.25s ease',
          }}
        />
      ) : (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.68)',
            zIndex: 9998,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        style={{
          position: 'fixed',
          left: tooltipPos.left,
          top: tooltipPos.top,
          width: tooltipW,
          zIndex: 10000,
          background: 'linear-gradient(145deg, #1e1e1e 0%, #191919 100%)',
          border: '1px solid rgba(255,255,255,0.11)',
          borderRadius: 14,
          boxShadow: '0 12px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(58,145,63,0.18)',
          padding: '20px',
          pointerEvents: 'auto',
          transition: 'left 0.25s ease, top 0.25s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Step counter + close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3A913F', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#52525b', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {stepIndex + 1} van {STEPS.length}
            </span>
          </div>
          <button
            onClick={stop}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3f3f46', padding: 2, display: 'flex', borderRadius: 4, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#71717a')}
            onMouseLeave={e => (e.currentTarget.style.color = '#3f3f46')}
          >
            <X size={13} />
          </button>
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5', margin: '0 0 8px 0', lineHeight: 1.3 }}>
          {step.title}
        </h3>

        {/* Content */}
        <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.65, margin: '0 0 20px 0' }}>
          {step.content}
        </p>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === stepIndex ? 18 : 5,
                  height: 5,
                  borderRadius: 3,
                  background: i === stepIndex ? '#3A913F' : i < stepIndex ? '#1f4d22' : '#27272a',
                  transition: 'width 0.2s ease, background 0.2s ease',
                }}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            {stepIndex > 0 && (
              <button
                onClick={handlePrev}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '6px 11px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.09)',
                  background: 'transparent', color: '#71717a',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#a1a1aa' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#71717a' }}
              >
                <ChevronLeft size={11} />
                Vorige
              </button>
            )}
            <button
              onClick={handleNext}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '6px 14px', borderRadius: 8,
                border: 'none', background: '#3A913F',
                color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#2d7332')}
              onMouseLeave={e => (e.currentTarget.style.background = '#3A913F')}
            >
              {stepIndex === STEPS.length - 1 ? 'Klaar' : 'Volgende'}
              {stepIndex < STEPS.length - 1 && <ChevronRight size={11} />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
