import type { Metadata } from 'next'
import './globals.css'
import { RecordingProvider } from '@/contexts/RecordingContext'
import { PreviewProvider } from '@/lib/preview-context'

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
            {children}
          </RecordingProvider>
        </PreviewProvider>
      </body>
    </html>
  )
}
