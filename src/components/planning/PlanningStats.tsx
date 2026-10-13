'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { DUTCH_MONTHS, normName, type Person } from '@/lib/planning-config'
import {
  presetCategory, isArchived, telMeeInStats, type PlanningPreset,
} from '@/lib/planning-presets'
import { splitThuis } from '@/lib/planning-status'

interface StatRow { contactId: string; month: number; value: string; count: number }
interface StatsAntwoord { tellingen: StatRow[]; minYear: number | null; maxYear: number | null }

// Mensen met planning die nergens in het rooster staan. Komt voor wanneer
// iemand er tijdelijk uitgehaald is — sinds de planning aan contact-id's hangt
// is dat een normale, omkeerbare handeling.
const BUITEN_ROOSTER = 'Niet in het rooster'

const MAANDEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// Deze pagina gaat over afwezigheid, per persoon, en verder niets.
//
// Er stonden hier eerst twee tabellen met drie schakelaars ertussen, daarna
// een blok per status met iedereen eronder. Dat tweede was al leesbaar, maar
// het antwoordde op de verkeerde vraag: je wil niet weten wie er allemaal
// verlof nam, je wil weten wat één iemand opnam. Dus staat er nu een blokje
// per persoon met zijn verlof, recup en ziekte onder elkaar, en twaalf
// maanden ernaast.
//
// Welke statussen dat zijn volgt uit de presets: categorie 'afwezig', en niet
// uitgevinkt voor de statistieken (NB staat standaard uit — dat is een
// roosterafspraak, geen opgenomen dag). Zet een beheerder er een bij, dan
// staat die er de volgende keer in elk blokje.
//
// Wie waar zat lees je van het teamraster af. Daar staat het per dag in plaats
// van als maandtotaal, en dat is bij die vraag ook wat je wil.

// Verlof en recup eerst, de rest alfabetisch. Niet omdat ze belangrijker zijn,
// maar omdat ze het vaakst gezocht worden en bovenaan staan scheelt kijken.
const EERST = ['VERLOF', 'RECUP']

// Dagen met een waarde die geen enkele preset meer is. Normaal nul; staat er
// wel iets, dan is er een preset verwijderd die nog in gebruik was. Deze rij
// verschijnt alleen dan, zodat die dagen niet stil uit de telling vallen.
const OVERIG = 'Overig'
const OVERIG_KLEUR = '#71717a'

const IEDEREEN = '__iedereen__'

interface StatusRij { label: string; kleur: string; hoort: (statusKey: string) => boolean }
interface Cel { rij: StatusRij; waarden: number[]; totaal: number }
interface Blok { id: string; naam: string; dept: string; cellen: Cel[]; totaal: number }

