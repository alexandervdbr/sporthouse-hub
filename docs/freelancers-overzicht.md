# Freelancers — intern overzicht

Plan, november 2026. Vervangt de richting van `docs/freelancers-redesign.md`
(link, pincode, opdrachten). De freelancerfunctie wordt een **intern overzicht**,
zoals de spreadsheet, maar dan met zoeken, filteren, sorteren, bewerken en
contact met één klik. Freelancers krijgen geen link, geen login en geen
pincode. Opdrachten worden buiten de tool geregeld.

Branch: `feature/freelancers-overzicht` (vanaf main 9e37ce1).
`feature/freelancers-redesign` wordt niet gemerged. We nemen er alleen stukken uit over (zie §3).

---

## 1. Wat er gebouwd wordt (en wat niet)

**Velden van een freelancer**

| Veld | Kolom | Regel |
|---|---|---|
| Naam | `name` | verplicht |
| Wat | `disciplines text[]` (sleutels uit `freelancer_disciplines`) | minstens één |
| Telefoon | `phone` | optioneel |
| E-mail | `email` (citext) | optioneel, uniek, kleine letters |
| Status | `status` | vast · proefopdracht · kandidaat · inactief → "Vast", "Proef", "Nog niet getest", "Inactief" |
| Tarief | `rate_amount` + `rate_unit` (uur/dag/project) + `rate_note` | bedrag en eenheid samen of geen van beide |
| Beoordeling | `overall_rating` 1–5 + `overall_rating_note` | handmatig |
| Portfolio | `portfolio_links jsonb` `[{label?, url}]` | label optioneel |
| Notities | `notes` | |
| Archief | `archived_at` | verborgen tenzij je filtert |

**Samenwerkingen** (`freelancer_projects`) bevatten projectnaam, klant, datum, score 1–5 (optioneel) en notitie. Je kunt ze toevoegen, bewerken en verwijderen.
- Het gemiddelde van de scores staat naast de handmatige beoordeling: `★ 4 · samenwerkingen 4,3 (5)`. Het overschrijft die beoordeling nooit.
- De oude route schreef het gemiddelde wel weg in `freelancers.rating`. Dat verdwijnt.

**Niet bouwen:** beschikbaarheid, AI-match, opdrachten, links, pincodes, bijlagen, meldingen, accounts en profielfoto's (zie §9, beslissing B3).

---

## 2. Waar de code afwijkt van de context

1. **Productie staat verder dan main.**
   - Migratie 0093 is uitgevoerd, maar het bestand staat alleen op `feature/freelancers-redesign`, niet op main. Op productie gebeurt nu dit:
     - De oude pagina op main schrijft nog `types`, `tested`, `price_info`, `rating` en `portfolio_url`. Wat je daar bewerkt, komt dus niet in de nieuwe kolommen.
     - De opdrachtroutes op main schrijven status `'nieuw'`. Die waarde bestaat niet meer in de enum, dus ze falen.
     - 0093 heeft de insert-policy op `freelancer_projects` weggehaald. De projectroute op main werkt nog omdat ze de service-role gebruikt.
   - Er staan alleen TEST-gegevens in, dus er is geen schade. Wel neem ik `0093_freelancers_datamodel.sql` ongewijzigd over naar deze branch, zodat de migratiegeschiedenis in de repo klopt met productie.
2. **Disciplines zijn geen koppeltabel.** Ze staan in `freelancers.disciplines` (`text[]`). Een trigger (`freelancers_check_disciplines`) controleert of elke sleutel in `freelancer_disciplines` bestaat. Dat blijft zo.
3. **`freelancer_projects` kan niet bijgewerkt worden met de client van de gebruiker.**
   - Er is geen update-policy, en de insert-policy is weg sinds 0093.
   - Voor bewerken en toevoegen is ofwel een kleine migratie nodig, ofwel de service-role na de rechtencontrole. Zie beslissing **B1**.
