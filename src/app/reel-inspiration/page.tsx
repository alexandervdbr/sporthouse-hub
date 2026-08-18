import { createClient } from '@/lib/supabase/server'
import { ReelInspiration } from '@/types/database'
import ReelGallery from '@/components/reel-inspiration/ReelGallery'
import ReelInspirationSetup from '@/components/reel-inspiration/ReelInspirationSetup'

export const metadata = { title: 'Reel inspiratie — Sporthouse' }

export default async function ReelInspirationPage() {
  const supabase = await createClient()

  const { data: reels } = await supabase
    .from('reel_inspiration')
    .select('*')
    .order('saved_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Reel inspiratie</h2>
          <p className="text-sm text-zinc-500">
            Bewaard vanaf de telefoon via de Instagram Share Sheet snelkoppeling.
          </p>
        </div>

        <ReelGallery reels={(reels ?? []) as ReelInspiration[]} />

        <details className="mt-10 group">
          <summary className="text-sm font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer select-none">
            Snelkoppeling instellen
          </summary>
          <div className="mt-4 max-w-2xl">
            <ReelInspirationSetup />
          </div>
        </details>
      </div>
    </div>
  )
}
