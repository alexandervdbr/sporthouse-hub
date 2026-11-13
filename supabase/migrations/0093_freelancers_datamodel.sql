-- Freelancers: het nieuwe datamodel (Fase 2 van docs/freelancers-redesign.md).
--
-- Freelancers krijgen geen account meer, maar een persoonlijke link met een
-- pincode. Opdrachten worden de enige tijdlijn: de oude projecthistoriek
-- (freelancer_projects) wordt afgeronde, historische opdrachten, en hun score
-- wordt een review. review_avg wordt nergens opgeslagen (view
-- freelancer_stats); overall_rating is een handmatig cijfer.
--
-- ALLEEN TOEVOEGEN EN OVERZETTEN. Er wordt in deze migratie niets
-- verwijderd: geen kolom, geen tabel, geen rij. Oude kolommen (rating,
-- tested, types, specialties, hourly_rate, price_info, portfolio_url, bio,
-- created_by_email) en de tabel freelancer_projects blijven staan tot de
-- opruimmigratie aan het eind van het herontwerp, en die vraagt eerst
-- akkoord.
--
-- Twee dingen veranderen wél van vorm, omdat het nieuwe model ze anders nodig
-- heeft:
--   freelancers.email             text → citext, getrimd en in kleine letters,
--                                 uniek. Dubbels breken de migratie af (zie
--                                 de dry-run); er wordt niets samengevoegd.
--   freelancer_assignments.status text → enum, met nieuw → gedeeld,
--                                 in_behandeling → geaccepteerd,
--                                 afgerond → afgerond.
--   freelancer_assignments.created_by (een e-mailadres als tekst) heet
--                                 voortaan created_by_email; created_by wordt
--                                 een verwijzing naar auth.users.
-- Gevolg: de huidige routes en het portaal schrijven nog 'nieuw' en een
-- e-mailadres in created_by, en werken na deze migratie niet meer voor
-- opdrachten. Draai ze daarom samen met de code van Fase 3, niet eerder.
--
-- Supabase draait een migratie in één transactie. Het controleblok onderaan
-- telt na of elke oude waarde een plek kreeg, en breekt anders af: dan is er
-- niets veranderd.
--
-- Vereist 0092: zonder die migratie stopt deze met "draai eerst 0092",
-- vóór er iets verandert.
--
-- Vooraf: supabase/freelancers/0093_dryrun.sql (alleen lezen) toont wat er
-- waar terechtkomt, en supabase/freelancers/0093_proefdraai.sql draait 0092 +
-- 0093 + de controles in één transactie die teruggedraaid wordt.
-- Achteraf: supabase/freelancers/0093_test.sql.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Voorwaarden — afbreken vóór er iets verandert
-- ════════════════════════════════════════════════════════════════════════════

-- 0092 moet eerst gedraaid zijn: deze migratie bouwt op zijn functies en
-- policies (user_can_view_freelancers, freelancer_picker, en de leespolicies
-- in plaats van de open policies uit 0028).
do $$
declare v_ontbreekt text[] := '{}';
begin
  if to_regprocedure('public.user_can_view_freelancers()') is null then
    v_ontbreekt := v_ontbreekt || 'functie public.user_can_view_freelancers()';
  end if;
  if to_regprocedure('public.freelancer_picker()') is null then
    v_ontbreekt := v_ontbreekt || 'functie public.freelancer_picker()';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancers'
                  and policyname = 'freelancers can view freelancers') then
    v_ontbreekt := v_ontbreekt || 'policy "freelancers can view freelancers"';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancer_projects'
                  and policyname = 'freelancers can view freelancer_projects') then
    v_ontbreekt := v_ontbreekt || 'policy "freelancers can view freelancer_projects"';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and policyname in ('Auth read freelancers', 'Auth insert freelancers', 'Auth read freelancer_projects')) then
    v_ontbreekt := v_ontbreekt || 'de open policies uit 0028 staan er nog';
  end if;
  if cardinality(v_ontbreekt) > 0 then
    raise exception 'Migratie 0093 gestopt: draai eerst 0092 (0092_freelancers_rls_niveaus.sql). Ontbreekt: %',
      array_to_string(v_ontbreekt, '; ');
  end if;
