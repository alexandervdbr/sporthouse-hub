# Freelancers — herontwerp (Fase 0: verkenning en plan)

Status: **plan, niets gewijzigd behalve dit document.** Branch: `feature/freelancers-redesign`.

---

## 1. Bevindingen uit de audit, getoetst aan de code

| # | Bewering | Oordeel | Bewijs |
|---|---|---|---|
| 1 | `FreelancersPage.tsx` is één component van ~1770 regels | **Bevestigd** (1769 regels, 15 subcomponenten in één bestand) | `src/components/freelancers/FreelancersPage.tsx` |
| 2 | Ongebruikte velden `specialties`, `hourly_rate`, `bio` | **Bevestigd**, maar wel nog gelezen door de match-prompt | `supabase/migrations/0028_baseline_undocumented_tables.sql:254-256`; `src/app/api/freelancers/match/route.ts:48-50,57,73-74` |
| 3 | Score van projecten is 1–5 | **Bevestigd in de UI** (`RatingStars`). De DB heeft **geen check constraint** op `score`, dus waarden >5 zijn mogelijk; de dry-run in Fase 2 controleert dat | `FreelancersPage.tsx:1374`; `0028:282-292` |
| 4 | Assignment-status nieuw/in_behandeling/afgerond | **Bevestigd**, afgedwongen met een check constraint | `0035_medium_findings_cleanup.sql:15-23` |
| 5 | Bestanden: nieuw in Drive, oud in Supabase Storage | **Bevestigd**, kolom `storage_provider`, bucket `freelancer-assignments` | `0005_freelancer_files_drive_storage.sql`; `[assignmentId]/route.ts:58-67` |
| 6 | PATCH schrijft body ongefilterd weg | **Bevestigd** — `.update(body)` | `src/app/api/freelancers/[id]/route.ts:49` |
| 7 | GET/POST `/api/freelancers` en `/match` zonder rechtencheck | **Bevestigd** — alleen `if (!user)` | `src/app/api/freelancers/route.ts:3-6,17-20`; `match/route.ts:7-10` |
| 8 | RLS `using(true)` op `freelancers` en `freelancer_projects` | **Deels weerlegd (correctie in Fase 1).** `0039_freelancers_rls_hardening.sql` had update/delete op `freelancers` al beperkt tot `user_has_section('freelancers')`. Wél open: select + insert op `freelancers`, en select/insert/delete op `freelancer_projects`, dat geen update-policy heeft | `0028:266-279,293-304`; `0039:22-30` |
| 9 | "Vier eigen kopieën" van de admin-check | **Deels weerlegd: het zijn er zeven.** 4× `requireFreelancerAdmin` (admin **of** sectie) en 3× `assertAdmin` (**alleen admin**). Iemand met "Beheren" krijgt dus 403 op opdrachten en bestanden, terwijl de knoppen wél zichtbaar zijn | `[id]/route.ts:4`, `[id]/projects/route.ts:4`, `[id]/projects/[projectId]/route.ts:4`, `[id]/avatar/route.ts:12`; `[id]/assignments/route.ts:4`, `[assignmentId]/route.ts:5`, `[assignmentId]/files/route.ts:9` |
| 10 | `page.tsx` laat `permissions === null` door | **Bevestigd** | `src/app/(app)/freelancers/page.tsx:16` |
| 11 | Uploads via formData → buffer → Drive | **Bevestigd** | `[assignmentId]/files/route.ts:85` |
| 12 | Downloads streamen via onze function | **Bevestigd**, zowel intern als in het portaal; ook de thumbnails | `[assignmentId]/files/route.ts:39`; `src/app/api/portal/files/route.ts:41`; `…/files/thumbnail/route.ts:41` |
| 13 | `listBuckets()` bij elke avatar-upload | **Bevestigd**, plus `createBucket` on the fly; de avatar-bytes zelf gaan ook door onze function | `[id]/avatar/route.ts:48-50,66-69` |
| 14 | Prompt zegt "/10" | **Bevestigd** | `match/route.ts:62,76` |
| 15 | JSON via regex | **Bevestigd** | `match/route.ts:130-135` |
| 16 | Client stuurt volledige lijst mee | **Bevestigd** | `FreelancersPage.tsx:1565` |
| 17 | Rating afgerond op heel getal, twee berekeningen | **Bevestigd** (één rekent eerst op 1 decimaal en rondt dan alsnog af, de andere rondt meteen af) | `[id]/projects/route.ts:76,82`; `[id]/projects/[projectId]/route.ts:37` |
| 18 | POST maakt Auth-gebruiker, negeert fouten | **Bevestigd** | `src/app/api/freelancers/route.ts:49-57` |
| 19 | Twee ingangen: `FreelancerInviteModal` en `AddFreelancerModal` | **Bevestigd** | `src/components/admin/UsersPage.tsx:935`; `FreelancersPage.tsx:214` |
| 20 | Google OAuth | **Bevestigd** — de enige loginmethode | `src/app/login/page.tsx:23` |
| 21 | Callback, middleware, portal en `/api/portal/*` behandelen freelancers apart, op e-mail | **Bevestigd**; volledige lijst in §5 | |
| 22 | Badge op e-mailvergelijking in UsersPage | **Bevestigd** | `UsersPage.tsx:1040,1082,1244,1266` |

### Nieuwe vondsten (stonden niet in de context)

- **De materiaalplanner (gear) hangt aan `freelancers`.**
  - `gear_bookings.freelancer_id` is een FK met `on delete set null` (`0072_gear_bookings.sql:30`).
  - De keuzelijst haalt `freelancers` op met de **gebruikersclient** (`src/app/api/materiaal/options/route.ts:20`). Als ik de RLS strakker zet, verdwijnt die keuzelijst voor iedereen zonder freelancerrecht.
- **De materiaalplanner stuurt automatisch agenda-mails naar freelancers.** `src/lib/gear/mail-server.ts:130-135` (`bookedForEmails`) neemt het e-mailadres van de freelancer op als ontvanger en agendagast. Dat botst met "de app verstuurt NOOIT automatisch mails naar freelancers". Het staat wel buiten het freelancerdomein, zie de open vragen.
- **SQL-functies lezen `app_metadata.freelancer`**:
  - `0072_gear_bookings.sql:163-171` (`gear_resolve_holder`)
  - `0076_poolwagens.sql:38`
  - `0090_planning_rls.sql:34-47` (`planning_is_freelancer`)

  Die zijn onschadelijk zodra er geen freelancer-accounts meer zijn, maar ze vallen wel onder de grep "nergens nog `app_metadata.freelancer`".
- **Er is al een precedent voor een persoonlijke link zonder account**: de planningslink voor weekendstudenten (`/p/[token]`, `src/lib/planning-links.ts`, `0052_planning_links.sql`). Ik volg dezelfde aanpak: alleen de service-role, geen policy, één generieke "niet gevonden", en een losse `resolve…()`-functie. Het verschil: daar staat het token in plaintext in de DB; hier wordt het gehasht en versleuteld.
- **Direct naar Drive uploaden bestaat al en is beproefd:**
  - Server: `createResumableUploadSession` + `getResumableUploadResult` + `getFileMetadata` (`src/lib/drive-storage.ts:199,345,245`).
  - Browser: `putFileToDrive(file, url, onProgress)` (`src/lib/drive-upload-client.ts:119`) en `pending-uploads.ts` voor hervatten.
  - Referentie-implementatie: `src/app/api/poolwagens/damage/upload-session` + `finalize`. Die controleert de parent-map bij Drive in plaats van de browser te geloven.
