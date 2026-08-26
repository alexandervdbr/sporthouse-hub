import type { Metadata, Viewport } from 'next'
import './globals.css'
import { RecordingProvider } from '@/contexts/RecordingContext'
import { PreviewProvider } from '@/lib/preview-context'
import { TourProvider } from '@/contexts/TourContext'
import TourOverlay from '@/components/tour/TourOverlay'

export const metadata: Metadata = {
  title: 'Sporthouse Hub',
  description: 'Intern platform voor SporthouseGroup',
}

// Without this, mobile browsers render the page at a fake ~980px desktop
// viewport and shrink it to fit the screen — every responsive Tailwind
// breakpoint (sm:/md:/lg:) then evaluates against that fake width instead
// of the phone's real one, so mobile always renders the desktop layout,
// tiny and requiring pinch-zoom. Was missing entirely; app-wide fix, not
// specific to any one page.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="nl">
      <body>
        <PreviewProvider>
          <RecordingProvider>
            <TourProvider>
              {children}
              <TourOverlay />
            </TourProvider>
          </RecordingProvider>
        </PreviewProvider>
      </body>
    </html>
  )
}
