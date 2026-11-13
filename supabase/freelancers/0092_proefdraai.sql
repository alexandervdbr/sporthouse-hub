-- Proefdraai van 0092 (freelancers: RLS volgt bekijken/beheren).
--
-- GEGENEREERD door scripts/freelancers-proefdraai.mjs — niet met de hand
-- wijzigen; pas de bronbestanden aan en draai het script opnieuw.
--
-- Voert 0092 uit, controleert het resultaat (ook als ingelogde gebruikers
-- met verschillende rechten) en draait ALLES terug. Er blijft niets achter,
-- ook niet als alles slaagt. Werkt zowel vóór als na 0092: 0092 is
-- herhaalbaar (create or replace / drop policy if exists).
--
-- Verwacht: één rij "Proefdraai 0092 geslaagd — er is niets blijven staan".
-- Bij een fout: een melding (TEST MISLUKT: … of een SQL-fout), en ook dan
-- is alles teruggedraaid.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0092 — supabase/migrations/0092_freelancers_rls_niveaus.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Freelancers: de database volgt de twee niveaus van de app.
--
-- Fase 1 van het herontwerp (docs/freelancers-redesign.md). Tot hier:
--   freelancers          select/insert voor elk ingelogd account (0028);
--                        update/delete al op 'freelancers' (0039)
--   freelancer_projects  select/insert/delete voor elk ingelogd account (0028)
-- Een collega zonder freelancerrecht kon dus via PostgREST rechtstreeks de
-- contactgegevens, tarieven en notities van elke freelancer lezen, en
-- freelancers en projecten aanmaken of projecten wissen.
--
-- Vanaf hier:
--   lezen   — 'freelancers_bekijken' of 'freelancers'
--   wijzigen — 'freelancers' (= het niveau Beheren)
--
-- Achterwaarts compatibel: 'freelancers' was vóór deze wijziging het enige
-- niveau (Beheren) en blijft dat. Wie het heeft, mag dus ook lezen, ook als
-- zijn sleutellijst 'freelancers_bekijken' nog niet bevat — dezelfde regel
-- als IMPLIED_SECTIONS in src/lib/auth-permissions.ts. Er gaat bij niemand
-- een recht verloren; auth.users wordt niet aangeraakt.
--
-- user_has_section (0025) is deny-by-default: een account zonder
-- permissions-object krijgt niets. Admins ('beheer') mogen alles.
--
-- freelancer_assignments en freelancer_assignment_files: ongewijzigd. RLS
-- staat aan zonder policies, dus enkel de service-role (de API-routes, die
-- zelf controleren) komt erbij.
--
-- De materiaalplanner koos freelancers uit met de client van de gebruiker en
-- zou na deze migratie een lege lijst krijgen voor wie geen freelancerrecht
-- heeft. Daarom freelancer_picker(): alleen id en naam, voor wie de
-- materiaalplanner mag zien. Een boeking verwijst al naar freelancers(id)
-- (gear_bookings.freelancer_id, 0072) — er verandert niets aan hoe ze
-- opgeslagen wordt.

-- ── Helper ──────────────────────────────────────────────────────────────────

create or replace function public.user_can_view_freelancers()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.user_has_section('freelancers_bekijken')
      or public.user_has_section('freelancers')
$$;

-- ── freelancers ─────────────────────────────────────────────────────────────

drop policy if exists "Auth read freelancers"   on public.freelancers;
drop policy if exists "Auth insert freelancers" on public.freelancers;
drop policy if exists "freelancers can view freelancers"   on public.freelancers;
drop policy if exists "freelancers section can insert freelancers" on public.freelancers;

create policy "freelancers can view freelancers" on public.freelancers
  for select to authenticated
  using (public.user_can_view_freelancers());

create policy "freelancers section can insert freelancers" on public.freelancers
  for insert to authenticated
  with check (public.user_has_section('freelancers'));

-- update/delete: de policies uit 0039 blijven ("freelancers section can
-- update/delete freelancers", op user_has_section('freelancers')).

-- ── freelancer_projects ─────────────────────────────────────────────────────

drop policy if exists "Auth read freelancer_projects"   on public.freelancer_projects;
drop policy if exists "Auth insert freelancer_projects" on public.freelancer_projects;
drop policy if exists "Auth delete freelancer_projects" on public.freelancer_projects;
drop policy if exists "freelancers can view freelancer_projects"   on public.freelancer_projects;
drop policy if exists "freelancers section can insert freelancer_projects" on public.freelancer_projects;
drop policy if exists "freelancers section can delete freelancer_projects" on public.freelancer_projects;

create policy "freelancers can view freelancer_projects" on public.freelancer_projects
  for select to authenticated
  using (public.user_can_view_freelancers());

create policy "freelancers section can insert freelancer_projects" on public.freelancer_projects
  for insert to authenticated
  with check (public.user_has_section('freelancers'));

create policy "freelancers section can delete freelancer_projects" on public.freelancer_projects
  for delete to authenticated
  using (public.user_has_section('freelancers'));

-- ── Keuzelijst voor de materiaalplanner ─────────────────────────────────────
--
-- security definer, want de lezer heeft meestal geen freelancerrecht. Geeft
-- bewust alleen id en naam: geen e-mail, telefoon, tarief of notities.
-- gear_can('materiaal') is dezelfde poort als requireGear('view') in
-- /api/materiaal/options (0071): wie de materiaalplanner niet mag zien,
-- krijgt een lege lijst.
--
-- "Niet-gearchiveerd" bestaat nog niet (freelancers.archived_at komt in
-- 0093); die migratie vervangt deze functie met de filter erbij.

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
  order by f.name
$$;

revoke all on function public.freelancer_picker() from public, anon;
grant execute on function public.freelancer_picker() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Controles — uit supabase/freelancers/0092_test.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── Structuur (als postgres) ────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.user_can_view_freelancers()') is null then
    raise exception 'TEST MISLUKT: functie user_can_view_freelancers() ontbreekt';
  end if;
  if to_regprocedure('public.freelancer_picker()') is null then
    raise exception 'TEST MISLUKT: functie freelancer_picker() ontbreekt';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.freelancer_picker()'::regprocedure) then
    raise exception 'TEST MISLUKT: freelancer_picker() is geen security definer';
  end if;
  if has_function_privilege('anon', 'public.freelancer_picker()', 'execute') then
    raise exception 'TEST MISLUKT: anon mag freelancer_picker() uitvoeren';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('freelancers', 'freelancer_projects')
              and (qual = 'true' or with_check = 'true')) then
    raise exception 'TEST MISLUKT: er staat nog een open policy (true) op freelancers of freelancer_projects';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'freelancers'
       and policyname in ('freelancers can view freelancers', 'freelancers section can insert freelancers',
                          'freelancers section can update freelancers', 'freelancers section can delete freelancers')) <> 4 then
    raise exception 'TEST MISLUKT: niet alle vier de policies op freelancers staan er';
  end if;