- **Kortlevende downloadlinks bestaan nergens.** Elke bestaande download (`files`, `sporthouse/documents`, `preassist`) streamt via een eigen function, met de middleware-matcher uitgezonderd. Zie §4.4: dit is het grootste ontwerpbesluit.
- **Rate limiting: er bestaat geen mechanisme.** Geen code leest `x-forwarded-for`. Mijn voorstel staat in §4.5.
- **Meldingen in de app: er bestaat web-push per gebruiker**, `pushToUsers(userIds, payload)` in `src/lib/poolwagens/push.ts:24`. Een meldingenlijst in de app is er niet. Ik gebruik `pushToUsers` voor `created_by`.
- **`zod` staat niet in `package.json`.** Het zit wel transitief in `node_modules` (v4.6.5, via de Anthropic SDK). Zod gebruiken = een **dependency toevoegen**, dus dat vraag ik eerst.
- **Er is geen gedeelde modelconstante.** Er staan losse strings: `claude-sonnet-4-6` (6×), `claude-sonnet-4-20250514`, `claude-sonnet-5` (`src/lib/reel-classification.ts:251`) en `claude-opus-4-8` (match). Voorstel in §7.
- **Next 16 markeert `middleware.ts` als deprecated** (hernoemd naar `proxy.ts`; `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`). Het werkt nog. Hernoemen valt buiten scope, dus ik doe het niet.
- **Rechten:** rollen slaan een *niveau* op (`"freelancers": "beheren"`, `0065_access_roles_drie_rollen.sql:30,36`). De sleutels in `app_metadata` worden pas herberekend als een rol of gebruiker opnieuw wordt opgeslagen (`buildAppMetadata`). Gevolg: zie §4.6.
- **De tool-status, sidebar en juridische teksten** vermelden freelancers en het portaal:
  - `src/app/page.tsx:11,31`
  - `src/app/privacy/page.tsx:29-53`
  - `src/app/terms/page.tsx:27,34`

  Na Fase 6 klopt de tekst "dedicated portal / accounts" niet meer. Aanpassen valt buiten het domein → apart vragen.

---

## 2. Datamodel en SQL-migratie (concept)

Volgnummer: **`0093_freelancers_datamodel.sql`** (0092 werd de RLS-migratie van Fase 1). De definitieve SQL staat in het bestand zelf; het concept hieronder is het ontwerp van Fase 0. Het ontwerp volgt `<target_design>`, met de afwijkingen uit §7. **Twee stappen:**

- **0092** voegt toe, kopieert en zet over. Er wordt **niets verwijderd**, zodat de huidige code tot Fase 6 blijft werken.
- **0093** (pas in Fase 6, met jouw akkoord) dropt de oude kolommen, `freelancer_projects` en de oude check constraint.

```sql
create extension if not exists citext;

-- ── Enums ───────────────────────────────────────────────────────────────────
create type freelancer_status       as enum ('kandidaat','proefopdracht','vast','inactief');
create type freelancer_rate_unit    as enum ('uur','dag','project');
create type freelancer_availability as enum ('beschikbaar','beperkt','niet_beschikbaar');
create type freelancer_assignment_status as enum
  ('concept','gedeeld','geaccepteerd','geweigerd','opgeleverd','afgerond','geannuleerd');

-- ── Disciplines (beheerbaar) ────────────────────────────────────────────────
create table freelancer_disciplines (
  key         text primary key,               -- slug, stabiel
  label       text not null unique,
  sort        int  not null default 0,
  archived_at timestamptz
);
-- seed: de 13 huidige TYPES (FreelancersPage.tsx:16-20)

-- ── freelancers ─────────────────────────────────────────────────────────────
alter table freelancers
  add column disciplines   text[] not null default '{}',
  add column status        freelancer_status not null default 'kandidaat',
  add column rate_amount   numeric(10,2) check (rate_amount >= 0),
  add column rate_unit     freelancer_rate_unit,
  add column rate_note     text,
  add column portfolio_links jsonb not null default '[]'
               check (jsonb_typeof(portfolio_links) = 'array'),
  add column availability  freelancer_availability not null default 'beschikbaar',
  add column available_from date,
  add column availability_updated_at timestamptz,
  add column availability_updated_by text check (availability_updated_by in ('team','freelancer')),
  add column overall_rating smallint check (overall_rating between 1 and 5),
  add column overall_rating_note text,
  add column overall_rating_updated_at timestamptz,
  add column overall_rating_updated_by uuid references auth.users(id) on delete set null,
  add column archived_at   timestamptz,
  add column updated_at    timestamptz not null default now();

-- e-mail: trim + lowercase; duplicaten breken de migratie bewust af (dry-run toont ze vooraf)
update freelancers set email = nullif(lower(btrim(email)), '');
alter table freelancers alter column email type citext;
create unique index freelancers_email_key on freelancers (email) where email is not null;

-- overzetten, niets gaat verloren:
--   rating        → overall_rating (1:1, al integer)
--   tested        → status   (ja→vast, weinig→proefopdracht, nee/null→kandidaat)
--   types         → disciplines (bekende waarden); onbekende → notes
--   hourly_rate   → rate_amount + rate_unit='uur'   (alleen als er een waarde is)
--   price_info    → rate_note
--   portfolio_url → portfolio_links [{label:'Portfolio', url}]
--   specialties, bio → notes, achteraan, met een kop "Uit oud profiel:"
-- overall_rating_updated_by blijft NULL (= "gemigreerd")

-- ── freelancer_assignments ──────────────────────────────────────────────────
alter table freelancer_assignments rename column created_by to created_by_email;  -- oud: e-mail als tekst
alter table freelancer_assignments
  add column discipline        text references freelancer_disciplines(key) on update cascade,
  add column client_id         uuid references clients(id) on delete set null,
  add column agreed_amount     numeric(10,2) check (agreed_amount >= 0),
  add column is_historical     boolean not null default false,
  add column created_by        uuid references auth.users(id) on delete set null,
  add column shared_at         timestamptz,
  add column first_viewed_at   timestamptz,
  add column status_changed_at timestamptz not null default now(),  -- voor "< 30 dagen" en "opgeleverd op"
  add column updated_at        timestamptz not null default now(),
  add column legacy_project_id uuid unique;    -- idempotente migratie uit freelancer_projects
-- client_name blijft als vrije fallback

-- status text → enum
alter table freelancer_assignments drop constraint if exists freelancer_assignments_status_check;
alter table freelancer_assignments alter column status drop default;
alter table freelancer_assignments alter column status type freelancer_assignment_status using
  (case status when 'nieuw' then 'gedeeld' when 'in_behandeling' then 'geaccepteerd'
               when 'afgerond' then 'afgerond' end)::freelancer_assignment_status;
alter table freelancer_assignments alter column status set default 'concept';
update freelancer_assignments set shared_at = created_at, status_changed_at = created_at;
update freelancer_assignments a set created_by = u.id
  from auth.users u where lower(u.email) = lower(a.created_by_email);
-- client_id invullen waar client_name exact (case-insensitive) één klant matcht

-- ── Reviews (strikt intern) ─────────────────────────────────────────────────
create table freelancer_reviews (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references freelancer_assignments(id) on delete cascade,
  score         smallint not null check (score between 1 and 5),
  score_quality       smallint check (score_quality between 1 and 5),
  score_deadline      smallint check (score_deadline between 1 and 5),
  score_communication smallint check (score_communication between 1 and 5),
  comment       text,
  reviewer_id   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Bestanden ───────────────────────────────────────────────────────────────
alter table freelancer_assignment_files
  add column kind        text not null default 'briefing' check (kind in ('briefing','oplevering')),
  add column uploaded_by text not null default 'team'     check (uploaded_by in ('team','freelancer')),
  add column created_by  uuid references auth.users(id) on delete set null,
  add column public_shared_at timestamptz;   -- zie §4.4
-- bestaande kolommen file_name/file_size/file_type/uploaded_at, file_url,
-- storage_provider en drive_file_id blijven (zie afwijking A6)

-- ── Events ──────────────────────────────────────────────────────────────────
create table freelancer_assignment_events (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references freelancer_assignments(id) on delete cascade,
  actor_type    text not null check (actor_type in ('team','freelancer','systeem')),
  actor_id      uuid references auth.users(id) on delete set null,   -- null bij freelancer/systeem
  from_status   freelancer_assignment_status,
  to_status     freelancer_assignment_status,
  kind          text not null default 'status'
                check (kind in ('status','bericht','bestand','bekeken','beschikbaarheid','notitie')),
  message       text,
  visible_to_freelancer boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on freelancer_assignment_events (assignment_id, created_at desc);

-- ── Migratie freelancer_projects → assignments + reviews ────────────────────
--   project_name→title, description→briefing, client_name→client_name (+client_id bij exacte match),
--   date→deadline, status='afgerond', is_historical=true, status_changed_at=coalesce(date,created_at),
--   legacy_project_id=id
--   score 1–5 → freelancer_reviews.score, notes → review.comment
--   notes zonder score → event kind='notitie', visible_to_freelancer=false (geen review zonder score)
--   score buiten 1–5 → migratie breekt af (dry-run toont ze)

-- ── Links ───────────────────────────────────────────────────────────────────
create table freelancer_links (
  id                  uuid primary key default gen_random_uuid(),
  freelancer_id       uuid not null references freelancers(id) on delete cascade,
  token_hash          bytea not null unique,      -- SHA-256(token)
  token_encrypted     bytea not null,             -- AES-256-GCM: iv(12) || tag(16) || ciphertext
  pin_hash            text  not null,             -- scrypt$N$r$p$salt$hash (gepeperd, zie §4.2)
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  revoked_at          timestamptz,
  last_opened_at      timestamptz,
  failed_pin_attempts int not null default 0,
  locked_until        timestamptz,
  lockout_count       int not null default 0      -- zie §4.2 (escalatie)
);
create unique index freelancer_links_one_active on freelancer_links (freelancer_id) where revoked_at is null;
alter table freelancer_links enable row level security;   -- GEEN policies: alleen service-role

-- archiveren trekt de link in (trigger, zodat het niet van de route afhangt)
create function freelancers_revoke_link_on_archive() ... after update of archived_at ...

-- ── Rate limiting (zie §4.5) ───────────────────────────────────────────────
create table public_rate_limits (
  bucket text not null, key_hash bytea not null, window_start timestamptz not null,
  hits int not null default 0, primary key (bucket, key_hash, window_start)
);
create function public_rate_hit(p_bucket text, p_key bytea, p_limit int, p_window interval)
  returns boolean  -- security definer, atomische upsert; true = toegestaan
alter table public_rate_limits enable row level security;  -- geen policies

-- ── Stats-view: review_avg wordt NERGENS opgeslagen ─────────────────────────
create view freelancer_stats with (security_invoker = true) as
select f.id as freelancer_id,
       round(avg(r.score)::numeric, 1)                                         as review_avg,
       count(r.id)                                                             as review_count,
       count(a.id) filter (where a.status in ('gedeeld','geaccepteerd','opgeleverd')) as active_assignments,
       count(a.id) filter (where a.status = 'afgerond' and r.id is null and not a.is_historical) as open_review_count,
       max(coalesce(a.shared_at, a.created_at))                                as last_assignment_at
from freelancers f
left join freelancer_assignments a on a.freelancer_id = f.id
left join freelancer_reviews r on r.assignment_id = a.id
group by f.id;

-- ── Avatars: vaste bucket ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('freelancer-avatars','freelancer-avatars', true)
  on conflict (id) do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Alle helpers via public.user_has_section() (0025:46): 'beheer' = admin, verder exact,
-- en GEEN open toegang bij ontbrekende permissions.
-- freelancers, freelancer_assignments, _files, _events, freelancer_disciplines, freelancer_stats:
--   select  → user_has_section('freelancers')
--   insert/update/delete → user_has_section('freelancers_beheren')
-- freelancer_reviews: select + write → user_has_section('freelancers_beheren')   (zie open vraag V5)
-- freelancer_links, public_rate_limits: RLS aan, geen enkele policy
-- Oude using(true)-policies op freelancers/freelancer_projects worden gedropt (al in Fase 1).
```

