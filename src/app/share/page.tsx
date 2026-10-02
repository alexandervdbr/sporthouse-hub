import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// The one page in the app a logged-out visitor is allowed to reach, because
// the whole point is to be readable by the link-preview bots of WhatsApp,
// Slack and Discord — which never log in. See the exemption in middleware.
//
// Deliberately public, and deliberately thin: it carries the name of the
// folder or file and the client it belongs to, and nothing else. No listing,
// no contents, no links to either. Everything behind it still goes through
// the normal checks.
//
// The trade was made knowingly: a preview card that says which folder a link
// opens is visible to everyone who sees the message, including people in a
// group chat who never click it.

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// The target comes in on the query string, so it has to be treated as hostile
// until proven otherwise: an unchecked value here is an open redirect, which
// turns our domain into a convenient disguise for someone else's link.
// Only a plain, same-site path is accepted — no scheme, no host, and no
// leading double slash, which browsers read as a protocol-relative URL.
function safePath(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (!/^\/[A-Za-z0-9/_-]*$/.test(raw)) return null
  return raw
}

// Which tab of a client the link belongs to. Kept to a known set rather than
// a free-form path: the destination arrives on the query string, so deriving
// it from a fixed list is both shorter and safer than carrying and validating
// a path someone could have edited.
const TABS = ['files', 'finance', 'administration'] as const
type Tab = (typeof TABS)[number]

function tabOf(params: Record<string, string | string[] | undefined>): Tab | null {
  const raw = one(params.t)
  return TABS.includes(raw as Tab) ? (raw as Tab) : null
}

function clientOf(params: Record<string, string | string[] | undefined>) {
  // `client` and `path` are the first shape these links had; still read so
  // that one shared an hour ago keeps working.
  return one(params.c) ?? one(params.client)
}

function folderOf(params: Record<string, string | string[] | undefined>) {
  return one(params.f) ?? one(params.folder)
}

function fileOf(params: Record<string, string | string[] | undefined>) {
  return one(params.x) ?? one(params.file)
}

// Sporthouse documents live on a client's finance or administration tab, so
// the section follows from the tab rather than needing its own parameter.
function sectionOf(params: Record<string, string | string[] | undefined>): string | null {
  const tab = tabOf(params)
  if (tab === 'finance' || tab === 'administration') return tab
  const legacy = one(params.section)
  return legacy === 'finance' || legacy === 'administration' ? legacy : null
}

function targetUrl(params: Record<string, string | string[] | undefined>): string | null {
  const client = clientOf(params)
  const tab = tabOf(params)

  const path = client && tab
    ? safePath(`/clients/${client}/${tab}`)
    // The older shape carried the whole path, url-encoded.
    : safePath(one(params.path))

  if (!path) return null

  const search = new URLSearchParams()
  const folder = folderOf(params)
  const file = fileOf(params)
  if (folder) search.set('folder', folder)
  if (file) search.set('file', file)
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

// Looked up with the admin client on purpose: this runs for visitors who
// aren't signed in, including the preview bots. Only names are read.
async function describe(params: Record<string, string | string[] | undefined>) {
  const admin = createAdminClient()
  const folderId = folderOf(params)
  const fileId = fileOf(params)
  const section = sectionOf(params)

  let itemName: string | null = null
  let context: string | null = null

  if (section) {
    context = section === 'finance' ? 'Financiën' : 'Administratie'
    if (fileId) {
      const { data } = await admin.from('sporthouse_documents').select('filename').eq('id', fileId).maybeSingle()
      itemName = data?.filename ?? null
    }
    if (!itemName && folderId) {
      const { data } = await admin.from('sporthouse_document_folders').select('name').eq('id', folderId).maybeSingle()
      itemName = data?.name ?? null
    }
  } else {
    const clientId = clientOf(params)
    if (clientId) {
      const { data } = await admin.from('clients').select('name').eq('id', clientId).maybeSingle()
      context = data?.name ?? null
    }
    if (fileId) {
      const { data } = await admin.from('files').select('filename').eq('id', fileId).maybeSingle()
      itemName = data?.filename ?? null
    }
    if (!itemName && folderId) {
      const { data } = await admin.from('file_folders').select('name').eq('id', folderId).maybeSingle()
      itemName = data?.name ?? null
    }
  }

  return { itemName, context }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams
  const { itemName, context } = await describe(params)

  // Falls back to something plausible rather than an empty card when the
  // folder is gone, or the link was mangled in transit.
  const title = itemName ?? 'Gedeeld bestand'
  const description = context
    ? `${context} — Sporthouse Hub`
    : 'Sporthouse Hub'

  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Sporthouse Hub', type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function SharePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const target = targetUrl(params)

  // Signed in already: go straight there. Sharing a link shouldn't cost the
  // receiver an extra click just because it had to pass through here.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && target) redirect(target)

  const { itemName, context } = await describe(params)

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.09)' }}>
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Gedeeld in Sporthouse Hub</p>
        <h1 className="text-lg font-semibold text-white break-words">{itemName ?? 'Gedeeld bestand'}</h1>
        {context && <p className="text-sm text-zinc-400 mt-1">{context}</p>}

        <Link
          href={target ? `/login?next=${encodeURIComponent(target)}` : '/login'}
          className="inline-block mt-6 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-600 transition-colors"
        >
          Inloggen om te openen
        </Link>

        <p className="text-xs text-zinc-600 mt-4">
          Je hebt een account en toegang tot deze klant nodig om dit te bekijken.
        </p>
      </div>
    </main>
  )
}
