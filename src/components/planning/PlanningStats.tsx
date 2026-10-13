'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { DUTCH_MONTHS, normName, type Person } from '@/lib/planning-config'
import type { PlanningPreset } from '@/lib/planning-presets'
import { allStatusOptions, splitThuis, type StatusOption } from './DayEditor'

interface StatRow { contactId: string; month: number; value: string; count: number }

// Mensen met planning die nergens in het rooster staan. Komt voor wanneer
// iemand er tijdelijk uitgehaald is — sinds de planning aan contact-id's hangt
// is dat een normale, omkeerbare handeling.
const BUITEN_ROOSTER = 'Niet in het rooster'

// Twee vragen, twee tabellen.
//
// Hiervoor was er één tabel die alles tegelijk telde: 32 mensen bij 15
// statussen, waarin klanten en afwezigheid door elkaar stonden. Die
// beantwoordde allebei de vragen half. "Wie zat waar in oktober" en "hoeveel
// recupdagen nam Luther dit jaar" zijn verschillende dingen, en de tweede is
// waar deze pagina volgens het team vooral voor dient.
type Mode = 'maand' | 'jaar'

// Welke statussen je in de maandtabel wil zien. Verlof en Ziek tussen de
// klanten zetten maakt beide kolommen moeilijker te lezen; apart zijn het er
// vier en zes in plaats van vijftien.
type Weergave = 'afwezig' | 'werk' | 'alles'

const WEERGAVE_LABELS: Record<Weergave, string> = {
  afwezig: 'Afwezigheid',
  werk:    'Werk',
  alles:   'Alles',
}

// Overig, Gewerkt, Afwezig, Totaal, w.v. thuis — de vaste kolommen rechts van
// de statussen. Eén getal, zodat de colSpans niet uit de pas kunnen lopen.
const KOLOMMEN_NA_STATUS = 5