**Dry-run (Fase 2)**: één read-only query die per freelancer toont:

- de oude rating, de nieuwe overall_rating en review_avg na de migratie
- het aantal projecten, reviews en notitie-events
- de e-mail vóór en na de normalisatie

Daarnaast een samenvatting met:

- het aantal rijen per bestemming
- de duplicaten op `lower(trim(email))`
- scores buiten 1–5
- onbekende `types`-waarden
- `client_name` zonder exacte klantmatch

---

## 3. Routes

**Rechtenniveaus:**

| Niveau | Sleutels |
|---|---|
| `geen` | geen sleutels |
| `bekijken` | `freelancers` |
| `beheren` | `freelancers` + `freelancers_beheren` |

Elke interne route gebruikt één helper, `requireFreelancers('bekijken' | 'beheren')`, gebouwd op `hasSection`.

### 3.1 Intern (vereist een medewerker-login via de middleware)

| Route | Methode | Niveau | Status |
|---|---|---|---|
| `/api/freelancers` | GET (lijst + stats) | bekijken | gewijzigd |
| `/api/freelancers` | POST | beheren | gewijzigd: **geen Auth-gebruiker meer** |
| `/api/freelancers/[id]` | GET | bekijken | nieuw |
| `/api/freelancers/[id]` | PATCH (Zod-whitelist, per kaart) | beheren | gewijzigd |
| `/api/freelancers/[id]` | DELETE | beheren | gewijzigd: alleen zonder opdrachten (zie V7) |
| `/api/freelancers/[id]/archive` | POST / DELETE | beheren | nieuw (DELETE = terugzetten) |
| `/api/freelancers/[id]/rating` | PUT | beheren | nieuw (overall_rating + toelichting) |
| `/api/freelancers/[id]/avatar` | POST → signed upload-URL; PUT bevestigen; DELETE | beheren | gewijzigd: browser → Storage direct |
| `/api/freelancers/[id]/link` | GET (status) | beheren | nieuw |
| `/api/freelancers/[id]/link` | POST (nieuw/roteren → URL + pincode één keer) | beheren | nieuw |
| `/api/freelancers/[id]/link` | DELETE (intrekken) | beheren | nieuw |
| `/api/freelancers/[id]/link/pin` | POST (nieuwe pincode, één keer getoond) | beheren | nieuw |
| `/api/freelancers/[id]/link/url` | GET (ontsleutelde URL om te kopiëren) | beheren | nieuw |
| `/api/freelancers/assignments` | GET (overzicht, gegroepeerd) | bekijken | nieuw |
| `/api/freelancers/assignments` | POST | beheren | nieuw |
| `/api/freelancers/assignments/[id]` | GET / PATCH | bekijken / beheren | nieuw |
| `/api/freelancers/assignments/[id]/transition` | POST `{to, message?}` | beheren | nieuw |
| `/api/freelancers/assignments/[id]/review` | PUT / DELETE | beheren | nieuw |
| `/api/freelancers/assignments/[id]/files/upload-session` | POST | beheren | nieuw |
| `/api/freelancers/assignments/[id]/files/finalize` | POST | beheren | nieuw |
| `/api/freelancers/assignments/[id]/files/[fileId]` | GET (→ 302) / DELETE | bekijken / beheren | nieuw |
| `/api/freelancers/disciplines` | GET / POST / PATCH | bekijken / beheren | nieuw |
| `/api/freelancers/match` | POST `{discipline, description}` | beheren | gewijzigd: server haalt zelf op |

Pagina's (alles in `src/app/(app)/freelancers/`, server-side gecontroleerd op `bekijken`):

- `/freelancers?tab=freelancers|opdrachten&q=&status=&d=&nu=1&sort=&opdracht=<id>`
- `/freelancers/[id]?tab=overzicht|opdrachten|link&opdracht=<id>`
- `/freelancers/opdrachten/nieuw?freelancer=<id>` (beheren)
- `/freelancers/opdrachten/[id]`: volledige pagina, voor mobiel en directe links. `?opdracht=` opent hetzelfde detail als zijpaneel.

### 3.2 Publiek (zonder medewerker-login)

De middleware krijgt precies twee nieuwe uitzonderingen: `pathname === '/f' || startsWith('/f/')` en `startsWith('/api/public/f/')`. De bestaande publieke paden (`/`, `/privacy`, `/terms`, `/s/`, `/p/`, …) blijven ongemoeid; zie afwijking A1.