end $$;

do $$
declare v_dubbel text; v_rating text; v_score text; v_status text; v_neg text;
begin
  -- Dubbele e-mailadressen na trimmen + kleine letters.
  select string_agg(format('%s (%s×)', e, n), ', ') into v_dubbel from (
    select lower(btrim(email)) e, count(*) n from public.freelancers
     where nullif(btrim(email), '') is not null
     group by 1 having count(*) > 1) d;
  if v_dubbel is not null then
    raise exception 'Migratie 0093 gestopt: dubbele e-mailadressen bij freelancers: %. Los ze eerst op (er wordt niets samengevoegd).', v_dubbel;
  end if;

  -- rating en score worden 1–5. Een andere waarde zou verloren gaan.
  select string_agg(format('%s=%s', id, rating), ', ') into v_rating
    from public.freelancers where rating is not null and rating not between 1 and 5;
  if v_rating is not null then
    raise exception 'Migratie 0093 gestopt: rating buiten 1–5: %', v_rating;
  end if;
  select string_agg(format('%s=%s', id, score), ', ') into v_score
    from public.freelancer_projects where score is not null and score not between 1 and 5;
  if v_score is not null then
    raise exception 'Migratie 0093 gestopt: projectscore buiten 1–5: %', v_score;
  end if;

  select string_agg(distinct status, ', ') into v_status
    from public.freelancer_assignments where status not in ('nieuw', 'in_behandeling', 'afgerond');
  if v_status is not null then
    raise exception 'Migratie 0093 gestopt: onbekende opdrachtstatus: %', v_status;
  end if;

  select string_agg(format('%s=%s', id, hourly_rate), ', ') into v_neg
    from public.freelancers where hourly_rate < 0;
  if v_neg is not null then
    raise exception 'Migratie 0093 gestopt: negatief uurtarief: %', v_neg;
  end if;
end $$;

create extension if not exists citext with schema extensions;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Types
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname = 'freelancer_status' and typnamespace = 'public'::regnamespace) then
    create type public.freelancer_status as enum ('kandidaat', 'proefopdracht', 'vast', 'inactief');
  end if;
  if not exists (select 1 from pg_type where typname = 'freelancer_rate_unit' and typnamespace = 'public'::regnamespace) then
    create type public.freelancer_rate_unit as enum ('uur', 'dag', 'project');
  end if;
  if not exists (select 1 from pg_type where typname = 'freelancer_availability' and typnamespace = 'public'::regnamespace) then
    create type public.freelancer_availability as enum ('beschikbaar', 'beperkt', 'niet_beschikbaar');
  end if;
  if not exists (select 1 from pg_type where typname = 'freelancer_assignment_status' and typnamespace = 'public'::regnamespace) then
    create type public.freelancer_assignment_status as enum
      ('concept', 'gedeeld', 'geaccepteerd', 'geweigerd', 'opgeleverd', 'afgerond', 'geannuleerd');
  end if;
end $$;

