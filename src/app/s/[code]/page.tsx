import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ShareCard } from '@/components/share/ShareCard'
import { asShareTab, describeTarget, metadataFor, targetPath, type ShareTarget } from '@/lib/share-target'

// A short shared link: /s/<code> instead of a URL with two ids in it.
//
// Public for the same reason /share is — the link-preview bots of WhatsApp,
// Slack and Discord never sign in, and a card that can't say what it opens is
// no better than no card. See the exemption in middleware.

type Params = Promise<{ code: string }>

// Looked up with the admin client: this page answers visitors who aren't
// signed in. The row holds ids, not contents, and what's done with them is
// checked at every step after this.
async function resolve(code: string): Promise<ShareTarget | null> {
  // Codes are generated as url-safe characters; anything else can't exist.
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('share_links')
    .select('client_id, tab, folder_id, file_id')
    .eq('code', code)
    .maybeSingle()

  if (!data) return null
  return {
    clientId: data.client_id,
    tab: asShareTab(data.tab),
    folderId: data.folder_id,
    fileId: data.file_id,
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params
  const target = await resolve(code)
  if (!target) return metadataFor({ itemName: null, context: null })
  return metadataFor(await describeTarget(target))
}

export default async function ShortSharePage({ params }: { params: Params }) {
  const { code } = await params
  const target = await resolve(code)
  const path = target ? targetPath(target) : null

  // Signed in already: go straight there. Passing through here shouldn't cost
  // the receiver a click.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && path) redirect(path)

  const { itemName, context } = target
    ? await describeTarget(target)
    : { itemName: null, context: null }

  return <ShareCard itemName={itemName} context={context} target={path} />
}