| Route | Doel | Cookie nodig |
|---|---|---|
| `/f` (pagina, zie A2 voor de vorm van de link) | client-shell | nee |
| `POST /api/public/f/session` `{token}` | `{state: 'ongeldig' \| 'pin' \| 'geblokkeerd' \| 'ok'}` | nee (leest de cookie wel) |
| `POST /api/public/f/pin` `{token, pin}` | pincode controleren, cookie zetten | nee |
| `GET /api/public/f/me` | voornaam, beschikbaarheid, opdrachtkaarten | ja |
| `PUT /api/public/f/availability` | beschikbaarheid + "vanaf" | ja |
| `GET /api/public/f/assignments/[id]` | detail; zet `first_viewed_at` | ja |
| `POST /api/public/f/assignments/[id]/action` `{action: accept\|decline\|deliver, reason?}` | via de overgangsfunctie | ja |
| `POST /api/public/f/assignments/[id]/upload-session` | Drive-sessie-URL's (alleen bij geaccepteerd/opgeleverd) | ja |
| `POST /api/public/f/assignments/[id]/finalize` | Drive verifiëren + metadata registreren | ja |
| `GET /api/public/f/files/[fileId]` | rechtencheck → 302 | ja |

Elke route:

- valideert de cookie (HMAC + vervaldatum) en daarna de link in de DB (niet ingetrokken, niet geblokkeerd, freelancer niet gearchiveerd);
- leidt het `freelancer_id` **uitsluitend** af uit de link;
- filtert elke query op dat id;
- gebruikt expliciete select-lijsten uit één bestand (`public-select.ts`);
- doet een rate-limit-hit;
- schrijft een event bij elke actie.

Er worden geen interne handlers geïmporteerd. Gedeeld zijn enkel pure libs: de overgangsfunctie, de Drive-helpers en de crypto.

### 3.3 Te verwijderen (pas in Fase 6, na akkoord)

- `src/app/portal/*`; `/portal` verwijst door naar een uitlegpagina.
- `src/app/api/portal/*` (4 routes)
- `src/components/portal/*`
- `src/app/api/freelancers/[id]/projects/**`
- `src/app/api/freelancers/[id]/assignments/**`, inclusief thumbnail- en file-routes
- `src/components/freelancers/FreelancersPage.tsx`

---

## 4. Beveiligingsontwerp

### 4.1 Sleutels
- Eén nieuwe env var, `FREELANCER_LINK_SECRET` (≥32 bytes random) — **vraagt akkoord.**
- Via `hkdfSync('sha256', secret, '', label, 32)` worden drie subsleutels afgeleid, met de labels `link-token-enc`, `link-cookie-mac` en `link-pin-pepper`. Eén sleutel voor drie doelen wordt zo nooit hergebruikt.

### 4.2 Token en pincode
- **Token:** `randomBytes(32).toString('base64url')`.
  - In de DB staan alleen `sha256(token)` (voor de lookup) en `AES-256-GCM(token)` met een random IV van 12 bytes en `freelancer_id` als AAD. Een versleuteld token is dus niet naar een andere rij te verplaatsen.
- **Pincode:** `String(randomInt(0, 10000)).padStart(4, '0')`.
  - Opgeslagen als `scrypt(HMAC(pepper, pin), salt16, N=2^15, r=8, p=1)`.
  - **Waarom de pepper:** 4 cijfers zijn 10.000 mogelijkheden. Met alleen een gezouten hash raad je die na een DB-lek offline in seconden. Met de pepper heb je ook de env var nodig.
  - De vergelijking gebeurt met `timingSafeEqual`.
- **Limieten:**
  - Pogingen worden geteld **per link**, niet per IP.
  - Na 5 foute pogingen volgt `locked_until = now() + 15 min` en `lockout_count += 1`.
  - Eén update met `returning`, zodat parallelle pogingen niet langs de teller glippen.
  - **Voorstel bovenop het ontwerp:** na 3 blokkeringen binnen 24 uur blijft de link geblokkeerd tot "beheren" een nieuwe pincode maakt. Zonder die regel haalt een aanvaller die het token heeft zo'n 480 gokken per dag binnen, en dan is de pincode gemiddeld in ~10 dagen geraden (zie V3).
- **Generieke weigering:** bij een onbekend token, een ingetrokken link of een gearchiveerde freelancer is de response identiek, met dezelfde body, status en headers. Een ongeldig token kost even veel werk: er wordt altijd een `sha256` + lookup gedaan.

### 4.3 Cookie
- **Inhoud:** `base64url(linkId.expUnix).base64url(HMAC-SHA256(macKey, linkId.expUnix))`. Geen andere data.
- **Attributen:** `httpOnly; Secure; SameSite=Strict; Max-Age=30d`.
- **Twee cookies met dezelfde waarde**, want een cookie heeft maar één `Path`: `Path=/f` en `Path=/api/public/f`.
- **Bij elk verzoek:** HMAC + vervaldatum controleren, daarna `freelancer_links` lezen (actief, niet geblokkeerd) en de freelancer (niet gearchiveerd).
- **Bekend effect van SameSite=Strict:** wie de link in webmail (gmail.com) aanklikt, stuurt bij die eerste navigatie geen cookie mee. Daarom laadt `/f` als client-shell en vraagt hij de status op via `fetch` (same-site, dus de cookie gaat wel mee). Zo blijft Strict werken zonder dat de pincode telkens opnieuw gevraagd wordt.
- **Geen Supabase-sessie.** De middleware ziet geen gebruiker. Daarom geeft de linkcookie op **elke** interne route een 401 (getest in Fase 4).

### 4.4 Downloads — **beslissing nodig (V1)**
Drive kent geen echte "signed URL" voor bestanden van een service-account. De opties:

| Optie | Bytes via ons? | Kortlevend? | Opmerking |
|---|---|---|---|
| **A. Per bestand "iedereen met de link" + 302 naar `drive.usercontent.google.com/download?id=…&confirm=t`** | nee | **nee**: de permissie blijft tot we ze intrekken | Het ID wordt pas na de rechtencheck uitgegeven. We trekken de permissie in bij afgerond+30d, geannuleerd, intrekken van de link of archiveren. Werkt alleen als de (gedeelde) Drive delen met "anyone" toelaat; `sharePublicly` (`drive-storage.ts:143`) doet het al voor andere bestanden. |
| B. Supabase Storage met signed URL (60 s) | nee | ja | Telt mee voor de Supabase-egress (gratis plan) en de opslaglimiet van 1 GB. Opleveringen (video) passen daar niet in. |
| C. Service-account-token naar de browser | nee | ja | **Onaanvaardbaar**: dat token geeft toegang tot heel de Drive. |
| D. Streamen (huidig) | **ja** | n.v.t. | Verboden door de constraints. |

**Advies: optie A.** Ze is niet echt kortlevend; dat is een afwijking van de constraint (A4). Wie een downloadlink doorstuurt, geeft dat bestand weg tot we het intrekken, maar dat kan met een gewone bijlage ook. Oude Storage-bestanden krijgen een signed URL van 60 s en een redirect: geen bytes via ons, en wél kortlevend.

### 4.5 Rate limiting — **voorstel, vraagt akkoord (V2)**
Er is geen bestaand mechanisme. Mijn voorstel, zonder nieuwe dependency:

- **Mechanisme:** de tabel `public_rate_limits` met een `security definer`-RPC `public_rate_hit()`. Eén DB-call per publiek verzoek, een vast tijdvenster en een atomische upsert.
- **Sleutel:** `sha256(ip + macKey)`; IP's worden nooit in plaintext opgeslagen. Het IP komt uit `x-forwarded-for` (eerste waarde), wat Vercel betrouwbaar zet.
- **Opruimen:** in dezelfde RPC worden rijen ouder dan 1 dag weggegooid, met een kans van 1%. Geen cron nodig.
- **In-memory** is geen optie: Fluid Compute deelt geen geheugen tussen instanties.

| Bucket | Limiet |
|---|---|
| `pin` | 10 / min per IP (bovenop de 5 pogingen per link) |
| `session` | 30 / min per IP |
| `read` (me, detail, file) | 120 / min per IP |
| `write` (action, availability) | 30 / min per IP |
| `upload` (session + finalize) | 60 / uur per link |