function Cijfer({ n, sterk, links, rij }: {
  n: number
  sterk?: boolean
  // Scheidingslijn links, om een groep kolommen van de vorige los te maken.
  links?: boolean
  // Staat in de totaalrij: andere achtergrond.
  rij?: boolean
}) {
  return (
    <td
      className={`px-2 py-1.5 text-center tabular-nums ${links ? 'border-l border-zinc-800' : ''} ${rij ? 'bg-zinc-900 py-2' : ''}`}
      style={n > 0
        ? { color: sterk ? '#d4d4d8' : '#a1a1aa', fontWeight: 600 }
        : { color: '#3f3f46' }}
    >
      {n > 0 ? n : '–'}
    </td>
  )
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
  const [currentMonth] = useState(() => new Date().getMonth() + 1)

  const [mode, setMode] = useState<Mode>('maand')
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [weergave, setWeergave] = useState<Weergave>('afwezig')
  const [zoek, setZoek] = useState('')
  const [toonLege, setToonLege] = useState(false)
  // Verlof is waar deze pagina volgens het team vooral voor dient, dus dat is
  // de startwaarde — maar alleen als die status bestaat.
  const [statusVoorJaar, setStatusVoorJaar] = useState('Verlof')

  const [rows, setRows] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // In maandweergave halen we één maand op, in jaarweergave het hele jaar.
  // Dat scheelt een factor twaalf voor de vraag die het vaakst gesteld wordt.
  const vraagMaand = mode === 'maand' ? month : null

  useEffect(() => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ year: String(year) })
    if (vraagMaand) params.set('month', String(vraagMaand))
    fetch(`/api/planning/stats?${params}`)
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
  }, [year, vraagMaand])

  // ── Statussen ─────────────────────────────────────────────────────────────

  // Zonder de THUIS-varianten — maar alleen als hun basis ook bestaat. Een
  // losse "X - THUIS" zonder "X" zou anders uit de kolommen vallen en in
  // "Overig" belanden, terwijl het gewoon een status is.
  const alleStatussen = useMemo(() => {
    const all = allStatusOptions(presets)
    const names = new Set(all.map(o => o.name.toUpperCase()))
    return all.filter(o => {
      const { base, thuis } = splitThuis(o.name)
      return !thuis || !names.has(base.toUpperCase())
    })
  }, [presets])

  const afwezigNames = useMemo(
    () => new Set(alleStatussen.filter(o => o.category === 'afwezig').map(o => o.name.toUpperCase())),
    [alleStatussen]
  )
  const alleNames = useMemo(
    () => new Set(alleStatussen.map(o => o.name.toUpperCase())),
    [alleStatussen]
  )

  // ── Tellingen ─────────────────────────────────────────────────────────────

  // Per persoon per status, met "PS - THUIS" meegeteld onder PS: een dag thuis
  // is nog steeds een PS-dag. Hoe vaak er thuis gewerkt is staat apart.
  const perPersoon = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const r of rows) {
      const key = splitThuis(r.value).base.toUpperCase()
      const byValue = m.get(r.contactId) ?? new Map<string, number>()
      byValue.set(key, (byValue.get(key) ?? 0) + r.count)
      m.set(r.contactId, byValue)
    }
    return m
  }, [rows])

  const thuisPerPersoon = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (!splitThuis(r.value).thuis) continue
      m.set(r.contactId, (m.get(r.contactId) ?? 0) + r.count)
    }
    return m
  }, [rows])

  const cijfersVoor = useMemo(() => {
    return (id: string) => {
      const byValue = perPersoon.get(id)
      const perStatus = new Map<string, number>()
      let gewerkt = 0
      let afwezig = 0
      let overig = 0
      for (const [value, n] of byValue ?? []) {
        perStatus.set(value, n)
        if (!alleNames.has(value)) overig += n
        else if (afwezigNames.has(value)) afwezig += n
        else gewerkt += n
      }
      return {
        perStatus, gewerkt, afwezig, overig,
        thuis: thuisPerPersoon.get(id) ?? 0,
        totaal: gewerkt + afwezig + overig,
      }
    }
  }, [perPersoon, alleNames, afwezigNames, thuisPerPersoon])

  // ── Wie staat er in de tabel ──────────────────────────────────────────────

  // Niet "de ploeg van vandaag", maar "wie er in deze periode werkte". Vraag je
  // juni op, dan hoort de stagiair die eind juni vertrok erbij. Het raster doet
  // dit ook zo; dit scherm toonde de huidige ploeg, met streepjes voor wie al
  // weg was.
  const groepen = useMemo(() => {
    const metData = new Set(rows.map(r => r.contactId))
    const byDept = new Map<string, Person[]>()
    const geplaatst = new Set<string>()

    for (const p of people) {
      if (archived.includes(p.id) && !metData.has(p.id)) continue
      geplaatst.add(p.id)
      const list = byDept.get(p.dept) ?? []
      list.push(p)
      byDept.set(p.dept, list)
    }

    const losse: Person[] = []
    for (const id of metData) {
      if (geplaatst.has(id)) continue
      const naam = nameFor(id)
      if (naam) losse.push({ id, dept: BUITEN_ROOSTER, emp: naam })
    }

    const result = [...byDept.entries()].map(([name, employees]) => ({ name, employees }))
    if (losse.length > 0) {
      result.push({
        name: BUITEN_ROOSTER,
        employees: losse.sort((a, b) => a.emp.localeCompare(b.emp, 'nl')),
      })
    }
    return result
  }, [people, archived, rows, nameFor])

  // Bestaat de gekozen status niet (meer), val dan terug op de eerste. Zonder
  // dit toont het jaaroverzicht stil een lege tabel.
  useEffect(() => {
    if (alleStatussen.length === 0) return
    if (alleStatussen.some(o => o.name === statusVoorJaar)) return
    setStatusVoorJaar(alleStatussen[0].name)
  }, [alleStatussen, statusVoorJaar])

  const years = [currentYear - 1, currentYear, currentYear + 1]

  // ── Maandtabel ────────────────────────────────────────────────────────────

  const zichtbareStatussen = useMemo(() => {
    const perWeergave: StatusOption[] =
      weergave === 'alles' ? alleStatussen
      : weergave === 'afwezig' ? alleStatussen.filter(o => o.category === 'afwezig')
      : alleStatussen.filter(o => o.category !== 'afwezig')

    if (toonLege) return perWeergave
    // Een status waar in deze periode niemand op staat is een lege kolom.
    // Verbergen scheelt vooral bij statussen die een maand lang ongebruikt
    // blijven — een klant waar even niets loopt, of een preset die er net bij
    // gezet is.
    const gebruikt = new Set<string>()
    for (const r of rows) gebruikt.add(splitThuis(r.value).base.toUpperCase())
    return perWeergave.filter(o => gebruikt.has(o.name.toUpperCase()))
  }, [weergave, alleStatussen, rows, toonLege])

  // Zoeken gaat door de afdelingen heen: wie een naam typt wil hem vinden,
  // niet eerst moeten weten onder welke afdeling hij staat.
  const zoekend = zoek.trim().length > 0
  const zichtbareGroepen = useMemo(() => {
    const q = normName(zoek)
    return groepen
      .map(g => ({
        name: g.name,
        employees: g.employees.filter(p => {
          if (zoekend && !normName(p.emp).includes(q)) return false
          if (toonLege || zoekend) return true
          // Een rij zonder één getal zegt niets. Hij komt terug zodra er iets
          // ingevuld wordt, of met "toon ook lege".
          const c = cijfersVoor(p.id)
          return weergave === 'afwezig' ? c.afwezig > 0
            : weergave === 'werk' ? c.gewerkt + c.overig > 0
            : c.totaal > 0
        }),
      }))
      .filter(g => g.employees.length > 0)
  }, [groepen, zoek, zoekend, toonLege, cijfersVoor, weergave])

  const totaalRij = useMemo(() => {
    const perStatus = new Map<string, number>()
    let gewerkt = 0, afwezig = 0, overig = 0, thuis = 0, totaal = 0
    // Eén keer per persoon: iemand mag bewust in twee afdelingen staan.
    const geteld = new Set<string>()
    for (const g of zichtbareGroepen) {
      for (const p of g.employees) {
        if (geteld.has(p.id)) continue
        geteld.add(p.id)
        const c = cijfersVoor(p.id)
        for (const [k, n] of c.perStatus) perStatus.set(k, (perStatus.get(k) ?? 0) + n)
        gewerkt += c.gewerkt; afwezig += c.afwezig; overig += c.overig
        thuis += c.thuis; totaal += c.totaal
      }
    }
    return { perStatus, gewerkt, afwezig, overig, thuis, totaal }
  }, [zichtbareGroepen, cijfersVoor])

  const verborgenRijen = useMemo(() => {
    const zichtbaar = new Set(zichtbareGroepen.flatMap(g => g.employees.map(p => p.id)))
    return groepen.flatMap(g => g.employees).filter(p => !zichtbaar.has(p.id)).length
  }, [groepen, zichtbareGroepen])

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Bediening ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
          {(['maand', 'jaar'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {m === 'maand' ? 'Per maand' : 'Jaaroverzicht'}
            </button>
          ))}
        </div>

        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {mode === 'maand' ? (
          <>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
            >
              {DUTCH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
              {(Object.keys(WEERGAVE_LABELS) as Weergave[]).map(w => (
                <button
                  key={w}
                  onClick={() => setWeergave(w)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    weergave === w ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {WEERGAVE_LABELS[w]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <select
            value={statusVoorJaar}
            onChange={e => setStatusVoorJaar(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
          >
            {alleStatussen.map(o => <option key={o.name} value={o.name}>{o.name}</option>)}
          </select>
        )}

        <div className="relative max-w-[14rem] flex-1 min-w-[9rem]">
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

        {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {mode === 'maand' && !zoekend && verborgenRijen > 0 && (
        <button
          onClick={() => setToonLege(v => !v)}
          className="self-start text-[11px] text-zinc-600 hover:text-zinc-400 underline transition-colors flex-shrink-0"
        >
          {toonLege
            ? 'Verberg wie niets heeft staan'
            : `Toon ook wie niets heeft staan (${verborgenRijen})`}
        </button>
      )}

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-zinc-800">
        {mode === 'maand'
          ? <MaandTabel
              groepen={zichtbareGroepen}
              statussen={zichtbareStatussen}
              cijfersVoor={cijfersVoor}
              totaalRij={totaalRij}
            />
          : <JaarTabel
              groepen={zichtbareGroepen}
              rows={rows}
              status={statusVoorJaar}
            />}
      </div>
    </div>
  )
}

// ── Per maand: alle statussen naast elkaar ──────────────────────────────────

interface Groep { name: string; employees: Person[] }
interface Cijfers {
  perStatus: Map<string, number>
  gewerkt: number; afwezig: number; overig: number; thuis: number; totaal: number
}

function MaandTabel({ groepen, statussen, cijfersVoor, totaalRij }: {
  groepen: Groep[]
  statussen: StatusOption[]
  cijfersVoor: (id: string) => Cijfers
  totaalRij: Cijfers
}) {
  const breedte = statussen.length + KOLOMMEN_NA_STATUS + 1

  if (groepen.length === 0) {
    return <p className="py-12 text-center text-sm text-zinc-600">Niets gevonden voor deze periode.</p>
  }

  return (
    <table className="min-w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-20 bg-zinc-950 px-3 py-2 text-left font-semibold text-zinc-400 border-b border-r border-zinc-800 whitespace-nowrap">
            Naam
          </th>
          {statussen.map(opt => (
            <th
              key={opt.name}
              className="sticky top-0 z-10 bg-zinc-950 px-2 py-2 text-center font-medium border-b border-zinc-800 whitespace-nowrap"
              style={{ color: opt.color }}
            >
              {opt.name}
            </th>
          ))}
          <th
            className="sticky top-0 z-10 bg-zinc-950 px-2 py-2 text-center font-medium text-zinc-500 border-b border-zinc-800 whitespace-nowrap"
            title="Waarden die geen bestaande status zijn — bijvoorbeeld een preset die intussen verwijderd is"
          >
            Overig
          </th>
          <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-400 border-b border-l border-zinc-800 whitespace-nowrap">
            Gewerkt
          </th>
          <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-400 border-b border-zinc-800 whitespace-nowrap">
            Afwezig
          </th>
          <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-300 border-b border-zinc-800 whitespace-nowrap">
            Totaal
          </th>
          {/* Achter het totaal, want dit is een deelverzameling en geen eigen
              categorie: een dag thuis zit al in zijn statuskolom. Stond hij
              ertussen, dan telde je de rij op en kwam je te hoog uit. */}
          <th
            className="sticky top-0 z-10 bg-zinc-950 px-2 py-2 text-center font-medium text-zinc-500 border-b border-l border-zinc-800 whitespace-nowrap"
            title="Hoeveel van die dagen thuis gewerkt zijn — zit al in de kolommen hierboven"
          >
            w.v. thuis
          </th>
        </tr>
      </thead>
      <tbody>
        {groepen.map(g => (
          <Fragment key={g.name}>
            <tr>
              <td
                colSpan={breedte}
                className="sticky left-0 bg-zinc-900 px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"
              >
                {g.name}
                {g.name === BUITEN_ROOSTER && (
                  <span className="ml-2 normal-case tracking-normal text-zinc-600">
                    — hebben planning staan maar staan nergens in het rooster
                  </span>
                )}
              </td>
            </tr>
            {g.employees.map(person => {
              const c = cijfersVoor(person.id)
              return (
                <tr key={person.id} className="hover:bg-zinc-900/50">
                  <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-1.5 text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
                    {person.emp}
                  </td>
                  {statussen.map(opt => {
                    const count = c.perStatus.get(opt.name.toUpperCase()) ?? 0
                    return (
                      <td
                        key={opt.name}
                        className="px-2 py-1.5 text-center tabular-nums"
                        style={count > 0
                          ? { backgroundColor: `${opt.color}18`, color: opt.color, fontWeight: 600 }
                          : { color: '#3f3f46' }}
                      >
                        {count > 0 ? count : '–'}
                      </td>
                    )
                  })}
                  <Cijfer n={c.overig} />
                  <Cijfer n={c.gewerkt} sterk links />
                  <Cijfer n={c.afwezig} sterk />
                  <Cijfer n={c.totaal} sterk />
                  <Cijfer n={c.thuis} links />
                </tr>
              )
            })}
          </Fragment>
        ))}

        {/* Eén regel voor de hele ploeg. "Hoeveel verlofdagen nam het team in
            juni" is de vraag die hier het vaakst gesteld wordt. */}
        <tr className="border-t-2 border-zinc-700">
          <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 font-semibold text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
            Iedereen
          </td>
          {statussen.map(opt => {
            const count = totaalRij.perStatus.get(opt.name.toUpperCase()) ?? 0
            return (
              <td
                key={opt.name}
                className="bg-zinc-900 px-2 py-2 text-center tabular-nums font-semibold"
                style={count > 0 ? { color: opt.color } : { color: '#3f3f46' }}
              >
                {count > 0 ? count : '–'}
              </td>
            )
          })}
          <Cijfer n={totaalRij.overig} sterk rij />
          <Cijfer n={totaalRij.gewerkt} sterk links rij />
          <Cijfer n={totaalRij.afwezig} sterk rij />
          <Cijfer n={totaalRij.totaal} sterk rij />
          <Cijfer n={totaalRij.thuis} sterk links rij />
        </tr>
      </tbody>
    </table>
  )
}

// ── Per jaar: één status, twaalf maanden ────────────────────────────────────
//
// Dit is het antwoord op "hoeveel recupdagen nam Luther dit jaar, en wanneer".
// In de maandtabel moest je daarvoor twaalf keer van maand wisselen en elke
// keer één getal onthouden.

function JaarTabel({ groepen, rows, status }: {
  groepen: Groep[]
  rows: StatRow[]
  status: string
}) {
  // Per persoon per maand, alleen voor de gekozen status. "PS - THUIS" telt
  // mee onder PS, net als in de maandtabel.
  const perMaand = useMemo(() => {
    const wanted = status.toUpperCase()
    const m = new Map<string, Map<number, number>>()
    for (const r of rows) {
      if (splitThuis(r.value).base.toUpperCase() !== wanted) continue
      const perPers = m.get(r.contactId) ?? new Map<number, number>()
      perPers.set(r.month, (perPers.get(r.month) ?? 0) + r.count)
      m.set(r.contactId, perPers)
    }
    return m
  }, [rows, status])

  const maanden = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const perMaandTotaal = new Map<number, number>()
  let eindtotaal = 0

  const regels = groepen.flatMap(g =>
    g.employees.map(p => {
      const perPers = perMaand.get(p.id)
      const waarden = maanden.map(m => perPers?.get(m) ?? 0)
      const totaal = waarden.reduce((a, b) => a + b, 0)
      return { person: p, dept: g.name, waarden, totaal }
    })
  )

  // Alleen wie iets heeft: twaalf lege kolommen per persoon zegt niets, en met
  // 32 mensen vult dat het hele scherm.
  const metData = regels.filter(r => r.totaal > 0)
  for (const r of metData) {
    maanden.forEach((m, i) => perMaandTotaal.set(m, (perMaandTotaal.get(m) ?? 0) + r.waarden[i]))
    eindtotaal += r.totaal
  }

  if (metData.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-600">
        Niemand heeft {status} staan in dit jaar.
      </p>
    )
  }

  return (
    <table className="min-w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-20 bg-zinc-950 px-3 py-2 text-left font-semibold text-zinc-400 border-b border-r border-zinc-800 whitespace-nowrap">
            Naam
          </th>
          {maanden.map(m => (
            <th
              key={m}
              className="sticky top-0 z-10 bg-zinc-950 px-2 py-2 text-center font-medium text-zinc-400 border-b border-zinc-800 whitespace-nowrap"
            >
              {DUTCH_MONTHS[m - 1].slice(0, 3)}
            </th>
          ))}
          <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-300 border-b border-l border-zinc-800 whitespace-nowrap">
            Totaal
          </th>
        </tr>
      </thead>
      <tbody>
        {metData.map(r => (
          <tr key={r.person.id} className="hover:bg-zinc-900/50">
            <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-1.5 text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
              {r.person.emp}
              <span className="ml-2 text-[10px] text-zinc-600">{r.dept}</span>
            </td>
            {r.waarden.map((n, i) => <Cijfer key={maanden[i]} n={n} />)}
            <Cijfer n={r.totaal} sterk links />
          </tr>
        ))}
        <tr className="border-t-2 border-zinc-700">
          <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 font-semibold text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
            Iedereen
          </td>
          {maanden.map(m => <Cijfer key={m} n={perMaandTotaal.get(m) ?? 0} sterk rij />)}
          <Cijfer n={eindtotaal} sterk links rij />
        </tr>
      </tbody>
    </table>
  )
}
