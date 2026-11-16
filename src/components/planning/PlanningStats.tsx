'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, RefreshCw, Search, X } from 'lucide-react'
import { DUTCH_MONTHS, normName, type Person } from '@/lib/planning-config'
import {
  presetCategory, isArchived, telMeeInStats, type PlanningPreset,
} from '@/lib/planning-presets'
import { splitThuis } from '@/lib/planning-status'
import { formatDays } from '@/lib/planning-week'
import type { AfwezigeDag } from '@/lib/planning-stats'

interface StatRow { contactId: string; month: number; value: string; count: number }
interface StatsAntwoord { tellingen: StatRow[]; dagen?: AfwezigeDag[]; minYear: number | null; maxYear: number | null }

// Mensen met planning die nergens in het rooster staan. Komt voor wanneer
// iemand er tijdelijk uitgehaald is — sinds de planning aan contact-id's hangt
// is dat een normale, omkeerbare handeling.
const BUITEN_ROOSTER = 'Niet in het rooster'

const MAANDEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// Deze pagina gaat over afwezigheid, per persoon, en verder niets.
//
// Eén kleine card per persoon, gegroepeerd per afdeling zoals in het rooster:
// het jaartotaal per status en een strookje van twaalf maanden dat laat zien
// wanneer. Klik je erop, dan schuift een paneel open met elke afwezige dag en
// zijn notitie.
//
// Hiervoor stond er per persoon een volledige tabel van twaalf maanden, plus
// een blok "Iedereen". Met dertig man was dat dertig keer een tabel vol
// streepjes, en de dagen hingen los onder elk blok.
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

interface StatusRij { label: string; kleur: string; hoort: (statusKey: string) => boolean }
// Eén status van één persoon: per maand, het totaal, en de dagen erachter.
interface Cel { rij: StatusRij; waarden: number[]; totaal: number; dagen: AfwezigeDag[] }
interface Kaart { id: string; naam: string; dept: string; cellen: Cel[]; totaal: number; perMaand: number[]; notities: number }