4. **`freelancer_projects` heeft geen `client_id`.** "Klant uit de klantenlijst" wordt daarom een keuzelijst die `client_name` invult met de naam. Er komt geen nieuwe kolom bij.
5. **Freelancer-accounts zitten op veel meer plekken dan middleware en callback.**
   - In de code: `gear/access.ts`, `gear/people.ts`, `poolwagens/access.ts`, `planning-access.ts`, drie downloadroutes en `admin/users/[id]`.
   - In de database: de functies uit 0071, 0072, 0076, 0080 en 0090 lezen `app_metadata.freelancer`.
   - **Die blokkades mogen pas weg als geen enkel Auth-account de vlag nog draagt.** Een account zonder permissies komt anders in de "open" onderdelen (pré-assist, materiaal).
   - De meeste van die bestanden liggen buiten de toegestane bestanden. Zie **B4** en **B5**.
6. **`auth/callback` stuurt elke login waarvan het e-mailadres in `freelancers` staat naar `/portal`.** Dat geldt ook voor een collega die toevallig ook in de freelancerlijst staat. Dit verdwijnt in Fase 3.
7. **`/api/chat` is maar half weg.** #267 haalde alleen `/api/chat/route.ts` (de documentchat) weg. `/api/chat/*` is de teamchat en staat los van freelancers.
8. **De publieke teksten vermelden nog een freelancerportaal.** Het gaat om de homepage (`src/app/page.tsx`), `privacy/page.tsx`, `terms/page.tsx` en `lib/legal.ts`. Die vallen buiten de toegestane bestanden. Zie **B6**.

---

## 3. Overnemen uit `feature/freelancers-redesign`

| Bron (redesign) | Nieuw bestand | Aanpassing |
|---|---|---|
| `supabase/migrations/0093_freelancers_datamodel.sql` | idem | ongewijzigd (is al uitgevoerd) |
| `features/freelancers/lib/schemas.ts` | idem | alleen het freelancer- en disciplinedeel; zonder beschikbaarheid, opdrachten, uploads, avatar of match; plus `projectSchema` (aanmaken en bijwerken) en `overall_rating` in hetzelfde formulier |
| `features/freelancers/lib/columns.ts` | idem | alleen `FREELANCER_COLUMNS` (zonder availability en avatar), `PROJECT_COLUMNS` en `DISCIPLINE_COLUMNS` |
| `features/freelancers/internal/useUrlState.ts` | `components/freelancers/overzicht/useUrlState.ts` | ongewijzigd |
| `internal/list/filter.ts`, `internal/logic.ts` (`seed`) | `components/freelancers/overzicht/logic.ts` | zoeken, filteren en sorteren (naam, wat, status, beoordeling, tarief; standaard op naam), URL, weergave, formulier |
| `internal/list/FreelancerTable.tsx`, `FreelancerFilters.tsx`, `FreelancerList.tsx` | `components/freelancers/overzicht/Overview.tsx` | tabel, kaarten, "Wat ▾" en "Status ▾" zonder pills, bottom sheet |
| `internal/types.ts` | `components/freelancers/overzicht/types.ts` | zonder stats, availability, opdrachten en link |
| `internal/ui.tsx` en `prototype/bits.tsx` (`Chip`, `Stars`, `MultiSelect`, `Toggle`) | `components/freelancers/overzicht/ui.tsx` | plus `Sheet` en een toast |
| `internal/profile/ProfileOverview.tsx` (velden) | `components/freelancers/overzicht/Panel.tsx` | één formulier, één Opslaan/Annuleren |
| — | `components/freelancers/overzicht/Projects.tsx`, `Contact.tsx` | nieuw: samenwerkingen, contacticonen |

