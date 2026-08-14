// De vaste vragenlijst voor de kennisbank per klant.
//
// Bewust in code en niet in de database: elke klant beantwoordt dezelfde
// vragen, zodat de antwoorden vergelijkbaar blijven en de AI-tools er een
// vaste structuur in vinden. Een vraag toevoegen is een codewijziging — de
// sleutels hieronder mogen daarbij nooit veranderen, want daar hangen de
// opgeslagen antwoorden aan.
//
// Nummering volgt het originele Word/RTF-document (7 ontbrak daar al).

export interface KennisbankQuestion {
  key: string
  number: number
  question: string
  hint?: string
  /** Meerdere regels verwacht — bepaalt de hoogte van het invulveld. */
  long?: boolean
}

export interface KennisbankBlock {
  key: string
  title: string
  intro?: string
  questions: KennisbankQuestion[]
}

export const KENNISBANK_BLOCKS: KennisbankBlock[] = [
  {
    key: 'identiteit',
    title: 'Identiteit & positionering',
    questions: [
      { key: 'oneliner',     number: 1, question: 'Wat doet/is de klant in één zin?' },
      { key: 'missie',       number: 2, question: 'Wat is de missie of het grotere doel?' },
      { key: 'doelgroep',    number: 3, question: 'Wie is de doelgroep?', hint: 'Leeftijd, interesses, platform-gedrag' },
      { key: 'onderscheid',  number: 4, question: 'Wat maakt de klant uniek t.o.v. concurrenten of vergelijkbare spelers?' },
      { key: 'verboden',     number: 5, question: 'Zijn er onderwerpen of topics die absoluut niet mogen voorkomen in communicatie?', long: true },
    ],
  },
  {
    key: 'tone',
    title: 'Tone of voice & stijl',
    intro: 'Zodat de AI schrijft zoals jullie schrijven.',
    questions: [
      { key: 'toon',            number: 6,  question: 'Beschrijf de toon in 3-5 woorden.', hint: 'bv. energiek, direct, professioneel, humoristisch' },
      { key: 'taal',            number: 8,  question: 'Worden er Engelse woorden gebruikt, of strikt Nederlands/Frans?' },
      { key: 'uitdrukkingen',   number: 9,  question: 'Zijn er vaste uitdrukkingen, slogans of hashtags die altijd terugkomen?' },
      { key: 'copy_goed',       number: 10, question: 'Wat zijn voorbeelden van copy die jullie zelf sterk vinden?', hint: 'Plak er gerust 3-5 in', long: true },
      { key: 'copy_slecht',     number: 11, question: 'Wat zijn voorbeelden van copy die absoluut niet passen bij de klant?', long: true },
    ],
  },
  {
    key: 'platforms',
    title: 'Platforms & formats',
    questions: [
      { key: 'platformen',      number: 12, question: 'Op welke platformen is de klant actief?', hint: 'Instagram, X, LinkedIn, TikTok, Facebook…' },
      { key: 'toon_platform',   number: 13, question: 'Verschilt de toon per platform? Zo ja, hoe?', long: true },
      { key: 'formats',         number: 14, question: 'Zijn er vaste formats?', hint: "bv. altijd een vraag aan het einde, altijd emoji's, altijd een CTA", long: true },
      { key: 'caption_lengte',  number: 15, question: 'Wat is de gemiddelde lengte van een caption?' },
    ],
  },
  {
    key: 'inhoud',
    title: 'Inhoudelijke kennis',
    questions: [
      { key: 'producten',     number: 16, question: 'Wat zijn de belangrijkste producten, diensten of events van de klant?', long: true },
      { key: 'partnerships',  number: 17, question: 'Zijn er vaste partnerships, sponsors of samenwerkingen om rekening mee te houden?', long: true },
      { key: 'themas',        number: 18, question: "Wat zijn terugkerende thema's of campagnes doorheen het jaar?", long: true },
      { key: 'gevoelig',      number: 19, question: 'Zijn er zaken die historisch gevoelig liggen of eerder fout liepen in communicatie?', long: true },
      { key: 'kpi',           number: 20, question: "Welke KPI's of succescriteria hanteren jullie?", hint: 'bereik, engagement, conversie…' },
    ],
  },
  {
    key: 'werking',
    title: 'Interne werking',
    questions: [
      { key: 'contactpersonen', number: 21, question: 'Wie zijn de vaste contactpersonen bij de klant en wat zijn hun rollen?', long: true },
      { key: 'goedkeuring',     number: 22, question: 'Hoe verloopt de goedkeuringsflow voor content?', hint: 'Wie keurt goed, in welke stap', long: true },
      { key: 'kanalen',         number: 23, question: 'Welke tools of kanalen gebruiken jullie voor communicatie met de klant?', hint: 'WhatsApp, e-mail, Slack…' },
      { key: 'ritme',           number: 24, question: 'Zijn er vaste deadlines of ritmes?', hint: 'bv. contentkalender elke maandag, rapport elke maand' },
      { key: 'uitdagingen',     number: 25, question: 'Wat zijn openstaande uitdagingen of pijnpunten in de samenwerking?', long: true },
    ],
  },
  {
    key: 'aanvullend',
    title: 'Aanvullend',
    intro: 'Alles wat niet in de vragen hierboven past maar wel belangrijk is om te weten.',
    questions: [
      {
        key: 'extra',
        number: 26,
        question: 'Overige afspraken, workflows of regels',
        hint: 'bv. embargo\'s, liveshift-workflow, welke content op welk kanaal, merkregels',
        long: true,
      },
    ],
  },
]

export const ALL_QUESTIONS: KennisbankQuestion[] = KENNISBANK_BLOCKS.flatMap(b => b.questions)

export const QUESTION_COUNT = ALL_QUESTIONS.length

/** Antwoorden als platte tekst, voor in een AI-prompt. */
export function formatKennisbank(answers: Record<string, string>): string {
  const blocks = KENNISBANK_BLOCKS.map(block => {
    const filled = block.questions.filter(q => answers[q.key]?.trim())
    if (filled.length === 0) return null
    const lines = filled.map(q => `${q.question}\n${answers[q.key].trim()}`)
    return `## ${block.title}\n${lines.join('\n\n')}`
  }).filter(Boolean)

  return blocks.length ? blocks.join('\n\n') : ''
}