export default function PlanningStats({
  people, archived, presets, nameFor,
}: {
  // Al opgeloste personen: het rooster houdt alleen contact-id's bij.
  people: Person[]
  archived: string[]
  presets: PlanningPreset[]
  // Naam bij een contact-id, ook voor wie niet (meer) in het rooster staat.
  // Hun dagen kwamen wel uit de API maar hadden geen rij om in te staan, en
  // verdwenen dus zonder melding uit de telling.
  nameFor: (contactId: string) => string | null
}) {
  const [currentYear] = useState(() => new Date().getFullYear())
  const [year, setYear] = useState(currentYear)
  const [zoek, setZoek] = useState('')
  const [toonLege, setToonLege] = useState(false)

  const [rows, setRows] = useState<StatRow[]>([])
  const [bereik, setBereik] = useState<{ min: number | null; max: number | null }>({ min: null, max: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Het hele jaar in één keer. Dat is twaalf keer meer rijen dan één maand,
  // maar het gebeurt alleen bij het openen van dit tabblad en bij het wisselen
  // van jaar — niet op een timer, en de route telt serverside samen zodat er
  // totalen over de lijn gaan en geen dagen.
  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/planning/stats?year=${year}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.text().catch(() => '')
          throw new Error(`${r.status}${body ? `: ${body}` : ''}`)
        }
        return r.json() as Promise<StatsAntwoord>
      })
      .then(body => {
        setRows(body.tellingen)
        setBereik({ min: body.minYear, max: body.maxYear })
      })
      .catch(e => {
        console.error('Statistieken ophalen mislukt:', e)
        setError(`Kon statistieken niet laden (${e instanceof Error ? e.message : 'onbekende fout'}).`)
      })
      .finally(() => setLoading(false))
  }, [year])

  // Welke jaren je kan kiezen. Hier stond een vast venster van vorig, dit en
  // volgend jaar; wie iets in 2028 inplande kon dat dan niet terugvinden,
  // zonder dat iets dat zei. Nu komt het uit de planning zelf, met het vaste
  // venster erbij zodat een leeg jaar vooruit ook te kiezen is.
  const years = useMemo(() => {
    const set = new Set([currentYear - 1, currentYear, currentYear + 1, year])
    if (bereik.min && bereik.max) {
      // Eén tikfout (3026) mag de lijst niet laten ontsporen.
      const van = Math.max(bereik.min, currentYear - 10)
      const tot = Math.min(bereik.max, currentYear + 10)
      for (let y = van; y <= tot; y++) set.add(y)
    }
    return [...set].sort((a, b) => a - b)
  }, [bereik, currentYear, year])

  // ── Wie er in de lijst staat ──────────────────────────────────────────────
  //
  // Niet "de ploeg van vandaag" maar "wie er dit jaar werkte": vraag je 2025
  // op, dan hoort de stagiair die vorig jaar vertrok erbij.
  const mensen = useMemo(() => {
    const metData = new Set(rows.map(r => r.contactId))
    const lijst: { id: string; naam: string; dept: string }[] = []
    const gezien = new Set<string>()

    for (const p of people) {
      // Iemand mag bewust in twee afdelingen staan — hier is hij één blokje.
      if (gezien.has(p.id)) continue
      if (archived.includes(p.id) && !metData.has(p.id)) continue
      gezien.add(p.id)
      lijst.push({ id: p.id, naam: p.emp, dept: p.dept })
    }

    for (const id of metData) {
      if (gezien.has(id)) continue
      const naam = nameFor(id)
      if (!naam) continue
      gezien.add(id)
      lijst.push({ id, naam, dept: BUITEN_ROOSTER })
    }

    return lijst.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  }, [people, archived, rows, nameFor])

  // ── Tellingen ─────────────────────────────────────────────────────────────

  // Per persoon, per status, per maand. "Verlof - THUIS" telt mee onder
  // Verlof: een dag thuis is nog steeds diezelfde dag.
  const tellingen = useMemo(() => {
    const m = new Map<string, Map<string, number[]>>()
    for (const r of rows) {
      if (r.month < 1 || r.month > 12) continue
      const status = splitThuis(r.value).base.toUpperCase()
      let perStatus = m.get(r.contactId)
      if (!perStatus) { perStatus = new Map(); m.set(r.contactId, perStatus) }
      let maanden = perStatus.get(status)
      if (!maanden) { maanden = Array(12).fill(0); perStatus.set(status, maanden) }
      maanden[r.month - 1] += r.count
    }
    return m
  }, [rows])

  // ── De rijen binnen elk blokje ────────────────────────────────────────────

  const statusRijen = useMemo(() => {
    const gebruikt = new Set<string>()
    for (const r of rows) gebruikt.add(splitThuis(r.value).base.toUpperCase())

    const namen = new Set(presets.map(p => p.name.toUpperCase()))
    const bekend = new Set(presets.map(p => splitThuis(p.name).base.toUpperCase()))

    const rijen: StatusRij[] = presets
      .filter(p => presetCategory(p) === 'afwezig' && telMeeInStats(p))
      // Een gearchiveerde status blijft staan zolang er nog dagen op staan;
      // daarna verdwijnt hij vanzelf. Zo blijft de geschiedenis leesbaar
      // zonder dat de lijst volloopt met wat niet meer gebruikt wordt.
      .filter(p => !isArchived(p) || gebruikt.has(p.name.toUpperCase()))
      // Een losse "X - THUIS" naast "X" zou een tweede rij worden die dezelfde
      // dagen telt: hieronder valt THUIS samen met zijn basis.
      .filter(p => {
        const { base, thuis } = splitThuis(p.name)
        return !thuis || !namen.has(base.toUpperCase())
      })
      .sort((a, b) => {
        const rang = (naam: string) => {
          const i = EERST.indexOf(naam.toUpperCase())
          return i < 0 ? EERST.length : i
        }
        return rang(a.name) - rang(b.name) || a.name.localeCompare(b.name, 'nl')
      })
      .map(p => {
        const key = p.name.toUpperCase()
        return { label: p.name, kleur: p.color, hoort: (k: string) => k === key }
      })

    // Alleen als er echt zulke dagen zijn — anders is dit een lege rij in elk
    // blokje die uitlegt dat er niets aan de hand is.
    const heeftOverig = [...gebruikt].some(k => !bekend.has(k))
    if (heeftOverig) {
      rijen.push({ label: OVERIG, kleur: OVERIG_KLEUR, hoort: k => !bekend.has(k) })
    }

    return rijen
  }, [presets, rows])

  // ── De blokjes ────────────────────────────────────────────────────────────

  const zoekend = zoek.trim().length > 0
  // Zoek je een naam, dan wil je dat blokje zien, ook als er nul in staat.
  // Anders lijkt het of de naam niet bestaat terwijl hij enkel geen verlof nam.
  const verbergLege = !toonLege && !zoekend

  const { iedereen, blokken, verborgen } = useMemo(() => {
    const q = normName(zoek)
    const zichtbaar = mensen.filter(m => !zoekend || normName(m.naam).includes(q))

    function maakBlok(id: string, naam: string, dept: string, ids: string[]): Blok {
      const cellen = statusRijen.map(rij => {
        const waarden: number[] = Array(12).fill(0)
        for (const pid of ids) {
          for (const [statusKey, maanden] of tellingen.get(pid) ?? []) {
            if (!rij.hoort(statusKey)) continue
            for (let i = 0; i < 12; i++) waarden[i] += maanden[i]
          }
        }
        return { rij, waarden, totaal: waarden.reduce((a, b) => a + b, 0) }
      })
      return { id, naam, dept, cellen, totaal: cellen.reduce((a, c) => a + c.totaal, 0) }
    }

    const alle = zichtbaar.map(m => maakBlok(m.id, m.naam, m.dept, [m.id]))
    const getoond = verbergLege ? alle.filter(b => b.totaal > 0) : alle

    return {
      iedereen: maakBlok(IEDEREEN, 'Iedereen', '', zichtbaar.map(m => m.id)),
      blokken: getoond,
      verborgen: alle.length - getoond.length,
    }
  }, [mensen, statusRijen, tellingen, zoek, zoekend, verbergLege])

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Bediening ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="relative max-w-[16rem] flex-1 min-w-[9rem]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Zoek een naam…"
            className="w-full pl-8 pr-7 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          {zoek && (
            <button onClick={() => setZoek('')} aria-label="Zoekopdracht wissen"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              <X size={13} />
            </button>
          )}
        </div>

        {!zoekend && (toonLege || verborgen > 0) && (
          <button
            onClick={() => setToonLege(v => !v)}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 underline transition-colors"
          >
            {toonLege ? 'Verberg wie niets opnam' : `Toon ook wie niets opnam (${verborgen})`}
          </button>
        )}

        {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-3 pb-2">
        {statusRijen.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">
            Er zijn nog geen afwezigheidsstatussen. Zet in Beheer → Presets een
            status op &ldquo;Afwezig&rdquo; en hij komt hier te staan.
          </p>
        ) : (
          <>
            {/* De ploeg als geheel bovenaan: "hoeveel verlof ging eruit in
                juli" is de enige vraag die niet over één persoon gaat. */}
            <PersoonsBlok blok={iedereen} year={year} samen />

            {blokken.map(b => <PersoonsBlok key={b.id} blok={b} year={year} />)}

            {blokken.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-600">
                {zoekend ? 'Geen naam gevonden.' : `Niemand nam iets op in ${year}.`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Eén persoon: zijn statussen onder elkaar, twaalf maanden ernaast ────────

function PersoonsBlok({ blok, year, samen }: { blok: Blok; year: number; samen?: boolean }) {
  return (
    <section
      className={`rounded-xl border overflow-hidden flex-shrink-0 ${
        samen ? 'border-zinc-700 bg-zinc-900/30' : 'border-zinc-800'
      }`}
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        <h3 className={`text-sm truncate ${samen ? 'font-semibold text-zinc-200' : 'font-medium text-zinc-100'}`}>
          {blok.naam}
        </h3>
        {blok.dept && <span className="text-[11px] text-zinc-600 truncate">{blok.dept}</span>}
        {samen && <span className="text-[11px] text-zinc-600">{year}</span>}
        <span className="ml-auto text-[11px] text-zinc-500 tabular-nums flex-shrink-0">
          {blok.totaal} {blok.totaal === 1 ? 'dag' : 'dagen'}
        </span>
      </header>

      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-950 px-3 py-1 text-left font-medium text-zinc-600 border-b border-r border-zinc-800 whitespace-nowrap w-40">
              {/* Leeg: de rijnamen eronder zeggen het zelf. */}
            </th>
            {MAANDEN.map(m => (
              <th key={m} className="px-2 py-1 text-center font-medium text-zinc-600 border-b border-zinc-800 whitespace-nowrap">
                {DUTCH_MONTHS[m - 1].slice(0, 3)}
              </th>
            ))}
            <th className="px-3 py-1 text-center font-semibold text-zinc-500 border-b border-l border-zinc-800 whitespace-nowrap">
              Totaal
            </th>
          </tr>
        </thead>
        <tbody>
          {blok.cellen.map(cel => (
            <tr key={cel.rij.label} className="hover:bg-zinc-900/40">
              <td
                className="sticky left-0 z-10 bg-zinc-950 px-3 py-1.5 border-r border-zinc-800 whitespace-nowrap font-medium"
                style={{ color: cel.totaal > 0 ? cel.rij.kleur : '#52525b' }}
              >
                {cel.rij.label}
              </td>
              {cel.waarden.map((n, i) => (
                <Cijfer key={MAANDEN[i]} n={n} kleur={cel.rij.kleur} />
              ))}
              <Cijfer n={cel.totaal} kleur={cel.rij.kleur} sterk links />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Cijfer({ n, kleur, sterk, links }: {
  n: number
  kleur: string
  sterk?: boolean
  // Scheidingslijn links, om de totaalkolom van de maanden los te maken.
  links?: boolean
}) {
  return (
    <td
      className={`px-2 py-1.5 text-center tabular-nums ${links ? 'border-l border-zinc-800' : ''}`}
      style={n > 0
        ? { color: kleur, fontWeight: sterk ? 700 : 600, backgroundColor: `${kleur}14` }
        : { color: '#3f3f46' }}
    >
      {n > 0 ? n : '–'}
    </td>
  )
}