| `api/freelancers/disciplines/route.ts` (POST) | idem | alleen toevoegen (voor de import) |
| `api/freelancers/[id]/archive/route.ts` | idem | ongewijzigd |
| `__tests__/freelancer-picker.test.ts` | idem | ongewijzigd: bewaakt `freelancer_picker()` |
| `features/freelancers/lib/slug.ts` | idem | ongewijzigd (sleutel van een nieuwe discipline) |
| `__tests__/freelancers-routes.test.ts` (main) | idem | bijgewerkt voor de nieuwe velden, plus samenwerkingen, archief en disciplines |
| — | `__tests__/freelancers-overzicht.test.ts`, `gear-mail-freelancer.test.ts` | nieuw: lijstlogica, formulier, bekijken/beheren, migratie 0094; mail van de materiaalplanner |

De schermcomponenten staan onder `src/components/` en niet onder `src/features/`: Tailwind scant alleen `src/components`, `src/app` en `src/pages`, en zo hoeft de Tailwind-config niet te veranderen.

De oude whitelists voor de opdracht- en matchroutes van main staan tijdelijk in `features/freelancers/lib/schemas-legacy.ts`; ze verdwijnen in Fase 3 samen met die routes.

**Niet overnemen:**
- `/f`, `api/public/f/*` en `features/freelancers/public/*`
- `lib/link-*`, `links-server`, `public-*`, `rate-limit`, `share`, `notify`, `files-server`, `drive-files`, `assignments-server`, `statuses`, `match`, `config`, `schemas-legacy` (die van de redesign-branch)
- `api/cron/freelancer-shares` en alle opdrachtroutes onder `api/freelancers/assignments/**`
- `[id]/link*`, `[id]/rating` (de beoordeling gaat mee in het formulier) en `[id]/avatar`
- `internal/assignments/*`, `LinkReveal`, `LinkTab`, `ProfileAssignments`, `ProfileHeader`, `EditableCard` (vervangen door één formulier), `PageScroll` en `FreelancersShell`
- het prototype
- de tests op link-crypto, public, transitions, migration en bugs (die gaan over opdrachten)
- `.env.example` (`FREELANCER_LINK_SECRET` is niet meer nodig) en de wijziging aan `tailwind.config.ts`

---

## 4. Wat er weg moet op main (Fase 3)

**Bestanden die verdwijnen**

| Bestand | Wat |
|---|---|
| `src/app/portal/layout.tsx`, `src/app/portal/page.tsx` | het freelancerportaal |
| `src/components/portal/FreelancerPortal.tsx`, `PortalLogout.tsx` | idem |
| `src/app/api/portal/assignments/route.ts`, `.../[id]/route.ts` | portaal-API |
| `src/app/api/portal/files/route.ts`, `.../thumbnail/route.ts` | idem |
| `src/components/freelancers/FreelancersPage.tsx` (1773 r.) | de oude pagina (vervangen in Fase 1) |
| `src/app/api/freelancers/match/route.ts` | AI-match |
| `src/app/api/freelancers/[id]/assignments/route.ts` | opdrachten |
| `src/app/api/freelancers/[id]/assignments/[assignmentId]/route.ts` | idem |
| `.../[assignmentId]/files/route.ts`, `.../files/thumbnail/route.ts` | opdrachtbestanden |
| `src/app/api/freelancers/[id]/avatar/route.ts` | profielfoto (B3) |

**Takken die verdwijnen in bestanden die blijven**

| Bestand | Wat eruit gaat |
|---|---|
| `src/lib/supabase/middleware.ts` | `isPortalPage`, `isPortalApiPage` en de twee freelancer-blokken (doorsturen naar `/portal`, API-slot); `isFreelancer` valt weg uit de dashboard-redirect |
| `src/app/auth/callback/route.ts` | de vlag-check en de opzoeking in `freelancers` → `/portal`. **Niemand** gaat nog naar `/portal`, niet op basis van e-mail en niet op basis van de vlag |
| `src/app/api/admin/users/[id]/route.ts` | het e-mailadres van de freelancer meeveranderen met het account |
| `src/components/admin/UsersPage.tsx` | `FreelancerInviteModal`, `freelancerEmails`, de badge en de uitsluiting uit de selectie |
| `src/lib/preview-context.tsx`, `src/components/layout/PreviewBanner.tsx` | `isFreelancer` |
| `src/app/(app)/preassist/page.tsx`, `src/lib/supabase/claims.ts`, `src/middleware.ts` | commentaar |
| `src/lib/upload-policy.ts`, `src/lib/reel-classification.ts` | commentaar dat naar opdrachtbestanden of de match verwijst |