create or replace function public.freelancer_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Disciplines — beheerbaar, met een vaste sleutel
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.freelancer_disciplines (
  key         text primary key check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label       text not null check (length(btrim(label)) > 0),
  sort        int  not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists freelancer_disciplines_label_key
  on public.freelancer_disciplines (lower(btrim(label)));

-- De 13 types van de huidige tool (src/components/freelancers/FreelancersPage.tsx).
insert into public.freelancer_disciplines (key, label, sort) values
  ('story',            'Story',              10),
  ('video',            'Video',              20),
  ('foto-video',       'Foto/Video',         30),
  ('visuals',          'Visuals',            40),
  ('foto',             'Foto',               50),
  ('redacteur',        'Redacteur',          60),
  ('social-host',      'Social Host',        70),
  ('allround',         'Allround',           80),
  ('video-vfx-motion', 'Video (vfx/motion)', 90),
  ('grafisch-design',  'Grafisch Design',   100),
  ('online-editor',    'Online Editor',     110),
  ('vfx-generalist',   'VFX Generalist',    120),
  ('podcasting',       'Podcasting',        130)
on conflict (key) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. freelancers
-- ════════════════════════════════════════════════════════════════════════════

alter table public.freelancers
  add column if not exists disciplines     text[] not null default '{}',
  add column if not exists status          public.freelancer_status not null default 'kandidaat',
  add column if not exists rate_amount     numeric check (rate_amount >= 0),
  add column if not exists rate_unit       public.freelancer_rate_unit,
  add column if not exists rate_note       text,
  add column if not exists portfolio_links jsonb not null default '[]'::jsonb,
  add column if not exists availability    public.freelancer_availability not null default 'beschikbaar',
  add column if not exists available_from  date,
  add column if not exists availability_updated_at timestamptz,
  add column if not exists availability_updated_by text,
  add column if not exists overall_rating  smallint,
  add column if not exists overall_rating_note text,
  add column if not exists overall_rating_updated_at timestamptz,
  add column if not exists overall_rating_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at     timestamptz,
  add column if not exists updated_at      timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'freelancers_portfolio_links_array') then
    alter table public.freelancers add constraint freelancers_portfolio_links_array
      check (jsonb_typeof(portfolio_links) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'freelancers_availability_updated_by_check') then
    alter table public.freelancers add constraint freelancers_availability_updated_by_check
      check (availability_updated_by in ('team', 'freelancer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'freelancers_overall_rating_check') then
    alter table public.freelancers add constraint freelancers_overall_rating_check
      check (overall_rating between 1 and 5);
  end if;
  -- Een tarief met een eenheid, of geen van beide.
  if not exists (select 1 from pg_constraint where conname = 'freelancers_rate_unit_with_amount') then
    alter table public.freelancers add constraint freelancers_rate_unit_with_amount
      check ((rate_amount is null) = (rate_unit is null));
  end if;
end $$;

-- 3a. E-mail: trimmen, kleine letters, '' → null, dan citext en uniek.
update public.freelancers
   set email = nullif(lower(btrim(email)), '')
 where email is distinct from nullif(lower(btrim(email)), '');

alter table public.freelancers
  alter column email type extensions.citext using email::extensions.citext;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'freelancers_email_normalized') then
    alter table public.freelancers add constraint freelancers_email_normalized
      check (email is null or email::text = lower(btrim(email::text)));
  end if;
end $$;
create unique index if not exists freelancers_email_key
  on public.freelancers (email) where email is not null;

-- 3b. Overzetten. Elke oude waarde krijgt een plek; wat geen eigen veld
-- heeft, komt achteraan in de notities onder "Uit oud profiel:".
with oud as (
  select f.id,
         -- types die een discipline zijn (op label of sleutel, zonder hoofdletters)
         coalesce((
           select array_agg(distinct d.key order by d.key)
             from unnest(coalesce(f.types, '{}')) t
             join public.freelancer_disciplines d
               on lower(btrim(t)) in (lower(d.label), d.key)
         ), '{}') as disc,
         -- types die géén discipline zijn
         (select string_agg(btrim(t), ', ' order by t)
            from unnest(coalesce(f.types, '{}')) t
           where nullif(btrim(t), '') is not null
             and not exists (select 1 from public.freelancer_disciplines d
                              where lower(btrim(t)) in (lower(d.label), d.key))) as andere_types,
         (select string_agg(btrim(s), ', ' order by s)
            from unnest(coalesce(f.specialties, '{}')) s
           where nullif(btrim(s), '') is not null) as specialiteiten,
         nullif(btrim(f.bio), '') as bio,
         case when f.tested is not null and f.tested not in ('ja', 'weinig', 'nee')
              then f.tested end as vreemd_getest
    from public.freelancers f
)
update public.freelancers f set
  disciplines = oud.disc,
  status = case f.tested when 'ja' then 'vast'::public.freelancer_status
                         when 'weinig' then 'proefopdracht'::public.freelancer_status
                         else 'kandidaat'::public.freelancer_status end,
  overall_rating = f.rating,
  rate_amount = f.hourly_rate,
  rate_unit = case when f.hourly_rate is not null then 'uur'::public.freelancer_rate_unit end,
  rate_note = nullif(btrim(f.price_info), ''),
  portfolio_links = case when nullif(btrim(f.portfolio_url), '') is not null
                         then jsonb_build_array(jsonb_build_object('label', 'Portfolio', 'url', btrim(f.portfolio_url)))
                         else '[]'::jsonb end,
  notes = nullif(concat_ws(E'\n\n',
            nullif(btrim(f.notes), ''),
            case when oud.andere_types is not null or oud.specialiteiten is not null
                      or oud.bio is not null or oud.vreemd_getest is not null
                 then 'Uit oud profiel:' || concat_ws('',
                        case when oud.andere_types   is not null then E'\n- Andere types: '   || oud.andere_types end,
                        case when oud.specialiteiten is not null then E'\n- Specialiteiten: ' || oud.specialiteiten end,
                        case when oud.vreemd_getest  is not null then E'\n- Getest: '         || oud.vreemd_getest end,
                        case when oud.bio            is not null then E'\n- Bio: '            || oud.bio end)
            end), ''),
  updated_at = coalesce(f.created_at, now())
from oud
where oud.id = f.id;

-- 3c. Disciplines moeten in de tabel staan (een array kan geen FK hebben).
create or replace function public.freelancers_check_disciplines()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_onbekend text;
begin
  select string_agg(d, ', ') into v_onbekend
    from unnest(new.disciplines) d
   where not exists (select 1 from public.freelancer_disciplines x where x.key = d);
  if v_onbekend is not null then
    raise exception 'Onbekende discipline: %', v_onbekend using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists freelancers_check_disciplines on public.freelancers;
create trigger freelancers_check_disciplines
  before insert or update of disciplines on public.freelancers
  for each row execute function public.freelancers_check_disciplines();

drop trigger if exists freelancers_touch_updated_at on public.freelancers;
create trigger freelancers_touch_updated_at
  before update on public.freelancers
  for each row execute function public.freelancer_touch_updated_at();

create index if not exists freelancers_active_idx on public.freelancers (status) where archived_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. freelancer_assignments — de enige tijdlijn
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'freelancer_assignments' and column_name = 'created_by')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'freelancer_assignments' and column_name = 'created_by_email') then
    alter table public.freelancer_assignments rename column created_by to created_by_email;
  end if;
