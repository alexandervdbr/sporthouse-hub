import type { Metadata } from 'next'

// De persoonlijke link voor freelancers. Staat buiten (app): geen zijbalk,
// geen zoekbalk, niets uit de hub. Nooit indexeren (ook X-Robots-Tag in de
// middleware).
export const metadata: Metadata = {
  title: 'Jouw opdrachten — Sporthouse',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default function FreelancerLinkLayout({ children }: { children: React.ReactNode }) {
  return children
}