**Blijft staan (B5, beslist):** de blokkades voor freelancer-accounts. Ze zijn harmloos zolang geen account de vlag draagt.
- In de code: `isFreelancerUser` in `lib/auth-permissions.ts`, de drie downloadroutes (`files`, `preassist`, `sporthouse/documents`), `lib/gear/access.ts`, `lib/gear/people.ts`, `lib/poolwagens/access.ts` en `lib/planning-access.ts`.
- In de database: de functies uit 0071, 0072, 0076, 0080 en 0090.
- **Later, apart werk:** die blokkades opruimen, met een eigen migratie voor de databasefuncties.

**Blijft ook (B6, beslist):** de portaaltekst op de homepage, privacy, terms en `lib/legal.ts`. Die gaat apart mee met V12, buiten dit project.

**Tests die aangepast worden:** `middleware-public-pages.test.ts` (de portaalgevallen gaan eruit), `freelancers-routes.test.ts` en `freelancers-access.test.ts`.

**Nieuwe tests**
- `freelancers-geen-portaal.test.ts`:
  - Doorzoekt `src/`, zonder de tests, op `/portal`, `'/f'`, `/f#`, `api/public/f`, `freelancer_links`, `freelancer_assignment`, `freelancer_reviews`, `freelancer_stats` en `link/pin`. Elke treffer laat de test falen.
  - `app_metadata.freelancer`, `isFreelancerUser` en `->> 'freelancer'` mogen alleen nog in de lijst bestaande blokkades hierboven staan. Overal anders faalt de test, in het bijzonder bij code die de vlag zet of ernaar doorstuurt.
  - Migraties vallen erbuiten: geschiedenis herschrijf je niet.
- Callback-test:
  - een collega wiens e-mailadres ook in de freelancerlijst staat, gaat naar `/dashboard` (of naar `next`), niet naar `/portal`;
  - een account met de vlag gaat evenmin naar `/portal`.

**Voorwaarde vóór Fase 3 (B4, beslist):**
- Een alleen-lezende query telt de Auth-accounts met `app_metadata.freelancer = true`. Jij draait ze.
- Bij 0 gaat Fase 3 door. Anders stop ik en vraag ik wat er moet gebeuren.

---

## 5. Opruimmigratie (Fase 4) — concept

Bestand: `0095_freelancers_opruimen.sql` (0094 is de migratie van B1).

**Daarbij komen ook:**
- `supabase/freelancers/0095_dryrun.sql`: alleen lezen, met aantallen per tabel.
- `supabase/freelancers/0095_proefdraai.sql`: `begin; … migratie … controles …; rollback;`.

Jij voert ze uit, ik niet.

**Verdwijnt**

| Soort | Wat |
|---|---|
| Tabellen | `freelancer_assignment_events`, `freelancer_reviews`, `freelancer_assignment_files`, `freelancer_assignments` (met `agreed_amount`), `freelancer_links`, `public_rate_limits` |
| View | `freelancer_stats` |
| Functies | `freelancer_link_pin_failed`, `freelancer_link_pin_ok`, `public_rate_hit`, `freelancers_revoke_links_on_archive` (+ trigger) |
| Types | `freelancer_assignment_status`, `freelancer_availability` |
| Kolommen `freelancers` | `availability`, `available_from`, `availability_updated_at`, `availability_updated_by`, `overall_rating_updated_at`, `overall_rating_updated_by`; oud: `specialties`, `hourly_rate`, `bio`, `rating`, `tested`, `price_info`, `types`, `portfolio_url`, `created_by_email` (allemaal `if exists`); `avatar_url` (B3) |
| Policies | alles op de verdwenen tabellen (gaat mee met de tabel) |
| Storage | bucket `freelancer-avatars` (B3) en de oude bucket `freelancer-assignments`, alleen als de dry-run 0 objecten telt. Anders apart, met jouw akkoord. |

