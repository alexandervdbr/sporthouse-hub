-- Test van 0092 (freelancers: RLS volgt de niveaus bekijken/beheren). Draai
-- dit NA 0092 — of draai 0092_proefdraai.sql, dat 0092 zelf meeneemt.
--
-- Draait volledig in begin … rollback: er blijft niets achter. Maakt één
-- testfreelancer met één testproject aan, en kijkt dan als verschillende
-- gebruikers (rol authenticated, met nagemaakte claims) wat ze zien en mogen:
--   geen freelancerrecht      → ziet niets, mag niets toevoegen
--   geen permissions-object   → ziet niets (geen open toegang)
--   bekijken                  → ziet alles, mag niets toevoegen
--   beheren (oude sleutel)    → ziet alles en mag toevoegen
--   alleen materiaal          → ziet de tabel niet, wel id + naam via freelancer_picker()
--
-- Verwacht: één rij "Alle tests van 0092 geslaagd — er is niets blijven staan".
-- Bij een fout stopt het script met "TEST MISLUKT: …" en is alles teruggedraaid.

begin;

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
select 'Alle tests van 0092 geslaagd — er is niets blijven staan' as resultaat;