end $$;

alter table public.freelancer_assignments
  add column if not exists discipline        text references public.freelancer_disciplines(key) on update cascade,
  add column if not exists client_id         uuid references public.clients(id) on delete set null,
  add column if not exists agreed_amount     numeric check (agreed_amount >= 0),
  add column if not exists is_historical     boolean not null default false,
  add column if not exists created_by        uuid references auth.users(id) on delete set null,
  add column if not exists shared_at         timestamptz,
  add column if not exists first_viewed_at   timestamptz,
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists updated_at        timestamptz not null default now(),
  add column if not exists legacy_project_id uuid unique;

-- Status: tekst met check → enum.
alter table public.freelancer_assignments drop constraint if exists freelancer_assignments_status_check;
alter table public.freelancer_assignments alter column status drop default;
alter table public.freelancer_assignments
  alter column status type public.freelancer_assignment_status using (
    case status::text
      when 'nieuw'          then 'gedeeld'
      when 'in_behandeling' then 'geaccepteerd'
      when 'afgerond'       then 'afgerond'
      else status::text    -- herhaalde run: al een enumwaarde
    end)::public.freelancer_assignment_status;
alter table public.freelancer_assignments alter column status set default 'concept';

-- Bestaande opdrachten stonden al bij de freelancer, dus ze zijn gedeeld.
update public.freelancer_assignments
   set shared_at = coalesce(shared_at, created_at),
       status_changed_at = coalesce(created_at, status_changed_at),
       updated_at = coalesce(created_at, updated_at)
 where legacy_project_id is null and not is_historical;