**Blijft:**
- de tabellen `freelancers`, `freelancer_disciplines` en `freelancer_projects`;
- de functies `freelancer_picker()`, `user_can_view_freelancers()`, `freelancers_check_disciplines` en `freelancer_touch_updated_at`;
- de enums `freelancer_status` en `freelancer_rate_unit`;
- de unieke index op e-mail (citext);
- de RLS uit 0092 en 0093 op `freelancers` en `freelancer_disciplines`.

**Wijzigt (klein):**
- `freelancer_projects` krijgt insert- en update-policies op `user_has_section('freelancers')`, als B1 dat niet al in een eigen migratie deed.
- `score` krijgt een check tussen 1 en 5.
- (De FK `on delete cascade` zit al in 0094, zie B1.)

**Niet aangeraakt:** de databasefuncties uit 0071, 0072, 0076, 0080 en 0090 die de freelancer-vlag lezen.
- Zonder accounts met die vlag doen ze niets.
- Ze aanpassen raakt de policies van materiaal, poolwagens en planning, en dat valt buiten de scope (B5).

**Volgorde in de migratie:**
1. Controleblok: geen Auth-account met de vlag, anders afbreken.
2. Drop: view → events → reviews → files → assignments → links → rate limits → functies → types.
3. Kolommen droppen.
4. Policies en constraint op `freelancer_projects`.
5. `freelancer_picker()` opnieuw aanmaken, ongewijzigd, als controle.
6. Slotcontrole: tabellen en kolommen zijn weg, `freelancer_picker()` geeft rijen, `gear_bookings.freelancer_id` heeft nog zijn FK.

**De dry-run telt:**
- de rijen per tabel die verdwijnt;
- de freelancers met een waarde in een kolom die verdwijnt;
- de Drive-bestanden in `freelancer_assignment_files` (`storage_provider = 'drive'`). Die worden niet automatisch verwijderd; je krijgt de lijst.
- de objecten per bucket;
- de Auth-accounts met de vlag;
- de TEST-rijen (naam begint met "TEST –").

**De TEST-gegevens verwijder ik niet zonder het eerst te vragen** (B8).

---

## 6. De materiaalplanner blijft werken

| Waar | Wat het gebruikt | Bewaakt door |
|---|---|---|
| `api/materiaal/options` | `rpc('freelancer_picker')` → id en naam van niet-gearchiveerde freelancers | `freelancer-picker.test.ts` (overgenomen), na elke fase |
| `gear_bookings.freelancer_id` | FK `on delete set null` (0072) | de slotcontrole van de migratie |
| `lib/gear/mail-server.ts` | `freelancers.email` met de admin-client, als gast in de agenda-uitnodiging | nieuwe test `gear-mail-freelancer.test.ts`: een boeking met `freelancer_id` levert het e-mailadres van die freelancer als ontvanger |
| `BookingForm.tsx` | `options.freelancers` | ongewijzigd |

Gevolg om te weten: archiveren haalt iemand uit de keuzelijst, maar bestaande boekingen houden hem. Hard verwijderen zet `freelancer_id` op null in oude boekingen. Daarom is archiveren de standaard en zit hard verwijderen achter "beheren" met een bevestiging.

---

## 7. API (Fase 1)

Alles loopt via `requireFreelancers()` met een Zod-whitelist (`strictObject`) en expliciete kolomlijsten, nooit `select('*')`. Er zijn geen timers en geen verzoek per rij: één GET laadt de hele lijst, met de scores van de samenwerkingen erbij.

