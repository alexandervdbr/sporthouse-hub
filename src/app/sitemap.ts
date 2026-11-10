import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl()
  return [
    { url: `${base}/`,        changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/privacy`, changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/terms`,   changeFrequency: 'yearly',  priority: 0.5 },
  ]
}
