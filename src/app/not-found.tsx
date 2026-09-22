import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
        <FileQuestion size={24} className="text-zinc-500" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-white">Pagina niet gevonden</h1>
        <p className="text-sm text-zinc-500 max-w-sm">
          Deze pagina bestaat niet (meer), of de link klopt niet. Ga terug naar het dashboard.
        </p>
      </div>
      <a
        href="/dashboard"
        className="mt-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
        style={{ backgroundColor: '#3A913F' }}
      >
        Naar dashboard
      </a>
    </div>
  )
}