### 4.6 Rechten: bestaande gebruikers niet degraderen
- **Probleem:** wie nu `freelancers` heeft, is "beheren", maar krijgt na de nieuwe ladder alleen het effect van "bekijken". `freelancers_beheren` staat namelijk nog niet in hun `app_metadata`.
- **Voorstel:** een migratie die `freelancers_beheren` toevoegt aan `raw_app_meta_data.permissions.sections` van elke gebruiker die al `freelancers` heeft. Dat is exact, want vandaag bestaat alleen "beheren". Dit raakt `auth.users`, dus akkoord nodig (V4).
- **Alternatief:** na de deploy elke rol eenmaal opnieuw opslaan in Beheer → Rollen.

### 4.7 Uploads
- **Team (briefing):** `ALLOWED_UPLOAD_EXTS` (`upload-policy.ts:21`), max `MAX_UPLOAD_BYTES` = 2 GB, max 20 bestanden per keer.
- **Freelancer (oplevering):** dezelfde lijst **zonder** `CODE_EXTS` (html/js/svg/…), max 2 GB per bestand, max 20 per keer, max 100 per opdracht.
- **Server-side controle:**
  - De sessie wordt alleen geopend voor de map `Freelancers/<freelancer-id>/<assignment-id>`.
  - `finalize` vraagt de werkelijke naam, grootte en parents op bij Drive. Een verkeerde map of een verboden extensie gaat naar de prullenbak.
  - Dit is hetzelfde patroon als poolwagens `finalize`.
- **Mapnaam:** op id's in plaats van "naam — titel". Zo is hij stabiel bij hernoemen en lekt hij niets.
- **Bestaande bestanden** blijven waar ze staan; downloaden gaat via `drive_file_id`, niet via het pad.

### 4.8 Headers
- **Voor `/f` en `/api/public/f/*`** zet de middleware: `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- **Daarnaast** een CSP `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://www.googleapis.com; img-src 'self' data: https://*.supabase.co; frame-ancestors 'none'`.
  - `'unsafe-inline'` is nodig voor de inline-scripts van Next; strenger kan met nonces, maar dat is meer werk.
  - Er komen geen analytics of scripts van derden in de `/f`-layout.

---

## 5. Plekken in de code die freelancer-accounts behandelen

| Plek | Wat | Fase 6 |
|---|---|---|
| `src/app/api/freelancers/route.ts:49-57` | `auth.admin.createUser({ app_metadata: { freelancer: true } })` | al weg in Fase 1 |
| `src/components/admin/UsersPage.tsx:933-1030, 1040-1094, 1137, 1159-1163, 1244-1270, 1354-1362` | invite-modal, badge, uitsluiting uit bulkselectie | verwijderen |
| `src/app/auth/callback/route.ts:38-53` | redirect naar /portal (vlag + e-mailopzoeking) | verwijderen |
| `src/lib/supabase/middleware.ts:4,27-29,90-107` | freelancer-tak, `isPortalPage`, `isPortalApiPage` | verwijderen |
| `src/app/portal/layout.tsx`, `page.tsx` | e-mailopzoeking | → uitlegpagina |
| `src/app/api/portal/assignments/route.ts:12`, `[id]/route.ts:21`, `files/route.ts:23`, `files/thumbnail/route.ts:25` | e-mailopzoeking | verwijderen |
| `src/components/portal/FreelancerPortal.tsx`, `PortalLogout.tsx` | portaal-UI | verwijderen |
| `src/lib/auth-permissions.ts:15-20` | `isFreelancerUser` | verwijderen + aanroepers opschonen ↓ |
| `src/app/api/files/download/route.ts:40`, `sporthouse/documents/download/route.ts:25`, `preassist/download/route.ts:28` | weigeren freelancer-account | check weg (de middleware-uitzondering blijft; de login-check blijft) |
| `src/lib/planning-access.ts:72`, `src/lib/poolwagens/access.ts:22`, `src/lib/gear/people.ts:17` | freelancer-accounts uitsluiten | check weg — **buiten domein, vraagt akkoord** |
| SQL: `0072:163-171`, `0076:38`, `0090:34-47` | `app_metadata ->> 'freelancer'` | functies vervangen in 0093 — **buiten domein, vraagt akkoord** |
| `src/app/api/admin/users/[id]/route.ts:76-85` | e-mail meeveranderen naar `freelancers` | verwijderen (geen koppeling meer) |
| Tests: `poolwagens-access`, `gear-access`, `gear-people`, `middleware-public-pages`, `poolwagens-routes` | testen het freelancer-account | mee aanpassen |
| `src/app/page.tsx:11,31`, `privacy/page.tsx`, `terms/page.tsx`, `src/lib/legal.ts:38` | tekst "portal/accounts" | **buiten domein, apart voorstel** |

**Geen** account-code, maar wél afhankelijk van de tabel `freelancers` (blijft werken, met aanpassingen):

- `src/app/api/materiaal/options/route.ts:20`: zie V6.
- `src/lib/gear/mail-server.ts:132`: zie V8.

---

## 6. Componentenboom

Alles in `src/features/freelancers/`, max ~300 regels per bestand. **Hergebruikte bestaande UI:**

| Bestaand | Waarvoor |
|---|---|
| `components/materiaal/ui.tsx` (`Field`, `inputCls`, `textareaCls`, `labelCls`, `Button`, `PrimaryButton`, `IconButton`, `Segmented`, `Select`, `ErrorLine`, `ACCENT`, `send`) | alle formulieren, knoppen en segmented controls |
| `components/poolwagens/ui.tsx` `Modal` | modals (+ Freelancer, bevestigingen, pincode tonen) |
| `components/poolwagens/ClientPicker.tsx` | klantkeuze met vrije fallback |
| `components/materiaal/Toast.tsx` | toasts ("Staat nu op de link van …") |
| `lib/drive-upload-client.ts` `putFileToDrive` + `lib/pending-uploads.ts` | uploads met voortgang en hervatten |
| `components/public/PublicShell.tsx` `LogoMark` | logo bovenaan `/f` |
| `lucide-react` | iconen (al in gebruik) |

Nieuw, maar klein en lokaal in features: `BottomSheet`, `StarInput` (≥44px), `AvailabilityDot`, `RelativeDeadline`, `StatusStepper`, `EmptyState`. Er bestaat nog geen bottom sheet in de app.

```
src/features/freelancers/
├── lib/                         (server + gedeeld, geen React)
│   ├── access.ts                requireFreelancers(level), canManage(user)
│   ├── schemas.ts               Zod-whitelists (intern + publiek)
│   ├── transitions.ts           ALLOWED, canTransition(from,to,actor), visibility-regels
│   ├── link-crypto.ts           token, hash, AES-GCM, pin-hash, HKDF
│   ├── link-session.ts          cookie maken/lezen, resolveLinkFromCookie()
│   ├── public-select.ts         expliciete kolomlijsten + toPublicAssignment()
│   ├── rate-limit.ts            rateHit(bucket, req)
│   ├── files.ts                 uploadfolder, finalize, downloadRedirect (optie A/B)
│   ├── match.ts                 voorfilter + Claude tool-use
│   └── format.ts                bedrag, tarief, relatieve deadline, beoordelingstekst
├── internal/
│   ├── FreelancersShell.tsx     tabs Freelancers|Opdrachten + 2 knoppen, URL-state
│   ├── list/
│   │   ├── FreelancerTable.tsx      desktop-tabel
│   │   ├── FreelancerCards.tsx      mobiele kaarten (tel:/mailto:)
│   │   ├── FreelancerFilters.tsx    statustabs, disciplinechips, "Nu beschikbaar", zoek
│   │   └── FilterSheet.tsx          mobiele bottom sheet
│   ├── AddFreelancerModal.tsx
│   ├── assignments/
│   │   ├── AssignmentsOverview.tsx  "Wacht op ons", Gedeeld, Lopend, Concepten, Recent
│   │   ├── AssignmentRow.tsx
│   │   ├── AssignmentPanel.tsx      zijpaneel / fullscreen op mobiel
│   │   ├── AssignmentActions.tsx    primaire volgende stap + menu "Meer"
│   │   ├── AssignmentActivity.tsx   events, met markering "zichtbaar voor freelancer"
│   │   ├── AssignmentFiles.tsx      bijlagen + opleveringen
│   │   ├── ReviewDialog.tsx         sterren, subscores ingeklapt, "Later beoordelen"
│   │   ├── ShareFlow.tsx            delen → evt. eerst link + pincode → toast
│   │   └── NewAssignmentForm.tsx    één formulier + FreelancerSuggestions
│   │       └── FreelancerSuggestions.tsx  gefilterde lijst + "AI-suggestie"
│   ├── profile/
│   │   ├── ProfileHeader.tsx
│   │   ├── ProfileOverview.tsx      kaarten Contact/Tarief/Beschikbaarheid/Beoordeling/Portfolio/Notities
│   │   ├── EditableCard.tsx         Opslaan/Annuleren per kaart
│   │   ├── ProfileAssignments.tsx
│   │   └── LinkTab.tsx              status + Link kopiëren/Bericht/Delen/Nieuwe pincode/Nieuwe link/Intrekken
│   └── ui/                      BottomSheet, StarInput, AvailabilityDot, StatusStepper, EmptyState, UploadList
└── public/
    ├── LinkApp.tsx              shell: leest token, roept session aan, kiest scherm
    ├── InvalidLink.tsx          één generieke pagina
    ├── PinScreen.tsx            4 vakjes, one-time-code, plakken, auto-submit
    ├── Home.tsx                 "Hoi [voornaam]" + secties
    ├── AvailabilityCard.tsx
    ├── AssignmentCard.tsx
    ├── AssignmentDetail.tsx
    ├── ActionBar.tsx            per status
    └── DeliveryUpload.tsx       meerdere bestanden, voortgang, opnieuw proberen, waarschuwing
```

