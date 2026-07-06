import type { Metadata } from 'next'
import './globals.css'
import { RecordingProvider } from '@/contexts/RecordingContext'
import { PreviewProvider } from '@/lib/preview-context'
import { TourProvider } from '@/contexts/TourContext'
import TourOverlay from '@/components/tour/TourOverlay'

export const metadata: Metadata = {
  title: 'Sporthouse Hub',
  description: 'Intern platform voor SporthouseGroup',
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