// 'rooster' groepeert per afdeling; de rest is één lijst, hoogste eerst.
type Sortering = 'rooster' | 'naam' | 'totaal' | `status:${string}`
const ALLE = '__alle__'

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
  const [afdeling, setAfdeling] = useState(ALLE)
  const [sortering, setSortering] = useState<Sortering>('rooster')
  const [gekozen, setGekozen] = useState<string | null>(null)

  // Ophalen gebeurt niet meer bij elke tabwissel (het component blijft
  // gemonteerd), dus kan wat hier staat ouder zijn dan wat een collega net
  // invulde. Het raster hangt aan een realtime-socket, deze cijfers niet —
  // vandaar een knop in plaats van stilte.
  const [herlaad, setHerlaad] = useState(0)
  const [opgehaald, setOpgehaald] = useState<Date | null>(null)

  const [rows, setRows] = useState<StatRow[]>([])
  const [dagen, setDagen] = useState<AfwezigeDag[]>([])
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
        setDagen(body.dagen ?? [])
        setBereik({ min: body.minYear, max: body.maxYear })
        setOpgehaald(new Date())
      })
      .catch(e => {
        console.error('Statistieken ophalen mislukt:', e)
        setError(`Kon statistieken niet laden (${e instanceof Error ? e.message : 'onbekende fout'}).`)
      })
      .finally(() => setLoading(false))
  }, [year, herlaad])

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

    // In roostervolgorde: zo staan de afdelingen en de mensen erin zoals in
    // het raster. Wie er niet meer in staat, komt achteraan.
    return lijst
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

  // ── De cards ──────────────────────────────────────────────────────────────

  const dagenPerPersoon = useMemo(() => {
    const m = new Map<string, AfwezigeDag[]>()
    for (const d of dagen) {
      const lijst = m.get(d.contactId)
      if (lijst) lijst.push(d)
      else m.set(d.contactId, [d])
    }
    return m
  }, [dagen])

  const kaarten = useMemo<Kaart[]>(() => mensen.map(m => {
    const eigenDagen = dagenPerPersoon.get(m.id) ?? []
    const cellen = statusRijen.map(rij => {
      const waarden: number[] = Array(12).fill(0)
      for (const [statusKey, maanden] of tellingen.get(m.id) ?? []) {
        if (!rij.hoort(statusKey)) continue
        for (let i = 0; i < 12; i++) waarden[i] += maanden[i]
      }
      const celDagen = eigenDagen.filter(d => rij.hoort(splitThuis(d.value).base.toUpperCase()))
      return { rij, waarden, totaal: waarden.reduce((a, b) => a + b, 0), dagen: celDagen }
    })
    const perMaand = MAANDEN.map((_, i) => cellen.reduce((a, c) => a + c.waarden[i], 0))
    return {
      id: m.id, naam: m.naam, dept: m.dept, cellen, perMaand,
      totaal: cellen.reduce((a, c) => a + c.totaal, 0),
      notities: cellen.reduce((a, c) => a + c.dagen.filter(d => d.note).length, 0),
    }
  }), [mensen, statusRijen, tellingen, dagenPerPersoon])

  // Eén schaal voor alle strookjes, anders lijkt één dag verlof even hoog als
  // een maand. Minstens 5, zodat een enkele dag niet meteen tot de rand gaat.
  const schaal = useMemo(
    () => Math.max(5, ...kaarten.flatMap(k => k.perMaand)),
    [kaarten],
  )

  const afdelingen = useMemo(() => [...new Set(mensen.map(m => m.dept))], [mensen])

  const zoekend = zoek.trim().length > 0
  const zichtbaar = useMemo(() => {
    const q = normName(zoek)
    const lijst = kaarten.filter(k =>
      (afdeling === ALLE || k.dept === afdeling) && (!zoekend || normName(k.naam).includes(q)))
    if (sortering === 'rooster') return lijst
    const sleutel = (k: Kaart) =>
      sortering === 'totaal' ? k.totaal
        : sortering.startsWith('status:') ? (k.cellen.find(c => c.rij.label === sortering.slice(7))?.totaal ?? 0)
        : 0
    return [...lijst].sort((a, b) =>
      sortering === 'naam' ? a.naam.localeCompare(b.naam, 'nl') : sleutel(b) - sleutel(a) || a.naam.localeCompare(b.naam, 'nl'))
  }, [kaarten, afdeling, zoek, zoekend, sortering])

  // Per afdeling, in roostervolgorde. Alleen bij sorteren op rooster; anders
  // is het één lijst, want "meeste verlof" vergelijk je over de afdelingen heen.
  const groepen = useMemo(() => {
    if (sortering !== 'rooster') return [{ dept: null as string | null, kaarten: zichtbaar }]
    const m = new Map<string, Kaart[]>()
    for (const k of zichtbaar) {
      const g = m.get(k.dept)
      if (g) g.push(k)
      else m.set(k.dept, [k])
    }
    return [...m.entries()].map(([dept, ks]) => ({ dept: dept as string | null, kaarten: ks }))
  }, [zichtbaar, sortering])

  const gekozenKaart = gekozen ? kaarten.find(k => k.id === gekozen) ?? null : null

  const selectClass = 'px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600'

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Bediening ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={selectClass} aria-label="Jaar">
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

        <select value={afdeling} onChange={e => setAfdeling(e.target.value)} className={selectClass} aria-label="Afdeling">
          <option value={ALLE}>Alle afdelingen</option>
          {afdelingen.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select value={sortering} onChange={e => setSortering(e.target.value as Sortering)} className={selectClass} aria-label="Sorteren">
          <option value="rooster">Volgens rooster</option>
          <option value="naam">Op naam</option>
          <option value="totaal">Meeste afwezig</option>
          {statusRijen.map(r => <option key={r.label} value={`status:${r.label}`}>Meeste {r.label.toLowerCase()}</option>)}
        </select>

        <div className="flex items-center gap-2 ml-auto">
          {opgehaald && (
            <span className="text-[11px] text-zinc-600 tabular-nums hidden sm:inline">
              Bijgewerkt om {opgehaald.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => setHerlaad(n => n + 1)}
            disabled={loading}
            title="Opnieuw ophalen"
            aria-label="Opnieuw ophalen"
            className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {statusRijen.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">
            Er zijn nog geen afwezigheidsstatussen. Zet in Beheer → Presets een
            status op &ldquo;Afwezig&rdquo; en hij komt hier te staan.
          </p>
        ) : zichtbaar.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">
            {zoekend ? 'Geen naam gevonden.' : 'Niemand in deze afdeling.'}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {groepen.map(g => (
              <section key={g.dept ?? 'alles'}>
                {g.dept && (
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                    {g.dept} <span className="text-zinc-700">· {g.kaarten.length}</span>
                  </h3>
                )}
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {g.kaarten.map(k => (
                    <PersoonsKaart key={k.id} kaart={k} schaal={schaal} toonAfdeling={!g.dept}
                      onOpen={() => setGekozen(k.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {gekozenKaart && (
        <DetailPaneel kaart={gekozenKaart} year={year} schaal={schaal} onClose={() => setGekozen(null)} />
      )}
    </div>
  )
}

const MAAND_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

// Twaalf staafjes, elk gestapeld in de kleuren van de statussen. Laat zien
// wanneer iemand afwezig was zonder er een tabel van te maken.
function MaandStrook({ cellen, schaal, hoogte, labels }: {
  cellen: Cel[]; schaal: number; hoogte: number; labels?: boolean
}) {
  return (
    <div>
      <div className="grid grid-cols-12 gap-[3px] items-end" style={{ height: hoogte }}>
        {MAANDEN.map((_, i) => {
          const totaal = cellen.reduce((a, c) => a + c.waarden[i], 0)
          return (
            <div key={i} className="relative h-full rounded-[2px] bg-zinc-800/50 overflow-hidden flex flex-col-reverse"
              title={totaal > 0 ? `${DUTCH_MONTHS[i]}: ${cellen.filter(c => c.waarden[i] > 0).map(c => `${c.rij.label} ${formatDays(c.waarden[i])}`).join(', ')}` : DUTCH_MONTHS[i]}>
              {cellen.map(c => c.waarden[i] > 0 && (
                <div key={c.rij.label} style={{ height: `${Math.min(100, (c.waarden[i] / schaal) * 100)}%`, backgroundColor: c.rij.kleur }} />
              ))}
            </div>
          )
        })}
      </div>
      {labels && (
        <div className="grid grid-cols-12 gap-[3px] mt-1">
          {MAAND_LETTERS.map((l, i) => <span key={i} className="text-center text-[9px] text-zinc-600">{l}</span>)}
        </div>
      )}
    </div>
  )
}

function StatusCijfers({ cellen, groot }: { cellen: Cel[]; groot?: boolean }) {
  return (
    <div className={`flex flex-wrap ${groot ? 'gap-x-4 gap-y-1.5' : 'gap-x-3 gap-y-1'}`}>
      {cellen.map(c => (
        <span key={c.rij.label} className={`inline-flex items-center gap-1.5 ${groot ? 'text-sm' : 'text-xs'}`}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.totaal > 0 ? c.rij.kleur : '#3f3f46' }} />
          <span className={c.totaal > 0 ? 'text-zinc-300' : 'text-zinc-600'}>{c.rij.label}</span>
          <span className={`tabular-nums font-semibold ${c.totaal > 0 ? '' : 'text-zinc-700'}`}
            style={c.totaal > 0 ? { color: c.rij.kleur } : undefined}>
            {c.totaal > 0 ? formatDays(c.totaal) : '–'}
          </span>
        </span>
      ))}
    </div>
  )
}

function PersoonsKaart({ kaart, schaal, toonAfdeling, onOpen }: {
  kaart: Kaart; schaal: number; toonAfdeling: boolean; onOpen: () => void
}) {
  const leeg = kaart.totaal === 0
  return (
    <button
      onClick={onOpen}
      className={`group text-left rounded-xl border px-3.5 py-3 transition-colors ${
        leeg ? 'border-zinc-900 bg-zinc-950 hover:border-zinc-800' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
      }`}
    >
      <div className="flex items-baseline gap-2 mb-2 min-w-0">
        <span className={`text-sm font-medium truncate ${leeg ? 'text-zinc-500' : 'text-zinc-100'}`}>{kaart.naam}</span>
        {toonAfdeling && <span className="text-[11px] text-zinc-600 truncate">{kaart.dept}</span>}
      </div>
      <StatusCijfers cellen={kaart.cellen} />
      <div className="mt-2.5">
        <MaandStrook cellen={kaart.cellen} schaal={schaal} hoogte={14} />
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-600">
        <span className="tabular-nums">
          {leeg ? 'Niets opgenomen' : `${formatDays(kaart.totaal)} ${kaart.totaal === 1 ? 'dag' : 'dagen'}`}
          {kaart.notities > 0 && ` · ${kaart.notities} ${kaart.notities === 1 ? 'notitie' : 'notities'}`}
        </span>
        <ChevronRight size={12} className="ml-auto text-zinc-700 group-hover:text-zinc-400 transition-colors" />
      </div>
    </button>
  )
}

const KORTE_DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const HELFT_KORT = { vm: '½ VM', nm: '½ NM' } as const

// Eén persoon in detail: totalen, de maanden, en elke afwezige dag met zijn
// notitie, per maand. Van rechts op desktop, over het hele scherm op een gsm.
function DetailPaneel({ kaart, year, schaal, onClose }: {
  kaart: Kaart; year: number; schaal: number; onClose: () => void
}) {
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const kleurVan = new Map(kaart.cellen.map(c => [c.rij.label, c.rij.kleur]))
  const dagen = kaart.cellen
    .filter(c => !filter || c.rij.label === filter)
    .flatMap(c => c.dagen.map(d => ({ ...d, label: c.rij.label })))
    .sort((a, b) => a.month - b.month || a.day - b.day || (a.helft === 'nm' ? 1 : 0) - (b.helft === 'nm' ? 1 : 0))

  const perMaand = new Map<number, typeof dagen>()
  for (const d of dagen) {
    const g = perMaand.get(d.month)
    if (g) g.push(d)
    else perMaand.set(d.month, [d])
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={kaart.naam} className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div onClick={e => e.stopPropagation()}
        className="relative h-full w-full sm:max-w-md bg-zinc-950 sm:border-l border-zinc-800 shadow-2xl flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-100 truncate">{kaart.naam}</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {kaart.dept} · {year} · {formatDays(kaart.totaal)} {kaart.totaal === 1 ? 'dag' : 'dagen'} afwezig
              </p>
            </div>
            <button onClick={onClose} aria-label="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 mt-0.5">
              <X size={16} />
            </button>
          </div>
          <div className="mt-3">
            <StatusCijfers cellen={kaart.cellen} groot />
          </div>
          <div className="mt-3">
            <MaandStrook cellen={kaart.cellen} schaal={schaal} hoogte={36} labels />
          </div>
        </div>

        {/* Filter op status. Alleen de statussen waar echt dagen op staan. */}
        {kaart.cellen.some(c => c.dagen.length > 0) && (
          <div className="px-5 py-2.5 border-b border-zinc-900 flex flex-wrap gap-1.5 flex-shrink-0">
            {[null, ...kaart.cellen.filter(c => c.dagen.length > 0).map(c => c.rij.label)].map(label => {
              const actief = filter === label
              return (
                <button key={label ?? 'alle'} onClick={() => setFilter(label)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                    actief ? 'border-zinc-600 bg-zinc-800 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {label && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: kleurVan.get(label) }} />}
                  {label ?? 'Alles'}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {dagen.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-600">Geen afwezige dagen in {year}.</p>
          ) : (
            [...perMaand.entries()].map(([maand, ds]) => (
              <div key={maand} className="mb-4 last:mb-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">{DUTCH_MONTHS[maand - 1]}</p>
                <ul>
                  {ds.map((d, i) => {
                    const wd = new Date(year, d.month - 1, d.day).getDay()
                    return (
                      <li key={`${d.day}-${d.helft}-${i}`} className="flex items-start gap-3 py-1.5 border-b border-zinc-900 last:border-0 text-xs">
                        <span className="w-14 flex-shrink-0 tabular-nums text-zinc-500 pt-px">{KORTE_DAGEN[wd]} {d.day}</span>
                        <span className="w-28 flex-shrink-0 flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: kleurVan.get(d.label) }} />
                          <span className="truncate text-zinc-300">{d.label}</span>
                          {d.helft !== 'dag' && <span className="flex-shrink-0 text-[10px] text-zinc-500">{HELFT_KORT[d.helft]}</span>}
                        </span>
                        <span className={`min-w-0 flex-1 break-words whitespace-pre-wrap ${d.note ? 'text-zinc-200' : 'text-zinc-700'}`}>
                          {d.note ?? '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
