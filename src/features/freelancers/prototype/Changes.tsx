'use client'

import { Modal } from '@/components/poolwagens/ui'
import { Button } from '@/components/materiaal/ui'

// Wat verandert er tegenover de huidige schermen, wat verdwijnt, en waarom.

const CHANGES: { screen: string; items: [string, string][] }[] = [
  { screen: 'Freelancerlijst', items: [
    ['Eén zoekbalk + Discipline ▾ + Status ▾ + "Nu beschikbaar", in plaats van rijen statusknoppen en disciplinechips.', 'Minder knoppen op het scherm; de filters die je zelden gebruikt zitten in een menu.'],
    ['Standaard iedereen behalve inactief.', 'Een nieuwe kandidaat verdween uit de lijst (bug 2).'],
    ['Vier kolommen: Naam (disciplines eronder), Beoordeling, Beschikbaarheid, Laatste opdracht (datum + titel). Klik op een kop om te sorteren.', '"LOP." en "LAATSTE" waren onduidelijk; disciplinechips namen een hele kolom in.'],
    ['Eén cijfer voor de beoordeling: het gemiddelde van de opdrachten, of het teamoordeel als er nog geen opdrachten zijn.', 'Twee cijfers naast elkaar ("★ 4 · opdrachten 4,3 (7)") lazen als ruis.'],
  ] },
  { screen: 'Profiel', items: [
    ['Eén pagina zonder tabbladen: links wie het is, rechts Lopend en Eerder.', 'Opdrachten en gegevens staan zo samen; minder klikken.'],
    ['Eén knop "Bewerken" opent één formulier met alles.', 'Zes potloodjes, elk met eigen Opslaan/Annuleren, gaven bug 5.'],
    ['Link & pincode als kaartje op het profiel.', 'Was een apart tabblad voor twee knoppen.'],
  ] },
  { screen: 'Opdrachtenbord', items: [
    ['Kolommen in de volgorde van het werk: Concept · Wacht op freelancer · Bezig · Na te kijken · Afgerond.', 'De groepen "Wacht op ons / Gedeeld / Lopend / Recent afgerond" volgden de status, niet wat jij moet doen.'],
    ['Afgerond (30 dagen) staat dichtgeklapt; geweigerd en geannuleerd zitten achter "Gesloten".', 'Geweigerd stond onder "Recent afgerond" (bug 1).'],
    ['Filters op freelancer en klant. Op de gsm: tabbladen met aantallen, standaard "Na te kijken".', 'Op de gsm moest je door alle groepen scrollen.'],
    ['Kaart: titel, wie, klant, deadline en hooguit één signaal.', 'Minder badges.'],
  ] },
  { screen: 'Opdracht (paneel)', items: [
    ['Bovenaan één zin over waar het staat ("Jana heeft opgeleverd — na te kijken") en hooguit één hoofdknop.', 'Een zin zegt meteen wat er van jou verwacht wordt; de statusstepper en de rij knoppen toonden vooral alle mogelijkheden.'],
    ['Na te kijken: "Goedkeuren" (afronden + score in één stap) en "Terugsturen met feedback".', 'Afronden en review waren twee stappen; zo kan de review niet vergeten worden en bestaat "afgerond zonder review" niet meer.'],
    ['Geweigerd: "Iemand anders kiezen" maakt een kopie (titel, briefing, bijlagen) en deelt die met de nieuwe freelancer. De geweigerde blijft bij de eerste staan.', 'Nu moet je de opdracht helemaal opnieuw aanmaken. Een kopie houdt de geschiedenis van elke freelancer juist.'],
    ['Bewerken, annuleren, heropenen en verwijderen zitten in het menu "…".', 'Eén hoofdknop per scherm.'],
    ['Geschiedenis staat dichtgeklapt.', 'Zelden nodig, nam veel plaats in.'],
  ] },
  { screen: 'Nieuwe opdracht', items: [
    ['Volgorde: wat moet er gebeuren → voor wie en wanneer → bijlagen → wie doet het.', 'Je weet wat je wilt voor je weet wie het doet; de aanbeveling heeft de discipline en deadline nodig.'],
    ['Drie aanbevolen freelancers bovenaan, met waarom; de rest achter "Iemand anders kiezen".', 'In de meeste gevallen kies je uit een handvol mensen; de volledige lijst blijft een klik verder.'],
    ['Na het bewaren kom je altijd in het opdrachtpaneel. Mislukt een bijlage, dan wordt er niet gedeeld en zie je daar "Opnieuw uploaden en delen" of "Delen zonder bijlage".', 'Bug 7: opnieuw proberen maakte een tweede opdracht, en wijzigingen na een fout gingen stil verloren.'],
    ['De hoofdknop heet "Delen met Jana".', 'Je ziet meteen naar wie het gaat.'],
  ] },
]

const GONE: [string, string][] = [
  ['Statusstepper in het opdrachtpaneel', 'Vervangen door één zin.'],
  ['Tarief als kolom in de lijst', 'Staat op het profiel; in de lijst kies je op wie, niet op prijs.'],
  ['Bel- en mailknoppen op de kaarten in de lijst (gsm)', 'Staan bovenaan het profiel; de kaart in de lijst wordt rustiger.'],
  ['Tabbladen op het profiel (Overzicht · Opdrachten · Link & pincode)', 'Eén pagina.'],
  ['De groep "Wacht op ons" met "afgerond zonder review"', 'Goedkeuren vraagt meteen een score.'],
]

const UNCHANGED = [
  'De freelancerlink /f en alles wat de freelancer ziet: niets verandert.',
  'Statussen, rechten (bekijken/beheren), pincodes en bestanden rechtstreeks via Drive: zoals nu.',
  'De app mailt nooit zelf; na delen of feedback krijg je de herinnering om zelf een seintje te sturen.',
  'De aanbeveling in het prototype is een eenvoudige regel; in de echte schermen blijft de AI-suggestie van nu erbij.',
]

export default function Changes({ onClose }: { onClose: () => void }) {
  return (
    <Modal wide title="Wat verandert er, en waarom" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Sluiten</Button>}>
      {CHANGES.map(c => (
        <section key={c.screen}>
          <h3 className="mb-2 text-sm font-semibold text-zinc-100">{c.screen}</h3>
          <ul className="space-y-2">{c.items.map(([what, why]) => <li key={what} className="text-sm"><p className="text-zinc-200">{what}</p><p className="text-zinc-500">Waarom: {why}</p></li>)}</ul>
        </section>
      ))}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-100">Verdwijnt</h3>
        <ul className="space-y-1.5">{GONE.map(([what, why]) => <li key={what} className="text-sm"><span className="text-zinc-200">{what}</span> <span className="text-zinc-500">— {why}</span></li>)}</ul>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-100">Blijft zoals het is</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">{UNCHANGED.map(u => <li key={u}>{u}</li>)}</ul>
      </section>
    </Modal>
  )
}