De pagina's in `src/app/` zijn dun: de server-check plus het component uit features. `src/app/f/` krijgt een eigen `layout.tsx`, zonder iets uit `(app)`.

---

## 7. Afwijkingen van `<target_design>`, met reden

| # | Afwijking | Reden |
|---|---|---|
| A1 | De middleware laat "exact" `/f*` en `/api/public/f/*` door **naast** de bestaande publieke paden | `/`, `/privacy`, `/terms`, `/s/`, `/p/`, `/api/planning/mine`, `/api/save-reel` en `/api/materiaal/mail/due` zijn al publiek en vallen buiten scope. Ik voeg alleen toe en verruim niets. |
| A2 | **Linkformaat `/f#<token>` in plaats van `/f/<token>`** (advies; zie V9) | Een token in het pad komt in de request-logs van Vercel terecht, en dat schendt "tokens nooit in plaintext in logs". Het fragment wordt nooit naar de server gestuurd. De shell leest het en stuurt het in een POST-body. |
| A3 | Pincode met pepper + escalerende blokkering | §4.2: zonder die maatregelen is 4 cijfers te zwak tegen offline of langdurig raden. |
| A4 | Downloads via Drive "anyone with link" met intrekking, niet echt kortlevend | §4.4: Drive biedt niets anders zonder dat de bytes via ons lopen. |
| A5 | Events: `actor_type` + `actor_id` in plaats van één kolom "medewerker-id of 'freelancer'", plus een kolom `kind` | Een uuid en een tekst in één kolom kan geen FK hebben. `kind` is nodig voor "bekeken", "bestand" en "beschikbaarheid". |
| A6 | Bestandskolommen behouden hun huidige namen (`file_name`, `file_size`, `file_type`, `uploaded_at`) | Hernoemen breekt de huidige code vóór Fase 6 en levert niets op. |
| A7 | Extra kolommen: `status_changed_at`, `updated_at`, `legacy_project_id`, `public_shared_at`, `lockout_count`; `created_by` wordt een uuid en de oude tekstkolom heet `created_by_email` | Nodig voor "< 30 dagen", "opgeleverd op", een idempotente migratie, het intrekken van Drive-delen en de escalerende blokkering. |
| A8 | Het droppen van oude kolommen en tabellen gebeurt in een aparte migratie (0093, Fase 6) | Verwijderen vraagt akkoord, en de huidige code moet tot Fase 6 blijven werken. |
| A9 | Avatar-upload via een signed upload-URL van Supabase Storage (browser → Storage) | Nu lopen de avatar-bytes door onze function. |
| A10 | Model voor de match | Er is geen gedeelde constante. Voorstel: `const MATCH_MODEL = 'claude-sonnet-4-6'` (de meest gebruikte string) in `features/freelancers/lib/match.ts`. Zeg het als je liever een ander model wilt. |
| A11 | Meldingen via `pushToUsers` (web-push) | Er is geen meldingenlijst in de app, wel push per gebruiker. Werkt alleen voor wie push aanzette; anders blijven het tabblad Opdrachten en de log over. |
| A12 | De AI-match vereist "beheren" (niet "bekijken") | De match is alleen nuttig bij het aanmaken van een opdracht (beheren) en kost API-tokens. |
| A13 | "Bekijken" ziet `overall_rating` en reviews alleen-lezen (zie V5) | "Bekijken ziet alles" versus "overall_rating en reviews vereisen beheren": ik lees het tweede als *wijzigen*. |

---

## 8. Beslissingen (stand na Fase 0)

| # | Vraag | Beslist |
|---|---|---|
| V1 | Downloads | **Beslist:** tijdelijk "iedereen met de link", onder deze voorwaarden: (a) enkel het individuele bestand, nooit een map; (b) automatisch ingetrokken na 1 uur; (c) een nachtelijke opruimtaak die elke achtergebleven publieke deling op freelancerbestanden intrekt en dat logt; (d) de deling pas aanmaken ná de controle van link, pincode en eigenaarschap. **Interne downloads:** de `webViewLink` van Drive, zonder publieke deling, *als* het team via Workspace toegang heeft. **Aandachtspunten voor Fase 3:** (1) Vercel-crons draaien op het gratis plan maar één keer per dag. "Na 1 uur" moet dus anders: het opruimen gebeurt bij elk volgend verzoek, aangevuld met een uurlijkse trigger (pg_cron of het bestaande Apps Script-patroon). Dat voorstel volgt in Fase 3. (2) Of medewerkers de Shared Drive zelf kunnen openen, valt niet uit de code af te leiden: `.env.example` zegt alleen dat het service-account "Content Manager" is. Dat moet jij of de Workspace-beheerder bevestigen vóór Fase 3. |
| V2 | Rate limiting | **Beslist:** de Postgres-tabel + RPC uit §4.5. |
| V3 | Escalerende blokkering | **Beslist (akkoord met de extra pincodebeveiliging):** na 3 blokkeringen binnen 24 u blijft de link geblokkeerd tot er een nieuwe pincode is. |
| V4 | Bestaande rechten | **Beslist:** geen migratie op `auth.users`; het moet achterwaarts compatibel zijn. De bestaande sleutel `freelancers` betekent "beheren". "Bekijken" krijgt de nieuwe sleutel `freelancers_bekijken`. `withImpliedSections()` (`src/lib/auth-permissions.ts`) leidt `freelancers_bekijken` af uit `freelancers`, zodat ook accounts waarvan de sleutels nog niet herberekend zijn beide hebben. Een test bewaakt dat niemand rechten verliest. **Dit vervangt §3/§4.6:** overal waar `freelancers_beheren` staat, lees `freelancers`; waar "bekijken" staat, lees `freelancers_bekijken`. |
| V5 | Ziet "bekijken" overall_rating en reviews? | **Eigen advies gevolgd:** alleen-lezen zichtbaar; wijzigen vereist "beheren" (A13). |
| V6 | Materiaalplanner | **Beslist:** een `security definer`-functie `freelancer_picker()` (alleen id + naam van niet-gearchiveerde freelancers) plus één regel in `materiaal/options/route.ts`. Verder niets in de materiaalplanner. **Gecontroleerd:** een boeking slaat de freelancer op als `gear_bookings.freelancer_id → freelancers(id)` (`0072_gear_bookings.sql:30`), met de naam als snapshot in `person_name`. `gear_resolve_holder` (security definer) leest `freelancers.name` op id. Geen e-mail en geen user-id, dus **geen omzetting nodig**. |
| V7 | Freelancer verwijderen | **Eigen advies gevolgd:** de DELETE blijft voor freelancers zonder opdrachten; anders archiveren. |
| V8 | Mails materiaalplanner | **Beslist:** blijven zoals ze zijn en vallen buiten de regel; `gear/mail-server.ts` wordt niet gewijzigd. **Gecontroleerd:** het e-mailadres komt al uit het freelancerprofiel (`freelancers.email` via `freelancer_id`, `mail-server.ts:130-135`), niet uit een Auth-account. Na de migratie blijft dat zo (de kolom blijft, alleen het type wordt citext). |
| V9 | Linkformaat | **Beslist:** `/f#token`. |
| V10 | Zod | **Beslist:** toegevoegd als dependency. |
| V11 | `FREELANCER_LINK_SECRET` | **Beslist:** de gebruiker zet de waarde zelf. De code leest hem uit `process.env` en faalt duidelijk als hij ontbreekt. De naam komt in `.env.example`, zonder waarde (in Fase 3, als de code hem leest). |
| — | Shared Drive (V1, interne download) | **Nog niet bekend → tijdelijke deling als standaard.** Omschakelen kan met één regel: `INTERNAL_DOWNLOAD_MODE` in `src/features/freelancers/lib/config.ts`. |
| — | Data | **Alle freelancertabellen zijn leeg** (dry-run, 2026-11-13): 0 freelancers, projecten, opdrachten en bestanden; 0 materiaalboekingen met een freelancer; 0 accounts met de freelancervlag. Geen extra werk aan achterwaartse compatibiliteit van data. |
| — | Planning | **Fase 6** = alleen code verwijderen (er zijn geen accounts op te ruimen). **Fase 7** (spreadsheet importeren) is niet langer optioneel en komt direct na Fase 5. |
| V12 | Juridische teksten | **Open**, buiten het domein: in Fase 6 opnieuw vragen. |
| V13 | Checks op freelancer-accounts in planning, poolwagens en gear | **Open**, buiten het domein: in Fase 6 opnieuw vragen. |
| — | Model voor de match | **Beslist:** `claude-sonnet-4-6`, in één constante in de freelancermodule. De andere Claude-calls blijven ongewijzigd. |
| — | Twee migraties | **Beslist:** akkoord. **Nummering:** 0092 = RLS (Fase 1), 0093 = datamodel (Fase 2), 0094 = opruimen (Fase 6). |

