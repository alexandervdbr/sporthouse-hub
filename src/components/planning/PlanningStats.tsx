'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { DUTCH_MONTHS, normName, type Person } from '@/lib/planning-config'
import type { PlanningPreset } from '@/lib/planning-presets'
import { allStatusOptions, splitThuis } from './DayEditor'

interface StatRow { contactId: string; month: number; value: string; count: number }

// Mensen met planning die nergens in het rooster staan. Komt voor wanneer
// iemand er tijdelijk uitgehaald is — sinds de planning aan contact-id's hangt
// is dat een normale, omkeerbare handeling.
const BUITEN_ROOSTER = 'Niet in het rooster'

const MAANDEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// Deze pagina gaat over afwezigheid, en verder niets.
//
// Er stonden hier eerder twee tabellen met drie schakelaars ertussen: per
// maand of per jaar, en dan werk, afwezigheid of alles. Dat beantwoordde
// twee vragen half en vroeg van je dat je eerst de goede stand koos. De
// vraag die dit team echt heeft is "hoeveel recup- en verlofdagen nam
// iedereen, per maand". Dus dat is wat er nu staat, zonder standen.
//
// Wie waar zat lees je van het teamraster af. Daar zie je het per dag staan
// in plaats van als maandtotaal, en dat is bij die vraag ook wat je wil.
//
// Eén blok per afwezigheidsstatus, welke dat zijn volgt uit de categorie op
// de preset (zie migratie 0054). Zet een beheerder er een vijfde bij, dan
// staat die er de volgende keer gewoon tussen.

// Verlof en recup eerst, de rest alfabetisch. Niet omdat ze belangrijker
// zijn, maar omdat ze het vaakst gezocht worden en bovenaan staan scheelt
// scrollen.
const EERST = ['VERLOF', 'RECUP']

// Dagen met een waarde die geen enkele preset meer is. Normaal nul; staat er
// wel iets, dan is er een preset verwijderd die nog in gebruik was. Dit blok
// verschijnt alleen dan, zodat die dagen niet stil uit de telling vallen.
const OVERIG = 'Overig'
const OVERIG_KLEUR = '#71717a'

