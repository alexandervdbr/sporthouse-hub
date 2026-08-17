import ReelInspirationSetup from '@/components/reel-inspiration/ReelInspirationSetup'

export const metadata = { title: 'Reel inspiratie — Sporthouse' }

export default function ReelInspirationPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Reel inspiratie</h2>
          <p className="text-sm text-zinc-500">
            Bewaar Instagram Reels/Posts rechtstreeks vanaf je telefoon via de Share Sheet
            snelkoppeling. Vul deze twee waarden eenmalig in bij de snelkoppeling — daarna werkt
            &quot;Delen&quot; op elke Reel meteen.
          </p>
        </div>
        <ReelInspirationSetup />
      </div>
    </div>
  )
}
