'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, X } from 'lucide-react'

// Zegt het zelf wanneer Google het laat afweten.
//
// Op 21 oktober 2026 lag Drive er een tijd uit. Iedereen die uploadde kreeg
// een onbegrijpelijke foutmelding, en niemand wist of het aan henzelf lag, aan
// het platform, of aan Google. Dit haalt die vraag weg.
//
// De banner heeft geen aan/uit: hij volgt uit de feiten. Zijn er recent
// Drive-fouten geweest, dan staat hij er; houdt het op, dan verdwijnt hij
// vanzelf. Niemand hoeft een storing "af te sluiten", en er kan dus ook geen
// melding blijven hangen over iets wat allang voorbij is.

// Twee fouten binnen dit venster. Eén losse 500 van Google is ruis, en daar
// hoort niet het hele bedrijf een storingsmelding voor te zien.
const WINDOW_MINUTES = 10
const THRESHOLD = 2

export default function DriveIncidentBanner() {
  const [active, setActive] = useState(false)
  // Hoe lang geleden de laatste fout was, berekend op het moment dat we
  // kijken. Tijdens het renderen de klok uitlezen maakt het resultaat
  // afhankelijk van wanneer React toevallig opnieuw tekent.
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // Wat de focus-afhandeling moet weten zonder dat het effect opnieuw opgezet
  // hoeft te worden.
  const activeRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    // Eén afspraak vooruit, geen herhalende timer: we weten precies wanneer
    // de banner mag verdwijnen, dus kijken we dán één keer — niet elke
    // zoveel seconden voor niets.
    let expiry: ReturnType<typeof setTimeout> | undefined

    async function check() {
      const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()
      const { data } = await supabase
        .from('drive_incidents')
        .select('occurred_at')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(THRESHOLD)

      const rows = data ?? []
      const isActive = rows.length >= THRESHOLD
      activeRef.current = isActive
      setActive(isActive)
      setMinutesAgo(rows[0]
        ? Math.max(0, Math.round((Date.now() - new Date(rows[0].occurred_at).getTime()) / 60_000))
        : null)

      clearTimeout(expiry)
      if (!isActive) return

      // De banner gaat uit zodra er minder dan THRESHOLD fouten in het venster
      // zitten — dus op het moment dat de oudste van de twee nieuwste eruit
      // valt. Daar zetten we één controle op. Komt er intussen een nieuwe
      // fout binnen, dan schuift dat moment vanzelf op.
      const oldestInWindow = new Date(rows[THRESHOLD - 1].occurred_at).getTime()
      const until = oldestInWindow + WINDOW_MINUTES * 60_000 - Date.now()
      expiry = setTimeout(check, Math.max(1_000, until + 1_000))
    }

    check()

    // Geen timer die blijft lopen — de realtime-verbinding meldt een nieuwe
    // storing uit zichzelf. Zie CLAUDE.md over wat periodiek bevragen kost.
    const channel = supabase
      .channel('drive-incidents')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drive_incidents' }, () => {
        setDismissed(false)
        check()
      })
      .subscribe()

    // Alleen nakijken bij terugkeren als er een banner stáát. Browsers remmen
    // timers in een tabblad op de achtergrond af, dus die ene afspraak kan te
    // laat vuren en dan hangt er een melding over een voorbije storing.
    //
    // Staat er geen banner, dan valt er niets te verversen — en dan hoort
    // tabbladwisselen ook geen vraag naar de database te zijn. In het normale
    // geval, zonder storing, is dit dus precies nul extra verkeer.
    const onFocus = () => { if (activeRef.current) check() }
    window.addEventListener('focus', onFocus)

    return () => {
      clearTimeout(expiry)
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (!active || dismissed) return null

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 text-xs font-medium"
      style={{ backgroundColor: '#450a0a', borderBottom: '1px solid #99181860', color: '#fca5a5' }}>
      <AlertTriangle size={14} className="flex-shrink-0" />
      <p className="flex-1 min-w-0">
        Google Drive heeft een storing. Uploads en downloads lukken nu mogelijk niet — je bestand is
        niet kwijt, probeer het straks opnieuw.
        {minutesAgo !== null && (
          <span className="text-red-300/60">
            {' '}Laatste fout {minutesAgo === 0 ? 'zojuist' : `${minutesAgo} min geleden`}.
          </span>
        )}
      </p>
      {/* Wegklikken geldt voor nu. Komt er een nieuwe fout binnen, dan staat
          hij er weer — anders klikt iemand hem 's ochtends weg en mist hij de
          storing van later op de dag. */}
      <button onClick={() => setDismissed(true)} aria-label="Melding verbergen"
        className="flex-shrink-0 hover:text-red-200 transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}
