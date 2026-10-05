// Supabase geeft standaard hoogstens 1000 rijen terug. Een drukke maand zit
// daarboven — maart 2026 heeft er 1257 — en wat eroverheen gaat verdwijnt
// zonder melding: geen fout, geen waarschuwing, gewoon een kortere lijst.
//
// Daarom in pagina's, tot er minder terugkomt dan een volle pagina. De
// sortering is daarbij geen smaakkwestie: zonder vaste volgorde mag Postgres
// rijen per pagina anders ordenen, en dan mis je er alsnog of krijg je ze
// dubbel. Op `id` is willekeurig maar uniek, en dat is het enige dat telt.
//
// Stond eerst alleen in PlanningApp (zie #188). Dezelfde grens gold even hard
// voor de statistieken, de staleness-berekening en de planning die de Expert
// AI meekrijgt — die vroegen alle drie méér rijen op dan het raster, zonder
// paginering. Daarom hier gedeeld, zodat de volgende plek die een hele maand
// of een heel jaar opvraagt er niet opnieuw in loopt.

export const PAGE_SIZE = 1000

// `build` wordt per pagina opnieuw aangeroepen: een Supabase-querybuilder is
// eenmalig, dus hergebruik van dezelfde instantie levert vanaf de tweede
// pagina een fout op.
export async function fetchAllRows<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    all.push(...page)
    if (page.length < PAGE_SIZE) return all
  }
}
