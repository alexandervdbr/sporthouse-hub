import { createClient } from '@/lib/supabase/server'
import { ReelInspiration } from '@/types/database'
import ReelGallery from '@/components/reel-inspiration/ReelGallery'
import ReelInspirationSetup from '@/components/reel-inspiration/ReelInspirationSetup'
import RetagAllButton from '@/components/reel-inspiration/RetagAllButton'
import { isAdminUser, hasSection } from '@/lib/auth-permissions'
import { getReelMediaTypes } from '@/lib/reel-media-types'

export const metadata = { title: 'Mijn gedacht! — Sporthouse' }

export default async function MijnGedachtPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // embed_html (~3-8KB of boilerplate per row) is only needed once a card's
  // preview modal opens — left out here and fetched lazily by the modal via
  // GET /api/reels/[id] instead of shipping it for every row on every load.
  const { data: reels } = await supabase
    .from('reel_inspiration')
    .select('id, user_id, url, thumbnail_url, caption, author, media_types, thumbnail_drive_id, tags, confidence, status, error_message, saved_at')
    .order('saved_at', { ascending: false })

  const mediaTypes = await getReelMediaTypes(supabase)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-sh-grey mb-1">Mijn gedacht!</h2>
            <p className="text-sm text-zinc-500">
              Bewaard vanaf de telefoon via de Instagram Share Sheet snelkoppeling — beeld, video en motion op één plek voor als je inspiratie zoekt.
            </p>
          </div>
          {isAdminUser(user) && <RetagAllButton />}
        </div>

        <ReelGallery
          reels={(reels ?? []) as ReelInspiration[]}
          isAdmin={isAdminUser(user)}
          mediaTypes={mediaTypes}
          canCreateTypes={hasSection(user, 'mijn_gedacht_types_beheren')}
        />

        {isAdminUser(user) && (
          <details className="mt-10 group">
            <summary className="text-sm font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer select-none">
              Snelkoppeling instellen (beheer)
            </summary>
            <div className="mt-4 max-w-2xl">
              <ReelInspirationSetup />
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