| Route | Niveau | Wat |
|---|---|---|
| `GET /api/freelancers?archief=1` | bekijken | alle freelancers met `freelancer_projects(id, score)`; gearchiveerden alleen met `archief=1` |
| `POST /api/freelancers` | beheren | naam en ≥ 1 discipline verplicht |
| `PATCH /api/freelancers/[id]` | beheren | het hele formulier, inclusief `overall_rating` en `overall_rating_note` |
| `POST /api/freelancers/[id]/archive` `{archived}` | beheren | archiveren of terugzetten |
| `DELETE /api/freelancers/[id]` | beheren | hard verwijderen (bevestiging in de UI) |
| `GET/POST /api/freelancers/[id]/projects` | bekijken/beheren | samenwerkingen; geen herberekening van een rating |
| `PATCH/DELETE /api/freelancers/[id]/projects/[projectId]` | beheren | altijd met `freelancer_id` erbij |
| `GET /api/freelancers/disciplines` | bekijken | lijst |
| `POST /api/freelancers/disciplines` | beheren | toevoegen (import) |
| `POST /api/freelancers/import` (Fase 2) | beheren | `{rows, decisions}` → toegevoegd, bijgewerkt, overgeslagen; de server valideert elke rij opnieuw |

Exporteren gebeurt in de browser, uit de lijst die al geladen is. Er is geen extra route.

---

## 8. UI — schetsen

Bestaande stijl: donker zinc, accent `#3A913F`, `Button`, `Field`, `inputCls`, `Select` (materiaal/ui) en `Modal` (poolwagens/ui). Er komt geen nieuwe bibliotheek. Een bottom sheet bestaat nog niet in de app; die bouw ik met dezelfde klassen als `Modal`, onderaan verankerd op mobiel.

### 8.1 Lijst — desktop (1440px)

```
Freelancers                                     [Importeren] [Exporteren] [+ Freelancer]
┌─────────────────────────────────────────────┐ [Wat ▾] [Status ▾]           38 freelancers
│ 🔍 Zoek op naam, wat of notities             │
└─────────────────────────────────────────────┘
 NAAM ↓            WAT                 STATUS            BEOORDELING           TARIEF          CONTACT     PORTFOLIO
 Jana Peeters      Video · Foto        Vast              ★ 4 · 4,3 (5)         €450/dag        📞 ✉ ⧉        🔗
 Tom Wouters       Redacteur           Proef             ★ 3                   €45/uur         📞 ✉ ⧉        —
 Lien Claes        Grafisch Design     Nog niet getest   —                     "op aanvraag"   ✉ ⧉           🔗
```

- Kolomkop klikken: sorteren; nog eens klikken: omkeren. Sorteren op Contact en Portfolio kan niet.
- De URL bevat `?q=&wat=video,foto&status=vast,proefopdracht&archief=1&sort=naam&dir=asc`.
- Standaard staan alle niet-gearchiveerden erin, op naam.
- **Status ▾** toont Vast, Proef, Nog niet getest en Inactief, en apart "Gearchiveerd tonen".
- Contact: 📞 opent `tel:`, ✉ opent `mailto:`, ⧉ kopieert het e-mailadres (of het nummer als er geen e-mail is), met een toast "Gekopieerd". Een icoon zonder gegevens is verborgen.
- Een rij klikken opent het paneel; de iconen openen het paneel niet.
- **Bekijken** ziet hetzelfde, maar zonder Importeren, + Freelancer en de bewerk- en archiveerknoppen. Exporteren blijft zichtbaar.

### 8.2 Paneel — desktop (rechts, ±480px) en mobiel (volledig scherm)

```
┌ Jana Peeters ─────────────────────────── ✕ ┐     Bekijken: alleen tekst
│ Vast · Video · Foto                        │
│ ★ 4  "Sterk in aftermovies"                │
│ samenwerkingen 4,3 (5)                     │
│ [📞 Bellen] [✉ Mailen]          [Bewerken] │  ← beheren
│                                            │
│ Telefoon   0470 12 34 56                   │
│ E-mail     jana@…                          │
│ Tarief     €450 per dag — "€250 halve dag" │
│ Portfolio  vimeo.com/jana ↗  · Instagram ↗ │
│ Notities   …                               │
│                                            │
│ Samenwerkingen                 [+ Toevoegen]│
│  12 okt 2026 · Aftermovie KVM · KV Mechelen ★5 ✎ 🗑
│  3 sep 2026  · Fotoshoot · Lommel SK      ★4 ✎ 🗑
│                                            │
│ ⋯  Archiveren · Verwijderen (beheren)      │
└────────────────────────────────────────────┘
```

