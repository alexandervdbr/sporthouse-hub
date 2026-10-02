import { createAdminClient } from '@/lib/supabase/server'

// What a shared link points at, and what to say about it.
//
// Shared by the two routes that can receive one: /share, which carries the
// ids in its query string, and /s/<code>, which looks them up first. Both
// then need exactly the same two things — where to send someone who is
// signed in, and what the link-preview bots should read.

// Which tab of a client a link belongs to. A fixed set rather than a path, so
// the destination can't be steered from outside.
export const SHARE_TABS = ['files', 'finance', 'administration'] as const
export type ShareTab = (typeof SHARE_TABS)[number]

export function asShareTab(value: string | null | undefined): ShareTab | null {
  return SHARE_TABS.includes(value as ShareTab) ? (value as ShareTab) : null
}

export interface ShareTarget {
  clientId: string | null
  tab: ShareTab | null
  folderId: string | null
  fileId: string | null
}

export function targetPath(target: ShareTarget): string | null {
  if (!target.clientId || !target.tab) return null
  // Built from a validated id and a value out of a fixed list, so there's
  // nothing here that could carry a scheme or a host.
  const search = new URLSearchParams()
  if (target.folderId) search.set('folder', target.folderId)
  if (target.fileId) search.set('file', target.fileId)
  const query = search.toString()
  const path = `/clients/${target.clientId}/${target.tab}`
  return query ? `${path}?${query}` : path
}

// Sporthouse documents live on a client's finance or administration tab, so
// the section follows from the tab rather than needing its own parameter.
function sectionOf(tab: ShareTab | null) {
  return tab === 'finance' || tab === 'administration' ? tab : null
}

// Read with the admin client on purpose: this runs for visitors who aren't
// signed in, including the preview bots. Only names are read — never a
// listing, never contents.
export async function describeTarget(target: ShareTarget) {
  const admin = createAdminClient()
  const section = sectionOf(target.tab)

  let itemName: string | null = null
  let context: string | null = null

  if (section) {
    context = section === 'finance' ? 'Financiën' : 'Administratie'
    if (target.fileId) {
      const { data } = await admin.from('sporthouse_documents').select('filename').eq('id', target.fileId).maybeSingle()
      itemName = data?.filename ?? null
    }
    if (!itemName && target.folderId) {
      const { data } = await admin.from('sporthouse_document_folders').select('name').eq('id', target.folderId).maybeSingle()
      itemName = data?.name ?? null
    }
  } else {
    if (target.clientId) {
      const { data } = await admin.from('clients').select('name').eq('id', target.clientId).maybeSingle()
      context = data?.name ?? null
    }
    if (target.fileId) {
      const { data } = await admin.from('files').select('filename').eq('id', target.fileId).maybeSingle()
      itemName = data?.filename ?? null
    }
    if (!itemName && target.folderId) {
      const { data } = await admin.from('file_folders').select('name').eq('id', target.folderId).maybeSingle()
      itemName = data?.name ?? null
    }
  }

  return { itemName, context }
}

// Falls back to something plausible rather than an empty card when the folder
// is gone, or the link was mangled in transit.
export function metadataFor({ itemName, context }: { itemName: string | null; context: string | null }) {
  const title = itemName ?? 'Gedeeld bestand'
  const description = context ? `${context} — Sporthouse Hub` : 'Sporthouse Hub'
  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Sporthouse Hub', type: 'website' as const },
    twitter: { card: 'summary' as const, title, description },
  }
}
