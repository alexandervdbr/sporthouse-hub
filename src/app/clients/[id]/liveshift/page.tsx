import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Post } from '@/types/database'
import LiveShiftEditor from '@/components/liveshift/LiveShiftEditor'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LiveShiftPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }, { data: posts }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.auth.getUser(),
    supabase.from('posts').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(24),
  ])

  if (!client) notFound()

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Live Shift</h2>
          <p className="text-sm text-zinc-500">
            Genereer social media posts voor {client.name} — Instagram (4:5) en Twitter (16:9).
          </p>
        </div>

        <LiveShiftEditor
          clientId={id}
          initialPosts={(posts as Post[]) ?? []}
          currentUserEmail={user?.email ?? null}
        />
      </div>
    </div>
  )
}
