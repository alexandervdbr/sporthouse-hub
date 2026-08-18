import { createClient } from '@/lib/supabase/server'
import { ReelInspiration } from '@/types/database'
import ReelGallery from '@/components/reel-inspiration/ReelGallery'
import ReelInspirationSetup from '@/components/reel-inspiration/ReelInspirationSetup'
import { isAdminUser } from '@/lib/auth-permissions'

export const metadata = { title: 'Moodboard — Sporthouse' }

export default async function MoodboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: reels } = await supabase
    .from('reel_inspiration')
    .select('*')
    .order('saved_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Moodboard</h2>
          <p className="text-sm text-zinc-500">
            Bewaard vanaf de telefoon via de Instagram Share Sheet snelkoppeling — beeld, video en motion op één plek voor als je inspiratie zoekt.
          </p>
        </div>

        <ReelGallery reels={(reels ?? []) as ReelInspiration[]} />

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
