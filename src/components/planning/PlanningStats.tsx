'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { DUTCH_MONTHS, type Person } from '@/lib/planning-config'
import type { PlanningPreset } from '@/lib/planning-presets'
import { allStatusOptions, splitThuis } from './DayEditor'

interface StatRow { contactId: string; value: string; count: number }

// Mensen met planning die nergens in het rooster staan. Komt voor wanneer
// iemand er tijdelijk uitgehaald is — sinds de planning aan contact-id's hangt
// is dat een normale, omkeerbare handeling.
const BUITEN_ROOSTER = 'Niet in het rooster'

// Overig, Gewerkt, Afwezig, Totaal, w.v. thuis — de vaste kolommen rechts van
// de statussen. Eén getal, zodat de colSpans niet uit de pas kunnen lopen met
// wat er echt staat.
const KOLOMMEN_NA_STATUS = 5

// Eén cel met een getal, of een streepje als er niets is. Stond vijf keer
// bijna identiek in de tabel.
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

// A monthly (or yearly) tally per person, per status — "did Kenny take 15
// Verlof days this month" at a glance, without counting cells by hand. Not
// balance-vs-allotment (no entitlement number exists anywhere yet) — just a
// clean count of what's actually in the planning for the chosen period.
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
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState<number | null>(currentMonth)
  const [rows, setRows] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ year: String(year) })
    if (month) params.set('month', String(month))
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
  }, [year, month])

  // Zonder de THUIS-varianten, want die vallen onder hun eigen status: een
  // dag "PS - THUIS" is een PS-dag, ergens anders gedaan. Ze apart tellen
  // splitste het aantal PS-dagen van iemand over twee kolommen.
  //
  // Hoe vaak er thuis gewerkt is blijft wel zichtbaar, in één kolom aan het
  // eind — dat is de vraag die je er echt over stelt.
  // Zonder de THUIS-varianten — maar alleen als hun basis ook bestaat. Een
  // losse "X - THUIS" zonder "X" zou anders uit de kolommen vallen en in
  // "Overig" belanden, terwijl het gewoon een status is.
  const options = useMemo(() => {
    const all = allStatusOptions(presets)
    const names = new Set(all.map(o => o.name.toUpperCase()))
    return all.filter(o => {
      const { base, thuis } = splitThuis(o.name)
      return !thuis || !names.has(base.toUpperCase())
    })
  }, [presets])

  const afwezigNames = useMemo(
    () => new Set(options.filter(o => o.category === 'afwezig').map(o => o.name.toUpperCase())),
    [options]
  )
  const optionNames = useMemo(
    () => new Set(options.map(o => o.name.toUpperCase())),
    [options]
  )

  // Keyed by the UPPERCASE value on purpose — every saved cell's value is
  // always uppercased (see DayEditor's handleSave), but a preset's display
  // name usually isn't ("Recup", "Verlof", "De Spor", ...). Comparing the
  // raw strings meant any preset whose name wasn't already all-caps (so,
  // most of them) silently showed 0 here regardless of real data —
  // "SHG"/"NB"/"PS" happened to look right purely by accident of already
  // being uppercase to begin with.
  //
  // Op contact-id, want dat is de persoon.
  const countsByEmployee = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const r of rows) {
      // "PS - THUIS" telt mee onder PS. Optellen en niet overschrijven, want
      // beide varianten komen als eigen rij binnen.
      const { base } = splitThuis(r.value)
      const key = base.toUpperCase()
      const byValue = m.get(r.contactId) ?? new Map<string, number>()
      byValue.set(key, (byValue.get(key) ?? 0) + r.count)
      m.set(r.contactId, byValue)
    }
    return m
  }, [rows])

  const thuisByEmployee = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (!splitThuis(r.value).thuis) continue
      m.set(r.contactId, (m.get(r.contactId) ?? 0) + r.count)
    }
    return m
  }, [rows])

  // Wie hoort er in deze tabel?
  //
  // Niet "de ploeg van vandaag", maar "wie er in deze periode werkte". Vraag
  // je juni op, dan hoort de stagiair die eind juni vertrok erbij — en de
  // collega die pas in september begon niet. Het raster doet dit sinds vorige
  // week ook zo; dit scherm bleef achter en toonde de huidige ploeg, met
  // streepjes voor wie al weg was.
  //
  // Daarom drie soorten: actieve roosterleden (altijd), gearchiveerde leden
  // die in deze periode dagen hebben, en mensen die helemaal niet meer in het
  // rooster staan maar wél dagen hebben. Die laatste groep verdween hiervoor
  // zonder melding uit de telling.
  const groups = useMemo(() => {
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

  // Per persoon één regel met alle getallen erin, zodat de tabel en de
  // totaalrij exact hetzelfde rekenen.
  const cijfersVoor = useMemo(() => {
    return (id: string) => {
      const byValue = countsByEmployee.get(id)
      const perStatus = new Map<string, number>()
      let gewerkt = 0
      let afwezig = 0
      let overig = 0
      for (const [value, n] of byValue ?? []) {
        perStatus.set(value, n)
        if (!optionNames.has(value)) overig += n
        else if (afwezigNames.has(value)) afwezig += n
        else gewerkt += n
      }
      return {
        perStatus,
        gewerkt,
        afwezig,
        overig,
        thuis: thuisByEmployee.get(id) ?? 0,
        totaal: gewerkt + afwezig + overig,
      }
    }
  }, [countsByEmployee, optionNames, afwezigNames, thuisByEmployee])

  // De hele ploeg bij elkaar, uit dezelfde cijfersVoor() als de rijen —
  // zodat de totaalrij niet op zijn eigen manier kan gaan rekenen.
  const totaalRij = useMemo(() => {
    const perStatus = new Map<string, number>()
    let gewerkt = 0, afwezig = 0, overig = 0, thuis = 0, totaal = 0
    // Eén keer per persoon, niet per rij: iemand mag bewust in twee
    // afdelingen staan en zou dan dubbel meetellen.
    const geteld = new Set<string>()
    for (const g of groups) {
      for (const p of g.employees) {
        if (geteld.has(p.id)) continue
        geteld.add(p.id)
        const c = cijfersVoor(p.id)
        for (const [k, n] of c.perStatus) perStatus.set(k, (perStatus.get(k) ?? 0) + n)
        gewerkt += c.gewerkt
        afwezig += c.afwezig
        overig += c.overig
        thuis += c.thuis
        totaal += c.totaal
      }
    }
    return { perStatus, gewerkt, afwezig, overig, thuis, totaal }
  }, [groups, cijfersVoor])

  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month ?? 'jaar'}
          onChange={e => setMonth(e.target.value === 'jaar' ? null : Number(e.target.value))}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          <option value="jaar">Heel jaar</option>
          {DUTCH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-zinc-950 px-3 py-2 text-left font-semibold text-zinc-400 border-b border-r border-zinc-800 whitespace-nowrap">
                Naam
              </th>
              {options.map(opt => (
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
              {/* Gewerkt en afwezig apart, want "totaal" alleen zegt weinig:
                  twintig dagen waarvan vijf verlof is iets anders dan twintig
                  gewerkte dagen. Kan sinds presets een categorie hebben. */}
              <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-400 border-b border-l border-zinc-800 whitespace-nowrap">
                Gewerkt
              </th>
              <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-400 border-b border-zinc-800 whitespace-nowrap">
                Afwezig
              </th>
              <th className="sticky top-0 z-10 bg-zinc-950 px-3 py-2 text-center font-semibold text-zinc-300 border-b border-zinc-800 whitespace-nowrap">
                Totaal
              </th>
              {/* Achter het totaal, want dit is een deelverzameling en geen
                  eigen categorie: een dag thuis zit al in zijn statuskolom.
                  Stond hij ertussen, dan telde je de rij op en kwam je te
                  hoog uit. */}
              <th
                className="sticky top-0 z-10 bg-zinc-950 px-2 py-2 text-center font-medium text-zinc-500 border-b border-l border-zinc-800 whitespace-nowrap"
                title="Hoeveel van die dagen thuis gewerkt zijn — zit al in de kolommen hierboven"
              >
                w.v. thuis
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <Fragment key={g.name}>
                <tr>
                  <td
                    colSpan={KOLOMMEN_NA_STATUS + options.length + 1}
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
                      {options.map(opt => {
                        const count = c.perStatus.get(opt.name.toUpperCase()) ?? 0
                        return (
                          <td
                            key={opt.name}
                            className="px-2 py-1.5 text-center tabular-nums"
                            style={count > 0 ? { backgroundColor: `${opt.color}18`, color: opt.color, fontWeight: 600 } : { color: '#3f3f46' }}
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

            {/* Eén regel voor de hele ploeg. "Hoeveel verlofdagen nam het team
                in juni" is waarschijnlijk de meest gestelde vraag van deze
                pagina, en die stond er niet. */}
            {groups.length > 0 && (
              <tr className="border-t-2 border-zinc-700">
                <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 font-semibold text-zinc-200 border-r border-zinc-800 whitespace-nowrap">
                  Iedereen
                </td>
                {options.map(opt => {
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
            )}

            {groups.length === 0 && (
              <tr>
                <td colSpan={KOLOMMEN_NA_STATUS + options.length + 1} className="py-8 text-center text-zinc-600">
                  Geen medewerkers om te tonen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