interface Regel { id: string; naam: string; dept: string; waarden: number[]; totaal: number }
interface Blok {
  label: string
  kleur: string
  regels: Regel[]
  maandTotalen: number[]
  totaal: number
  // Rijen die weggelaten zijn omdat ze nul zijn — het aantal achter de knop.
  verborgen: number
}

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Het hele jaar in één keer. Dat is twaalf keer meer rijen dan de oude
  // maandweergave, maar het gebeurt alleen bij het openen van dit tabblad en
  // bij het wisselen van jaar — niet op een timer, en de route telt serverside
  // samen zodat er geen dagen maar totalen over de lijn gaan.
  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/planning/stats?year=${year}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.text().catch(() => '')
          throw new Error(`${r.status}${body ? `: ${body}` : ''}`)
        }
        return r.json()
      })
      .then(setRows)
      .catch(e => {
        console.error('Statistieken ophalen mislukt:', e)
        setError(`Kon statistieken niet laden (${e instanceof Error ? e.message : 'onbekende fout'}).`)
      })
      .finally(() => setLoading(false))
  }, [year])

  // ── Wie er in de tabel staat ──────────────────────────────────────────────
  //
  // Eén platte lijst op naam, geen groepen per afdeling. Met twaalf
  // maandkolommen naast elkaar zijn tussenkoppen vooral ruis; de afdeling
  // staat achter de naam voor wie het wil weten.
  //
  // Niet "de ploeg van vandaag" maar "wie er dit jaar werkte": vraag je 2025
  // op, dan hoort de stagiair die vorig jaar vertrok erbij.
  const mensen = useMemo(() => {
    const metData = new Set(rows.map(r => r.contactId))
    const lijst: { id: string; naam: string; dept: string }[] = []
    const gezien = new Set<string>()

    for (const p of people) {
      // Iemand mag bewust in twee afdelingen staan — hier is hij één rij.
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

  // ── Statussen ─────────────────────────────────────────────────────────────

  const alleStatussen = useMemo(() => allStatusOptions(presets), [presets])

  const afwezigStatussen = useMemo(() => {
    const namen = new Set(alleStatussen.map(o => o.name.toUpperCase()))
    return alleStatussen
      .filter(o => o.category === 'afwezig')
      // Een losse "X - THUIS" naast "X" zou een tweede blok worden dat
      // dezelfde dagen telt: hieronder valt THUIS samen met zijn basis.
      .filter(o => {
        const { base, thuis } = splitThuis(o.name)
        return !thuis || !namen.has(base.toUpperCase())
      })
      .sort((a, b) => {
        const rang = (naam: string) => {
          const i = EERST.indexOf(naam.toUpperCase())
          return i < 0 ? EERST.length : i
        }
        return rang(a.name) - rang(b.name) || a.name.localeCompare(b.name, 'nl')
      })
  }, [alleStatussen])

  // Alles wat een preset is, met de THUIS-variant onder zijn basis. Wat hier
  // niet in staat belandt in het Overig-blok.
  const bekend = useMemo(
    () => new Set(alleStatussen.map(o => splitThuis(o.name).base.toUpperCase())),
    [alleStatussen]
  )

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

  // ── De blokken ────────────────────────────────────────────────────────────

  const zoekend = zoek.trim().length > 0
  // Zoek je een naam, dan wil je die rij zien, ook als er nul staat. Anders
  // lijkt het of je naam niet bestaat terwijl hij enkel geen verlof nam.
  const verbergLege = !toonLege && !zoekend

  const blokken = useMemo(() => {
    const q = normName(zoek)

    function bouw(label: string, kleur: string, hoort: (statusKey: string) => boolean): Blok {
      const regels: Regel[] = []
      const maandTotalen: number[] = Array(12).fill(0)
      let totaal = 0
      let verborgen = 0

      for (const m of mensen) {
        if (zoekend && !normName(m.naam).includes(q)) continue

        const waarden: number[] = Array(12).fill(0)
        for (const [statusKey, maanden] of tellingen.get(m.id) ?? []) {
          if (!hoort(statusKey)) continue
          for (let i = 0; i < 12; i++) waarden[i] += maanden[i]
        }

        const rijTotaal = waarden.reduce((a, b) => a + b, 0)
        if (rijTotaal > 0) {
          for (let i = 0; i < 12; i++) maandTotalen[i] += waarden[i]
          totaal += rijTotaal
        } else if (verbergLege) {
          verborgen++
          continue
        }

        regels.push({ ...m, waarden, totaal: rijTotaal })
      }

      return { label, kleur, regels, maandTotalen, totaal, verborgen }
    }

    const result = afwezigStatussen.map(o =>
      bouw(o.name, o.color, k => k === o.name.toUpperCase())
    )

    const overig = bouw(OVERIG, OVERIG_KLEUR, k => !bekend.has(k))
    if (overig.totaal > 0) result.push(overig)

    return result
  }, [afwezigStatussen, bekend, mensen, tellingen, zoek, zoekend, verbergLege])

  const verborgenTotaal = useMemo(
    () => blokken.reduce((max, b) => Math.max(max, b.verborgen), 0),
    [blokken]
  )

  const years = [currentYear - 1, currentYear, currentYear + 1]

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

        {!zoekend && (toonLege || verborgenTotaal > 0) && (
          <button
            onClick={() => setToonLege(v => !v)}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 underline transition-colors"
          >
            {toonLege ? 'Verberg wie niets heeft staan' : 'Toon ook wie niets heeft staan'}
          </button>
        )}

        {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-4 pb-2">
        {blokken.length === 0 && !loading && (
          <p className="py-12 text-center text-sm text-zinc-600">
            Er zijn nog geen afwezigheidsstatussen. Zet in Beheer → Presets een
            status op &ldquo;Afwezig&rdquo; en hij komt hier te staan.
          </p>
        )}

        {blokken.map(blok => <StatusBlok key={blok.label} blok={blok} year={year} zoekend={zoekend} />)}
      </div>
    </div>
  )
}

// ── Eén status, iedereen, twaalf maanden ────────────────────────────────────

function StatusBlok({ blok, year, zoekend }: { blok: Blok; year: number; zoekend: boolean }) {
  return (
    <section className="rounded-xl border border-zinc-800 overflow-hidden flex-shrink-0">
      <header className="flex items-center gap-2 px-3 py-2 bg-zinc-950 border-b border-zinc-800">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: blok.kleur }} />
        <h3 className="text-sm font-semibold" style={{ color: blok.kleur }}>{blok.label}</h3>
        <span className="text-[11px] text-zinc-600">{year}</span>
        <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">
          {blok.totaal} {blok.totaal === 1 ? 'dag' : 'dagen'}
        </span>
      </header>

      {blok.label === OVERIG && (
        <p className="px-3 py-2 text-[11px] text-zinc-500 bg-zinc-900/40 border-b border-zinc-800">
          Dagen met een status die niet meer bestaat — meestal een preset die
          verwijderd is terwijl hij nog in gebruik was.
        </p>
      )}

      {blok.regels.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-600">
          {zoekend
            ? `Geen naam gevonden met ${blok.label}.`
            : `Niemand heeft ${blok.label} staan in ${year}.`}
        </p>
      ) : (
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-950 px-3 py-1.5 text-left font-medium text-zinc-500 border-b border-r border-zinc-800 whitespace-nowrap">
                Naam
              </th>
              {MAANDEN.map(m => (
                <th
                  key={m}
                  className="px-2 py-1.5 text-center font-medium text-zinc-500 border-b border-zinc-800 whitespace-nowrap"
                >
                  {DUTCH_MONTHS[m - 1].slice(0, 3)}
                </th>
              ))}
              <th className="px-3 py-1.5 text-center font-semibold text-zinc-400 border-b border-l border-zinc-800 whitespace-nowrap">
                Totaal
              </th>
            </tr>
          </thead>
          <tbody>
            {blok.regels.map(r => (
              <tr key={r.id} className="hover:bg-zinc-900/50">
                <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-1.5 text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
                  {r.naam}
                  {r.dept && <span className="ml-2 text-[10px] text-zinc-600">{r.dept}</span>}
                </td>
                {r.waarden.map((n, i) => (
                  <Cijfer key={MAANDEN[i]} n={n} kleur={blok.kleur} />
                ))}
                <Cijfer n={r.totaal} kleur={blok.kleur} sterk links />
              </tr>
            ))}

            {/* Eén regel voor de hele ploeg: "hoeveel verlof nam het team in
                juli" is de vraag waar deze pagina het vaakst voor open gaat. */}
            <tr className="border-t-2 border-zinc-700">
              <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 font-semibold text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
                Iedereen
              </td>
              {blok.maandTotalen.map((n, i) => (
                <Cijfer key={MAANDEN[i]} n={n} kleur={blok.kleur} sterk rij />
              ))}
              <Cijfer n={blok.totaal} kleur={blok.kleur} sterk links rij />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  )
}

function Cijfer({ n, kleur, sterk, links, rij }: {
  n: number
  kleur: string
  sterk?: boolean
  // Scheidingslijn links, om de totaalkolom van de maanden los te maken.
  links?: boolean
  // Staat in de totaalrij: andere achtergrond.
  rij?: boolean
}) {
  return (
    <td
      className={`px-2 py-1.5 text-center tabular-nums ${links ? 'border-l border-zinc-800' : ''} ${rij ? 'bg-zinc-900 py-2' : ''}`}
      style={n > 0
        ? { color: kleur, fontWeight: sterk ? 700 : 600, backgroundColor: rij ? undefined : `${kleur}14` }
        : { color: '#3f3f46' }}
    >
      {n > 0 ? n : '–'}
    </td>
  )
}