## 9. Testaanpak
- **Framework:** `vitest`, zoals in de bestaande `src/lib/__tests__` (52 bestanden).
- **Route-tests** gebruiken een nagemaakte Supabase, zoals in `poolwagens-routes.test.ts`.
- **Puur te testen:** `transitions.ts` (de volledige matrix: elke van/naar-combinatie × actor), `link-crypto.ts`, `link-session.ts` en `public-select.ts`. Die laatste test op veldnamen dat er geen verboden velden in een response zitten.
- **Middleware-test:** een uitbreiding van `middleware-public-pages.test.ts`.
- **Commando's per fase:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- **UI-controle:** er is geen Playwright. Ik controleer met een checklist per scherm, tenzij je Playwright of de Chrome-extensie wilt laten gebruiken.

---

## 10. Voortgang

### Fase 1 — Beveiliging van de huidige routes (klaar, niet gecommit)

**Wat er veranderd is:**

- **Rechtenladder** (`src/lib/access-roles.ts`): geen / **bekijken** (`freelancers_bekijken`, nieuw) / beheren (`freelancers`, de bestaande sleutel).
  - `IMPLIED_SECTIONS` + `withImpliedSections()` (`src/lib/auth-permissions.ts`) leiden "bekijken" af uit de oude sleutel, ook in `getSections()`, `levelsFromSections()` en de zijbalk.
- **Gedeelde helper** `src/features/freelancers/lib/access.ts` (puur) + `server.ts` (`requireFreelancers`, `parseBody`, `isUuid`). De zeven eigen kopieën zijn weg.
- **Zod-whitelists** (`src/features/freelancers/lib/schemas.ts`) op elke schrijfroute; alles is `strictObject`.
- **Elke route** onder `/api/freelancers/**` vraagt nu bekijken (GET) of beheren (schrijven, match).
- **Opdrachten, bestanden en projecten** worden gezocht onder de freelancer uit de URL.
- **`POST /api/freelancers`** maakt geen Auth-gebruiker meer.
- **De match** haalt de profielen zelf op; van de browser tellen alleen de ids.
- **`(app)/freelancers/page.tsx`**: `permissions === null` geeft geen toegang meer.
- **`FreelancersPage.tsx`** (de oude UI, voorlopig): opdracht toevoegen, bewerken en verwijderen en de AI-match zijn verborgen zonder "beheren"; `specialties: []` wordt niet meer meegestuurd.
- **Migratie `0092_freelancers_rls_niveaus.sql`** (**niet uitgevoerd**): select/insert op `freelancers` en select/insert/delete op `freelancer_projects` volgen de niveaus. Daarnaast `freelancer_picker()`.
- **`src/app/api/materiaal/options/route.ts`**: één regel, `rpc('freelancer_picker')`.

**Volgorde bij uitrol:** voer migratie 0092 uit vóór of samen met de deploy. Zonder de migratie geeft `freelancer_picker` een fout en blijft de freelancerkeuze in de materiaalplanner leeg; de rest blijft werken.

**Nog niet in Fase 1** (volgt in Fase 3): uploads en downloads lopen nog via onze function, en `listBuckets()` bij de avatar blijft.

### Fase 1 — aanvulling (na de review)

**Lezers van `freelancers` buiten de tool en het portaal** (gecontroleerd vóór 0092, bewaakt door `src/lib/__tests__/freelancer-picker.test.ts`):

| Plek | Client | Gevolg na 0092 |
|---|---|---|
| `src/app/api/materiaal/options/route.ts:20` (keuzelijst) | gebruikersclient → nu `rpc('freelancer_picker')` | blijft werken via de security definer-functie; **zonder 0092 is de lijst leeg** |
| `src/lib/gear/mail-server.ts:132` (e-mail van de freelancer) | service-role | geen gevolg |
| `gear_resolve_holder` (`0072:139`, aangeroepen door `gear_create_booking`/`gear_update_booking`, 0074/0083/0085) | security definer | geen gevolg |
| boekingen en overzichten van de materiaalplanner | lezen `gear_bookings.person_name` (snapshot), niet `freelancers` | geen gevolg |
| `gear_bookings.freelancer_id` FK | FK-controles negeren RLS | geen gevolg |
| `src/components/admin/UsersPage.tsx:1079,1358` (badge) | `GET /api/freelancers` → `requireFreelancers('bekijken')`; Beheer → Gebruikers is alleen voor admins (`admin/layout.tsx:12`) | geen gevolg |
| `src/app/auth/callback/route.ts:46` | service-role | geen gevolg |
| `src/app/api/admin/users/[id]/route.ts:79,82` | service-role | geen gevolg |
| portaal (`src/app/portal/*`, `src/app/api/portal/*`) | service-role | **breekt niet** door 0092 |

Er staan geen views of policies van andere tabellen die `freelancers` lezen.

**De knop "Freelancer uitnodigen"** in Beheer → Gebruikers is verborgen (`FREELANCER_INVITE_ENABLED = false`). In Fase 6 verdwijnt hij definitief.

### Fase 2 — Datamodel en migratie (klaar, niet uitgevoerd)

| Bestand | Wat |
|---|---|
| `supabase/migrations/0093_freelancers_datamodel.sql` | De migratie. Voegt toe en zet over; verwijdert niets. Begint met voorwaarden (stopt vóór elke wijziging) en eindigt met een controle (breekt af als een oude waarde geen plek kreeg). |
| `supabase/freelancers/0093_dryrun.sql` | **Vóór de migratie.** Eén SELECT, alleen lezen: rijen per tabel, blokkerende problemen, per freelancer de oude rating, overall_rating en review_avg, en waar elke rij terechtkomt. |
| `supabase/freelancers/0093_test.sql` | **Na de migratie.** In `begin … rollback`: structuur, overgezette data, triggers, view, picker en rate limit. |
| `src/lib/__tests__/freelancers-migration.test.ts` | Statische controle van de drie bestanden. |

