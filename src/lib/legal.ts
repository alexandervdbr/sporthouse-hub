// Gegevens die op de publieke pagina's staan: de homepage, /privacy en /terms.
// Google controleert die pagina's bij de verificatie van het OAuth-scherm, en
// Meta controleert /privacy bij de review van de Instagram-koppeling.
//
// Dit is de ENIGE plek voor bedrijfsgegevens en juridische verklaringen die
// SporthouseGroup zelf moet aanleveren of bevestigen. Alles wat hier `null`
// is, staat op de pagina als een opvallende "[To be completed: …]"-markering.
// Vul het in vóór je de verificatie indient — niets hiervan is verzonnen, en
// dat moet zo blijven. Waar een voorstel staat, is dat enkel een voorstel:
// pas overnemen als het klopt.

export const LEGAL = {
  appName: 'Sporthouse Hub',
  operator: 'SporthouseGroup',

  /** Juridische naam van de vennootschap, bv. "Sporthouse Group BV". */
  legalEntity: null as string | null,
  /** Maatschappelijke zetel (straat, nummer, postcode, gemeente, land). */
  registeredAddress: null as string | null,
  /** Ondernemingsnummer (KBO) / btw-nummer. */
  companyNumber: null as string | null,
  /** Toepasselijk recht en bevoegde rechtbank, bv. "Belgian law. Disputes go to the courts of …". */
  governingLaw: null as string | null,
  /**
   * Toezichthouder waar gebruikers klacht kunnen indienen, met website.
   * Voor een Belgische vennootschap: "the Belgian Data Protection Authority
   * (www.dataprotectionauthority.be)" — enkel invullen als dat klopt.
   */
  supervisoryAuthority: null as string | null,
  /** Regio van het Supabase-project (Supabase-dashboard → Project Settings → General), bv. "EU (Frankfurt)". */
  databaseRegion: null as string | null,

  /**
   * Rechtsgrond voor de verwerking (AVG art. 6), als volledige zin.
   * Voorstel: "We process this data because it is necessary to perform your
   * employment or freelance agreement with SporthouseGroup, and for
   * SporthouseGroup's legitimate interest in running its work efficiently and securely."
   */
  legalBasis: null as string | null,
  /**
   * Waarborgen bij doorgifte buiten de EER, en of er verwerkersovereenkomsten
   * (DPA's) zijn met Supabase, Vercel, Google en Anthropic. Volledige zin(nen).
   * Voorstel, enkel als het klopt: "Where these providers process data outside
   * the European Economic Area, we rely on the European Commission's Standard
   * Contractual Clauses included in their data processing agreements."
   */
  transferSafeguards: null as string | null,
  /**
   * Bewaartermijn voor overige inhoud (klant- en projectgegevens, notities,
   * planning, …) en voor back-ups. Volledige zin(nen).
   */
  contentRetention: null as string | null,

  /** Contactadres voor privacyvragen en verwijderverzoeken. Stond al op de oude /privacy. */
  contactEmail: 'alexander.vandenbranden@sporthousegroup.com',

  privacyLastUpdated: '10 November 2026',
  termsLastUpdated: '10 November 2026',
} as const
