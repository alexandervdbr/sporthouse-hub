import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sporthouse Hub',
    short_name: 'Sporthouse',
    description: 'Sporthouse intern platform',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    orientation: 'portrait',
    icons: [
      {
        src: '/logos/sporthouse.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logos/sporthouse.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