**Afwijkingen tegenover het concept in §2:**

- `rate_amount` en `agreed_amount` zijn `numeric` zonder schaal, zodat er geen afrondingsverlies is.
- `freelancer_links` heeft een extra kolom `lockout_window_start`, voor de escalerende blokkering (V3).
- Bestanden hebben een extra kolom `public_permission_id`, nodig om een Drive-deling in te trekken.
- `freelancer_projects` krijgt geen nieuwe inserts meer (de policy is weg); de tabel en de rijen blijven.
- Een trigger controleert dat elke discipline bestaat.
- Archiveren trekt de link in via een trigger.
- Een nieuwe opdracht staat standaard op `concept`.

**Gevolg voor de oude code:** de oude opdrachtroutes en het portaal schrijven status `nieuw` en een e-mailadres in `created_by`. Na 0093 werken ze niet meer voor opdrachten. Draai 0093 daarom samen met de code van Fase 3. De functie is niet in gebruik, dus dat is aanvaard.

### Fase 2 — aanvulling: volgorde en proefdraai

**Aanleiding:** 0093 werd gedraaid vóór 0092 en stopte op `user_can_view_freelancers() does not exist`. Er bleef niets achter: de SQL-editor draait een script als één transactie.

**Wat er veranderd is:**

- **0093 controleert nu eerst of 0092 er is** (functies, policies, en dat de open policies weg zijn). Zo niet, dan stopt ze met "draai eerst 0092", vóór er iets verandert.
- **De dry-run hangt niet af van 0092 of 0093.** Sectie 0 zoekt alleen op of ze al gedraaid zijn.
- **Nieuwe scripts:**
  - `supabase/freelancers/0092_test.sql`: rechten per soort gebruiker, uitgevoerd als `authenticated` met nagemaakte claims.
  - `0092_proefdraai.sql` en `0093_proefdraai.sql`: gegenereerd door `scripts/freelancers-proefdraai.mjs`. Een test faalt als ze verouderd zijn.
  - `0093_test.sql` controleert nu ook de rechten op de nieuwe tabellen.

**Volgorde (SQL-editor van Supabase):**

| Stap | Script | Verwacht resultaat |
|---|---|---|
| 1 | `supabase/freelancers/0093_dryrun.sql` | één tabel; sectie 0: beide "uitgevoerd: false"; sectie 2 leeg |
| 2 | `supabase/freelancers/0092_proefdraai.sql` | "Proefdraai 0092 geslaagd — er is niets blijven staan" |
| 3 | `supabase/freelancers/0093_proefdraai.sql` | "Proefdraai 0092 + 0093 geslaagd — er is niets blijven staan" |
| 4 | `supabase/migrations/0092_freelancers_rls_niveaus.sql`, vlak voor de deploy van Fase 1 | "Success. No rows returned" |
| 5 | `supabase/freelancers/0092_test.sql` | "Alle tests van 0092 geslaagd — er is niets blijven staan" |
| 6 | `supabase/migrations/0093_freelancers_datamodel.sql`, samen met de deploy van Fase 3 | "Success. No rows returned" |
| 7 | `supabase/freelancers/0093_test.sql` | "Alle tests van 0093 geslaagd — er is niets blijven staan" |

### Fase 3 — Interne API (klaar, niet gecommit)

**PR #264** (alleen Fase 1, tot `9b6775c`) staat klaar, met de vermelding dat 0092 al gedraaid heeft.

**Nieuwe en gewijzigde routes** (rechten: §3.1):

- `/api/freelancers` (GET, POST)
- `/[id]` (GET, PATCH, DELETE)
- `/[id]/archive`, `/[id]/rating`
- `/[id]/link`, `/link/pin`, `/link/url`
- `/[id]/avatar` (signed upload)
- `/api/freelancers/assignments` (GET, POST)
- `/assignments/[id]` (GET, PATCH), `/transition`, `/review`
- `/assignments/[id]/files/upload-session`, `/finalize`, `/[fileId]` (GET = 302, DELETE)
- `/api/freelancers/disciplines` (+ `/[key]`)
- `/api/freelancers/match`
- `/api/cron/freelancer-shares`

**Lib** (`src/features/freelancers/lib/`):

| Bestand | Inhoud |
|---|---|
| `config.ts` | model, downloadmodus, limieten |
| `statuses.ts` | de enige overgangstabel |
| `assignments-server.ts` | `applyTransition` met optimistische controle, en events |
| `link-crypto.ts` | token, AES-GCM, gepeperde scrypt |
| `links-server.ts` | links beheren |
| `share.ts` | delen, met zo nodig eerst een link |
| `drive-files.ts` | Drive zonder automatisch delen |
| `files-server.ts` | upload, finalize, download, intrekken |
| `match.ts` | voorfilter + `messages.parse` met een Zod-schema |
| `columns.ts`, `schemas.ts` | kolomlijsten en whitelists; `schemas-legacy.ts` voor de oude geneste routes |

**Tests:**

- `freelancers-transitions.test.ts`: alle 98 combinaties (7 × 7 statussen × 2 actoren); er zijn er precies 12 toegelaten.
- `freelancers-link-crypto.test.ts`
- `freelancers-api.test.ts`: rechten per route; overgangen via de route; delen met link en pincode; download = 302 zonder bytes; finalize gelooft Drive; reviews; dat alleen `/rating` `overall_rating` schrijft; cron; match.

**Bekend en aanvaard:** de oude pagina `FreelancersPage.tsx` spreekt de API nog aan met het oude model. Aanmaken, bewerken, match en avatar geven nu een 400. Fase 5 vervangt de pagina; de functie is niet in gebruik.

**Voorstel: delingen elk uur intrekken (V1, pg_cron)**

- **Probleem:** de route `/api/cron/freelancer-shares` moet zonder login bereikbaar zijn, beveiligd met `CRON_SECRET`. De middleware laat dat nu niet toe (zie hieronder).
- **Uitvoering:** pg_cron + pg_net zijn Supabase-extensies, geen npm-dependency. Het geheim staat in Supabase Vault.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- eenmalig, met de waarde van CRON_SECRET:
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
select cron.schedule('freelancer-shares-uur', '5 * * * *', $job$
  select net.http_get(
    url := 'https://sporthouse-hub-ten.vercel.app/api/cron/freelancer-shares?modus=uur',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$job$);
select cron.schedule('freelancer-shares-nacht', '15 3 * * *', $job$
  select net.http_get(
    url := 'https://sporthouse-hub-ten.vercel.app/api/cron/freelancer-shares?modus=nacht',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$job$);
```

- **Waarom ook de nachtronde via pg_cron:** de bestaande Vercel-crons komen niet door de middleware (zie hieronder).
- **Tot dit draait** trekt elke download de verlopen delingen in, na het antwoord (`after()`). Dat is een vangnet, geen garantie op "binnen het uur".

**Open punten (buiten het domein, vragen akkoord):**

1. **Middleware en cron.** `src/lib/supabase/middleware.ts` geeft op elk `/api/*`-verzoek zonder login een 401, ook op `/api/cron/*`. De bestaande Vercel-crons `expire-users` en `purge-trash` (`vercel.json`) worden dus vermoedelijk al een tijd tegengehouden, nog vóór hun `CRON_SECRET`-controle. Voor de freelancer-cron is een uitzondering nodig, en dat botst met "exact `/f/*` en `/api/public/f/*`". Opties:
   - (a) alleen `/api/cron/freelancer-shares` toelaten;
   - (b) `/api/cron/*` toelaten; dat herstelt meteen de bestaande crons, en elke cronroute controleert zelf `CRON_SECRET`.
2. **`getFileMetadata()` en `uploadFile()` in `src/lib/drive-storage.ts` delen elk bestand blijvend met "iedereen met de link"** (`sharePublicly`). Dat geldt voor alle uploads via finalize: gewone bestanden, pré-assist, poolwagens-schade en de interne documenten van Sporthouse (`sporthouse/documents/finalize`). Bij die laatste staat in de code dat ze bewust geïsoleerd moeten blijven. Of het delen echt lukt, hangt af van de instellingen van de Shared Drive: de fout wordt stil gelogd. De freelancercode gebruikt die functies niet.
