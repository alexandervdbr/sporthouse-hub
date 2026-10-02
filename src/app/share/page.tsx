import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShareCard } from '@/components/share/ShareCard'
import { asShareTab, describeTarget, metadataFor, targetPath, type ShareTarget } from '@/lib/share-target'
import { expandUuid } from '@/lib/short-id'

// The long form of a shared link, carrying its ids in the query string.
//
// Superseded by /s/<code>, which is a third of the length — but links in this
// shape are already out there in people's messages, so this keeps working and
// behaves identically.
//
// Public for the same reason: the preview bots never sign in. See the
// exemption in middleware, and src/lib/share-target for what is and isn't
// exposed here.

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// Ids travel base64url-encoded to keep links short; expandUuid hands back
// anything that isn't one untouched, so the full-length form in an older link
// still resolves. `client`, `folder` and `file` are the names the first
// version of these links used.
function readTarget(params: Record<string, string | string[] | undefined>): ShareTarget {
  const expand = (raw: string | null) => (raw ? expandUuid(raw) : null)
  return {
    clientId: expand(one(params.c) ?? one(params.client)),
    tab: asShareTab(one(params.t)) ?? sectionAsTab(one(params.section)),
    folderId: expand(one(params.f) ?? one(params.folder)),
    fileId: expand(one(params.x) ?? one(params.file)),
  }
}

// The oldest links carried the section separately instead of as the tab.
function sectionAsTab(section: string | null) {
  return asShareTab(section)
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return metadataFor(await describeTarget(readTarget(await searchParams)))
}

export default async function SharePage({ searchParams }: { searchParams: SearchParams }) {
  const target = readTarget(await searchParams)
  const path = targetPath(target)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && path) redirect(path)

  const { itemName, context } = await describeTarget(target)
  return <ShareCard itemName={itemName} context={context} target={path} />
}
