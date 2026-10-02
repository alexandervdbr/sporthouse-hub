import Link from 'next/link'

// What a logged-out visitor sees when they open a shared link. Deliberately
// thin: the name of one folder or file, the client it belongs to, and a way
// in. No listing, no contents, no links to either.
export function ShareCard({ itemName, context, target }: {
  itemName: string | null
  context: string | null
  target: string | null
}) {
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