**Bewerken** zet het hele paneel in formuliermodus:
- Naam, Wat (chips, multi), Status (segmented), Telefoon, E-mail, Tarief (bedrag + eenheid + notitie), Beoordeling (sterren 1–5 + notitie), Portfolio (rijen label + URL, + link), Notities.
- Onderaan staat een vaste balk **[Annuleren] [Opslaan]**. Op mobiel zit die onderaan het scherm, dus altijd zichtbaar.
- Fouten staan bij het veld, en bovenaan als één zin.

Een samenwerking toevoegen of bewerken gebeurt in een kleine inline-rij (op mobiel een sheet):
- velden: projectnaam, klant (typen of kiezen uit de klantenlijst, interne klanten niet), datum, score (optioneel) en notitie;
- knoppen: Opslaan/Annuleren per samenwerking, los van het profielformulier.

De paneelstand staat in de URL (`?id=…`), zodat de terugknop het paneel sluit.

### 8.3 "+ Freelancer"

Hetzelfde paneel, leeg en meteen in formuliermodus. Alleen Naam en Wat zijn verplicht, en de status start op "Nog niet getest". Na Opslaan blijft het paneel open op de nieuwe freelancer.

### 8.4 Lijst — mobiel (375px)

```
Freelancers                    [+]
┌──────────────────────────────┐
│ 🔍 Zoeken                     │
└──────────────────────────────┘
[Filters · 2]   Sorteren: Naam ▾
┌──────────────────────────────┐
│ Jana Peeters        ★ 4      │
│ Video · Foto — Vast          │
│ [📞 Bellen]  [✉ Mailen]      │   knoppen ≥ 44px
└──────────────────────────────┘
```

- **Filters** opent een bottom sheet met Wat (chips), Status (chips), "Gearchiveerd tonen", en de knoppen [Wissen] [Toon 12].
- Importeren en Exporteren zitten achter `⋯` naast `+`.
- De kaart tikken opent het paneel op volledig scherm.

### 8.5 Importeren (Fase 2, beheren)

```
Stap 1  [CSV kiezen]  of  plak hier ┌────────────┐
                                    └────────────┘
Stap 2  Voorbeeld — 41 rijen · 3 waarschuwingen · 2 dubbels
 #  NAAM          WAT              STATUS          TARIEF           BEOORD.  ACTIE
 1  Jana Peeters  Video, Foto      Vast            €450/dag         4        Nieuw
 2  Tom Wouters   Redacteur        Proef           notitie: "45-60" 3        Dubbel (e-mail) [Overslaan ▾]
 3  Lien Claes    Podcast ⚠        Nog niet getest —                7 ⚠      Nieuw
    ⚠ "Podcast" is geen discipline → [Toevoegen als discipline] of negeren
    ⚠ Beoordeling 7 valt buiten 1–5 → wordt leeg gelaten
Stap 3  [Annuleren]                         [41 rijen verwerken]
Na afloop: 36 toegevoegd · 3 bijgewerkt · 2 overgeslagen
```

**Mapping**
- **Getest:** ja → vast, weinig → proefopdracht, nee of leeg → kandidaat.
- **Prijs:** ondubbelzinnig is één bedrag met één eenheid, bv. `€450/dag`, `450 per dag`, `45 €/u` of `1200 per project`. Dan wordt het `rate_amount` + `rate_unit`, en de originele tekst gaat naar `rate_note`. Al het andere (twee bedragen, "op aanvraag", geen eenheid) gaat volledig naar `rate_note`.
- **Beoordeling:** een geheel getal van 1 tot 5. Iets anders blijft leeg, met een waarschuwing.
- **Wat?:** splitsen op `,` en `/`, en vergelijken op label of sleutel zonder hoofdletters of accenten. Onbekende waarden worden een voorstel om ze toe te voegen.
- **Portfolio:** elke `http(s)://`-URL in de cel wordt een link. Het label is de domeinnaam.
- **Dubbels:**
  - op e-mail (zonder hoofdletters), anders op genormaliseerde naam;
  - per dubbel kies je: overslaan (standaard) of bijwerken (lege velden overschrijven niets);
  - ook dubbels binnen hetzelfde bestand worden gemeld.