end $$;

-- Testdata, als postgres. Het aantal zichtbare rijen wordt hieronder
-- vergeleken met dit totaal.
insert into public.freelancers (name) values ('TEST 0092');
insert into public.freelancer_projects (freelancer_id, project_name)
  select id, 'TEST 0092 project' from public.freelancers where name = 'TEST 0092';
select set_config('fltest.freelancers', (select count(*) from public.freelancers)::text, true),
       set_config('fltest.projects',    (select count(*) from public.freelancer_projects)::text, true);

set local role authenticated;

-- ── Geen freelancerrecht ────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["team","planning"]}}}', true);
do $$
begin
  if (select count(*) from public.freelancers) <> 0 or (select count(*) from public.freelancer_projects) <> 0 then
    raise exception 'TEST MISLUKT: zonder freelancerrecht zijn er freelancers of projecten zichtbaar';
  end if;
  if (select count(*) from public.freelancer_picker()) <> 0 then
    raise exception 'TEST MISLUKT: zonder materiaalrecht geeft freelancer_picker() rijen';
  end if;
  begin
    insert into public.freelancers (name) values ('TEST 0092 mag niet');
    raise exception 'TEST MISLUKT: zonder freelancerrecht mag je een freelancer toevoegen';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Geen permissions-object (geen open toegang meer) ────────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{}}', true);
do $$
begin
  if (select count(*) from public.freelancers) <> 0 then
    raise exception 'TEST MISLUKT: zonder permissions-object zijn er freelancers zichtbaar';
  end if;
end $$;

-- ── Bekijken ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["freelancers_bekijken"]}}}', true);
do $$
declare n int;
begin
  if (select count(*) from public.freelancers) <> current_setting('fltest.freelancers')::int then
    raise exception 'TEST MISLUKT: bekijken ziet niet alle freelancers';
  end if;
  if (select count(*) from public.freelancer_projects) <> current_setting('fltest.projects')::int then
    raise exception 'TEST MISLUKT: bekijken ziet niet alle projecten';
  end if;
  begin
    insert into public.freelancers (name) values ('TEST 0092 mag niet');
    raise exception 'TEST MISLUKT: bekijken mag een freelancer toevoegen';
  exception when insufficient_privilege then null;
  end;
  update public.freelancers set notes = 'gewijzigd door bekijken' where name = 'TEST 0092';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST MISLUKT: bekijken mag een freelancer wijzigen'; end if;
  delete from public.freelancer_projects where project_name = 'TEST 0092 project';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST MISLUKT: bekijken mag een project verwijderen'; end if;
end $$;

-- ── Beheren met de oude sleutel (zo staat het vandaag bij iedereen) ─────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["freelancers"]}}}', true);
do $$
declare n int;
begin
  if (select count(*) from public.freelancers) <> current_setting('fltest.freelancers')::int then
    raise exception 'TEST MISLUKT: beheren (oude sleutel) ziet niet alle freelancers — rechten verloren';
  end if;
  insert into public.freelancers (name) values ('TEST 0092 beheren');
  update public.freelancers set notes = 'gewijzigd door beheren' where name = 'TEST 0092';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST MISLUKT: beheren (oude sleutel) mag niet meer wijzigen — rechten verloren'; end if;
end $$;

-- ── Alleen materiaal: de keuzelijst wel, de tabel niet ─────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["materiaal"]}}}', true);
do $$
begin
  if (select count(*) from public.freelancers) <> 0 then
    raise exception 'TEST MISLUKT: met alleen materiaalrecht is de tabel freelancers zichtbaar';
  end if;
  if not exists (select 1 from public.freelancer_picker() where name = 'TEST 0092') then
    raise exception 'TEST MISLUKT: freelancer_picker() toont de freelancer niet aan de materiaalplanner';
  end if;
end $$;

reset role;

rollback;

-- Na de rollback, zodat de SQL-editor (die alleen het laatste resultaat
-- toont) dit laat zien. Bij een fout hierboven stopt het script en komt het
-- hier nooit.
select 'Proefdraai 0092 geslaagd — er is niets blijven staan' as resultaat;
