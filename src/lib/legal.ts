// Gegevens die op de publieke pagina's staan: de homepage, /privacy en /terms.
// Google controleert die pagina's bij de verificatie van het OAuth-scherm, en
// Meta controleert /privacy bij de review van de Instagram-koppeling.
//
// Dit is de ENIGE plek voor bedrijfsgegevens en juridische verklaringen. Niets
// hiervan is verzonnen: elke waarde komt van SporthouseGroup zelf (antwoorden
// van 10 november 2026) of uit de privacyverklaring op sporthousegroup.com.
// Een veld dat `null` is, verschijnt op de pagina als "[To be completed: …]" —
// src/lib/__tests__/legal-complete.test.ts laat CI falen zodra dat gebeurt,
// zodat er nooit een open plek op productie belandt.
//
// JURIDISCH NAKIJKEN — door SporthouseGroup gekozen, niet door een jurist
// getoetst: legalBasis, transferSafeguards, contentRetention, governingLaw, en
// de verklaring over de Limited Use-vereisten van Google op /privacy.

export const LEGAL = {
  appName: 'Sporthouse Hub',
  operator: 'SporthouseGroup',

  // Uit de privacyverklaring op sporthousegroup.com ("Contact details").
  legalEntity: 'Sporthouse Group NV' as string | null,
  registeredAddress: 'Harensesteenweg 230, 1800 Vilvoorde, Belgium' as string | null,
  companyNumber: 'BE 0675.669.633' as string | null,

  // JURIDISCH NAKIJKEN. Belgisch recht gekozen; de rechtbank van Leuven komt
  // uit de algemene voorwaarden op sporthousegroup.com (art. 12). Let op: de
  // zetel is Vilvoorde — is Leuven niet (meer) juist, pas dan enkel deze regel aan.
  governingLaw: 'These terms are governed by Belgian law. The courts of Leuven have exclusive jurisdiction.' as string | null,

  supervisoryAuthority:
    'the Belgian Data Protection Authority (Gegevensbeschermingsautoriteit), www.dataprotectionauthority.be' as string | null,

  /** Supabase-dashboard → Project Settings → General. */
  databaseRegion: 'EU (Ireland)' as string | null,

  // JURIDISCH NAKIJKEN. Gekozen: enkel gerechtvaardigd belang.
  legalBasis:
    "We process this data on the basis of SporthouseGroup's legitimate interest in organising its work and collaborating with its staff and freelancers (Article 6(1)(f) GDPR)." as string | null,

  // JURIDISCH NAKIJKEN. Bewust neutraal: er is (nog) niet bevestigd welke
  // verwerkersovereenkomsten en doorgiftemechanismen er per dienst gelden.
  transferSafeguards:
    'Some of these providers may process data outside the European Economic Area. Contact us for information on the safeguards in place.' as string | null,

  // JURIDISCH NAKIJKEN. Back-ups: opgegeven door SporthouseGroup. Overige
  // inhoud: zoals het platform werkt — er is geen automatische verwijdertermijn.
  contentRetention:
    'Other content is kept until it is deleted in the platform. The database is backed up daily, and each backup is kept for one week.' as string | null,

  /** Contactadres voor privacyvragen en verwijderverzoeken. */
  contactEmail: 'weare@sporthousegroup.com',

  privacyLastUpdated: '10 November 2026',
  termsLastUpdated: '10 November 2026',
} as const