**Nadruk:** er wordt niets opgeslagen voor je op "verwerken" klikt.

### 8.6 Exporteren (bekijken)

Exporteren maakt een CSV van de huidige gefilterde en gesorteerde lijst.
- Kolommen: `Naam, Wat?, Nummer, Mailadres, Getest, Prijs, Beoordeling, Portfolio, Notities`.
- Getest wordt terugvertaald: vast → ja, proefopdracht → weinig, kandidaat → nee, inactief → inactief.
- Prijs is de `rate_note`, of anders `€{bedrag}/{eenheid}`.
- Het bestand is UTF-8 met BOM en `;` als scheiding, zodat Excel in België het goed opent.

---

## 9. Beslissingen (17 november 2026)

| # | Beslist |
|---|---|
| **B1** | Migratie `0094_freelancer_projects_policies.sql` met proefdraai (`begin … rollback`). Jij draait ze. Ze bevat insert- en update-policies op `freelancer_projects`, en meteen de FK `on delete cascade` uit B7, zodat hard verwijderen in één stap gebeurt. |
| **B2** | `0093_freelancers_datamodel.sql` gaat mee naar main (via de PR van Fase 1). |
| **B3** | Profielfoto's weg: de route in Fase 3, de kolom `avatar_url` en de bucket `freelancer-avatars` in de opruimmigratie van Fase 4. |
| **B4** | Vóór Fase 3: de alleen-lezende telling van accounts met de vlag. Bij 0 gaat het door, anders stop ik en vraag ik het. |
| **B5** | De blokkades blijven staan (zie §4). Ze opruimen is later, apart werk. |
| **B6** | De portaaltekst gaat apart, met V12, buiten dit project. |
| **B7** | Hard verwijderen kan alleen met "beheren", met een bevestiging die zegt hoeveel samenwerkingen mee verdwijnen. |
| **B8** | De TEST-gegevens mogen weg in Fase 4, maar ik vraag het opnieuw vóór Fase 4. |
| **B9** | `overall_rating_updated_at/by` gaan weg in Fase 4. |

## 10. Fasen en bewijs

Na elke fase volgen tsc, lint, de volledige tests en een build, plus een PR naar main. Er wordt pas gemerged na jouw akkoord en met alle checks groen.

| Fase | Inhoud | Tests |
|---|---|---|
| 1 | nieuwe `/freelancers` (tabel, kaarten, filters, sorteren, URL, paneel, + Freelancer, samenwerkingen) en de API uit §7. De oude pagina wordt niet meer geladen, het bestand verdwijnt in Fase 3. | filter, sort en URL; schema's; routes (401/403/400, bekijken ziet geen schrijfknoppen); picker; gear-mail |
| 2 | importeren en exporteren | mapping: vreemde prijsnotaties, lege velden, dubbels (e-mail en naam, in het bestand en in de database), onbekende disciplines, beoordeling buiten 1–5, export → import geeft dezelfde lijst |
| 3 | oude code weg (§4) | `freelancers-geen-portaal.test.ts` en de grep-output in de PR |
| 4 | opruimmigratie, dry-run en proefdraai (§5) | een migratietest die het SQL-bestand controleert (wat weg moet, wat moet blijven) |

Controle op 375px en 1440px: geen horizontaal scrollen, tikdoelen van minstens 44px, en de primaire actie zichtbaar zonder te scrollen. Ik maak screenshots via de Chrome-extensie als die verbonden is, anders lokaal via CDP zoals bij het prototype.