-- Wie maakte de opdracht: van e-mailadres naar account, als het er nog is.
update public.freelancer_assignments a
   set created_by = u.id
  from auth.users u
 where a.created_by is null
   and a.created_by_email is not null
   and lower(btrim(u.email)) = lower(btrim(a.created_by_email));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Reviews — strikt intern
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.freelancer_reviews (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null unique references public.freelancer_assignments(id) on delete cascade,
  score               smallint not null check (score between 1 and 5),
  score_quality       smallint check (score_quality between 1 and 5),
  score_deadline      smallint check (score_deadline between 1 and 5),
  score_communication smallint check (score_communication between 1 and 5),
  comment             text,
  reviewer_id         uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists freelancer_reviews_touch_updated_at on public.freelancer_reviews;
create trigger freelancer_reviews_touch_updated_at
  before update on public.freelancer_reviews
  for each row execute function public.freelancer_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Events — wat er met een opdracht gebeurde
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.freelancer_assignment_events (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.freelancer_assignments(id) on delete cascade,
  actor_type    text not null check (actor_type in ('team', 'freelancer', 'systeem')),
  actor_id      uuid references auth.users(id) on delete set null,
  kind          text not null default 'status'
                check (kind in ('status', 'bericht', 'bestand', 'bekeken', 'beschikbaarheid', 'notitie')),
  from_status   public.freelancer_assignment_status,
  to_status     public.freelancer_assignment_status,
  message       text,
  visible_to_freelancer boolean not null default false,
  created_at    timestamptz not null default now(),
  -- Een medewerker-id alleen bij een medewerker.
  check (actor_type = 'team' or actor_id is null)
);
create index if not exists freelancer_assignment_events_assignment_idx
  on public.freelancer_assignment_events (assignment_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Projecthistoriek → historische opdrachten + reviews
-- ════════════════════════════════════════════════════════════════════════════
--
-- Per project één afgeronde opdracht met is_historical = true, herkenbaar aan
-- legacy_project_id (zo kan deze stap niet twee keer gebeuren). De tabel
-- freelancer_projects zelf blijft staan.
--   project_name → title          description → briefing
--   client_name  → client_name    date        → deadline
--   score 1–5    → review.score   notes       → review.comment
--   notes zonder score → een interne notitie bij de opdracht (een review
--   zonder score bestaat niet)

insert into public.freelancer_assignments
  (freelancer_id, title, briefing, client_name, deadline, status, is_historical,
   legacy_project_id, created_at, status_changed_at, updated_at)
select p.freelancer_id, p.project_name, nullif(btrim(p.description), ''), nullif(btrim(p.client_name), ''), p.date,
       'afgerond', true, p.id,
       coalesce(p.created_at, now()),
       coalesce(p.date::timestamptz, p.created_at, now()),
       coalesce(p.created_at, now())
  from public.freelancer_projects p
 where not exists (select 1 from public.freelancer_assignments a where a.legacy_project_id = p.id);

insert into public.freelancer_reviews (assignment_id, score, comment, created_at, updated_at)
select a.id, p.score, nullif(btrim(p.notes), ''), coalesce(p.created_at, now()), coalesce(p.created_at, now())
  from public.freelancer_projects p
  join public.freelancer_assignments a on a.legacy_project_id = p.id
 where p.score is not null
on conflict (assignment_id) do nothing;

insert into public.freelancer_assignment_events
  (assignment_id, actor_type, kind, message, visible_to_freelancer, created_at)
select a.id, 'systeem', 'notitie', 'Uit de projecthistoriek: ' || btrim(p.notes), false, coalesce(p.created_at, now())
  from public.freelancer_projects p
  join public.freelancer_assignments a on a.legacy_project_id = p.id
 where p.score is null
   and nullif(btrim(p.notes), '') is not null
   and not exists (select 1 from public.freelancer_assignment_events e
                    where e.assignment_id = a.id and e.kind = 'notitie' and e.actor_type = 'systeem');

-- Klant koppelen waar de naam precies één klant aanwijst. client_name blijft
-- staan (ook als terugval voor wie geen klant in de lijst is).
update public.freelancer_assignments a
   set client_id = m.id
  from (select lower(btrim(name)) as k, (array_agg(id))[1] as id
          from public.clients group by 1 having count(*) = 1) m
 where a.client_id is null
   and nullif(btrim(a.client_name), '') is not null
   and lower(btrim(a.client_name)) = m.k;

drop trigger if exists freelancer_assignments_touch_updated_at on public.freelancer_assignments;
create trigger freelancer_assignments_touch_updated_at
  before update on public.freelancer_assignments
  for each row execute function public.freelancer_touch_updated_at();

create index if not exists freelancer_assignments_status_idx
  on public.freelancer_assignments (status, status_changed_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Bestanden
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bestaande kolommen (file_name, file_size, file_type, uploaded_at, file_url,
-- storage_provider, drive_file_id, …) blijven zoals ze zijn: oude bestanden
-- in Drive én in Supabase Storage blijven te downloaden.

alter table public.freelancer_assignment_files
  add column if not exists kind        text not null default 'briefing',
  add column if not exists uploaded_by text not null default 'team',
  add column if not exists created_by  uuid references auth.users(id) on delete set null,
  -- Tijdelijke publieke deling in Drive (zie §4.4 van het plan): wanneer en
  -- met welk permissie-id, zodat ze na een uur ingetrokken kan worden.
  add column if not exists public_shared_at     timestamptz,
  add column if not exists public_permission_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'freelancer_assignment_files_kind_check') then
    alter table public.freelancer_assignment_files add constraint freelancer_assignment_files_kind_check
      check (kind in ('briefing', 'oplevering'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'freelancer_assignment_files_uploaded_by_check') then
    alter table public.freelancer_assignment_files add constraint freelancer_assignment_files_uploaded_by_check
      check (uploaded_by in ('team', 'freelancer'));
  end if;
end $$;

create index if not exists freelancer_assignment_files_public_idx
  on public.freelancer_assignment_files (public_shared_at) where public_shared_at is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Persoonlijke links — alleen voor de service-role
-- ════════════════════════════════════════════════════════════════════════════
--
-- Token en pincode staan nooit in plaintext in de database:
--   token_hash      SHA-256 van het token, voor het opzoeken
--   token_encrypted AES-256-GCM, zodat "beheren" de link opnieuw kan kopiëren
--   pin_hash        scrypt van de gepeperde pincode
-- RLS staat aan zonder één policy: geen enkele ingelogde gebruiker leest of
-- schrijft hier rechtstreeks.

create table if not exists public.freelancer_links (
  id                  uuid primary key default gen_random_uuid(),
  freelancer_id       uuid not null references public.freelancers(id) on delete cascade,
  token_hash          bytea not null unique check (octet_length(token_hash) = 32),
  token_encrypted     bytea not null,
  pin_hash            text  not null,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  revoked_at          timestamptz,
  last_opened_at      timestamptz,
  failed_pin_attempts int not null default 0 check (failed_pin_attempts >= 0),
  locked_until        timestamptz,
  lockout_count       int not null default 0 check (lockout_count >= 0),
  lockout_window_start timestamptz
);
create unique index if not exists freelancer_links_one_active
  on public.freelancer_links (freelancer_id) where revoked_at is null;
alter table public.freelancer_links enable row level security;

-- Archiveren trekt de link meteen in, ongeacht welke route archiveert.
create or replace function public.freelancers_revoke_links_on_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    update public.freelancer_links set revoked_at = now()
     where freelancer_id = new.id and revoked_at is null;
  end if;
  return new;
end $$;
revoke all on function public.freelancers_revoke_links_on_archive() from public, anon, authenticated;

drop trigger if exists freelancers_revoke_links_on_archive on public.freelancers;
create trigger freelancers_revoke_links_on_archive
  after update of archived_at on public.freelancers
  for each row execute function public.freelancers_revoke_links_on_archive();

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Rate limiting voor de publieke link (V2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Vast tijdvenster per (bucket, sleutel). De sleutel is een HMAC van het IP
-- of het link-id, berekend op de server: er staat nooit een IP in.
-- Alleen de service-role mag de functie aanroepen.

create table if not exists public.public_rate_limits (
  bucket       text not null,
  key_hash     bytea not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, key_hash, window_start)
);
alter table public.public_rate_limits enable row level security;

create or replace function public.public_rate_hit(
  p_bucket text, p_key bytea, p_limit int, p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits  int;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Ongeldige limiet' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.public_rate_limits as r (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key, v_start, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Opruimen zonder cron: af en toe, bij een gewone aanroep.
  if random() < 0.01 then
    delete from public.public_rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end $$;
revoke all on function public.public_rate_hit(text, bytea, int, int) from public, anon, authenticated;
grant execute on function public.public_rate_hit(text, bytea, int, int) to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Cijfers per freelancer — review_avg wordt nergens opgeslagen
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.freelancer_stats
with (security_invoker = true) as
select f.id                                                                   as freelancer_id,
       round(avg(r.score)::numeric, 1)                                        as review_avg,
       count(r.id)                                                            as review_count,
       count(a.id) filter (where a.status in ('gedeeld', 'geaccepteerd', 'opgeleverd')) as active_assignments,
       count(a.id) filter (where a.status = 'afgerond' and r.id is null and not a.is_historical) as open_review_count,
       max(coalesce(a.shared_at, a.created_at)) filter (where a.status not in ('concept', 'geannuleerd')) as last_assignment_at
  from public.freelancers f
  left join public.freelancer_assignments a on a.freelancer_id = f.id
  left join public.freelancer_reviews r     on r.assignment_id = a.id
 group by f.id;

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Avatars: een vaste bucket (geen listBuckets()/createBucket meer)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Publiek leesbaar, zoals nu: de route zet een publieke URL in avatar_url.
-- Schrijven gaat alleen via de server (service-role).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('freelancer-avatars', 'freelancer-avatars', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ════════════════════════════════════════════════════════════════════════════
-- 13. RLS — dezelfde twee niveaus als 0092
-- ════════════════════════════════════════════════════════════════════════════
--   lezen    user_can_view_freelancers()   ('freelancers_bekijken' of 'freelancers')
--   wijzigen user_has_section('freelancers')
-- V5: "bekijken" ziet ook reviews, maar alleen-lezen.

alter table public.freelancer_disciplines       enable row level security;
alter table public.freelancer_reviews           enable row level security;
alter table public.freelancer_assignment_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['freelancer_disciplines', 'freelancer_assignments', 'freelancer_assignment_files',
                           'freelancer_reviews', 'freelancer_assignment_events'] loop
    execute format('drop policy if exists "freelancers can view %1$s" on public.%1$I', t);
    execute format('drop policy if exists "freelancers section can insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "freelancers section can update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "freelancers section can delete %1$s" on public.%1$I', t);
    execute format('create policy "freelancers can view %1$s" on public.%1$I for select to authenticated using (public.user_can_view_freelancers())', t);
    execute format('create policy "freelancers section can insert %1$s" on public.%1$I for insert to authenticated with check (public.user_has_section(''freelancers''))', t);
    execute format('create policy "freelancers section can update %1$s" on public.%1$I for update to authenticated using (public.user_has_section(''freelancers'')) with check (public.user_has_section(''freelancers''))', t);
    execute format('create policy "freelancers section can delete %1$s" on public.%1$I for delete to authenticated using (public.user_has_section(''freelancers''))', t);
  end loop;
end $$;

-- freelancer_projects: wordt niet meer beschreven, alleen nog gelezen tot
-- de opruimmigratie. Een nieuw project is voortaan een opdracht.
drop policy if exists "freelancers section can insert freelancer_projects" on public.freelancer_projects;

-- ════════════════════════════════════════════════════════════════════════════
-- 14. Keuzelijst materiaalplanner: nu zonder gearchiveerde freelancers
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.freelancer_picker()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.name
  from public.freelancers f
  where public.gear_can('materiaal')
    and f.archived_at is null
  order by f.name
$$;

revoke all on function public.freelancer_picker() from public, anon;
grant execute on function public.freelancer_picker() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 15. Controle: geen enkele waarde verloren — anders alles terug
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare n bigint;
begin
  select count(*) into n from public.freelancers
   where rating is distinct from overall_rating;
  if n > 0 then raise exception 'Controle 0093: % freelancer(s) met rating ≠ overall_rating', n; end if;

  select count(*) into n from public.freelancers
   where hourly_rate is distinct from rate_amount
      or (hourly_rate is not null and rate_unit is distinct from 'uur');
  if n > 0 then raise exception 'Controle 0093: % uurtarief(en) niet overgezet', n; end if;

  select count(*) into n from public.freelancers
   where nullif(btrim(price_info), '') is distinct from rate_note;
  if n > 0 then raise exception 'Controle 0093: % prijsinfo niet overgezet', n; end if;

  select count(*) into n from public.freelancers
   where nullif(btrim(portfolio_url), '') is not null
     and portfolio_links->0->>'url' is distinct from btrim(portfolio_url);
  if n > 0 then raise exception 'Controle 0093: % portfolio-link(s) niet overgezet', n; end if;

  select count(*) into n from public.freelancers
   where status is distinct from (case tested when 'ja' then 'vast' when 'weinig' then 'proefopdracht' else 'kandidaat' end)::public.freelancer_status;
  if n > 0 then raise exception 'Controle 0093: % status(sen) verkeerd', n; end if;

  -- Elke oude tekst staat nog ergens: in notes (oud of "Uit oud profiel").
  select count(*) into n from public.freelancers
   where (nullif(btrim(bio), '') is not null and position(btrim(bio) in coalesce(notes, '')) = 0)
      or exists (select 1 from unnest(coalesce(specialties, '{}')) s
                  where nullif(btrim(s), '') is not null and position(btrim(s) in coalesce(notes, '')) = 0)
      or exists (select 1 from unnest(coalesce(types, '{}')) t
                  where nullif(btrim(t), '') is not null
                    and not exists (select 1 from public.freelancer_disciplines d
                                     where d.key = any(disciplines) and lower(btrim(t)) in (lower(d.label), d.key))
                    and position(btrim(t) in coalesce(notes, '')) = 0);
  if n > 0 then raise exception 'Controle 0093: % freelancer(s) met oude tekst die nergens meer staat', n; end if;

  select count(*) into n from public.freelancer_projects p
   where not exists (select 1 from public.freelancer_assignments a
                      where a.legacy_project_id = p.id and a.is_historical and a.status = 'afgerond'
                        and a.freelancer_id = p.freelancer_id and a.title = p.project_name);
  if n > 0 then raise exception 'Controle 0093: % project(en) zonder historische opdracht', n; end if;

  select count(*) into n from public.freelancer_projects p
   where p.score is not null
     and not exists (select 1 from public.freelancer_assignments a
                       join public.freelancer_reviews r on r.assignment_id = a.id
                      where a.legacy_project_id = p.id and r.score = p.score
                        and r.comment is not distinct from nullif(btrim(p.notes), ''));
  if n > 0 then raise exception 'Controle 0093: % projectscore(s) zonder review', n; end if;

  select count(*) into n from public.freelancer_projects p
   where p.score is null and nullif(btrim(p.notes), '') is not null
     and not exists (select 1 from public.freelancer_assignments a
                       join public.freelancer_assignment_events e on e.assignment_id = a.id
                      where a.legacy_project_id = p.id and e.kind = 'notitie'
                        and position(btrim(p.notes) in e.message) > 0);
  if n > 0 then raise exception 'Controle 0093: % projectnotitie(s) zonder plek', n; end if;

  select count(*) into n from public.freelancer_assignments
   where created_by_email is not null and created_by is null
     and exists (select 1 from auth.users u where lower(btrim(u.email)) = lower(btrim(created_by_email)));
  if n > 0 then raise exception 'Controle 0093: % opdracht(en) zonder gekoppelde maker', n; end if;
end $$;
