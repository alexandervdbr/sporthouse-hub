-- Proefdraai van 0094 (samenwerkingen beschrijfbaar + cascade bij verwijderen).
--
-- Voert 0094 uit, controleert het resultaat (ook als ingelogde gebruikers met
-- verschillende rechten) en draait ALLES terug. Er blijft niets achter, ook
-- niet als alles slaagt. 0094 is herhaalbaar, dus dit werkt vóór en na 0094.
--
-- De migratie hieronder is een letterlijke kopie van
-- supabase/migrations/0094_freelancer_projects_policies.sql; de test
-- freelancers-0094.test.ts bewaakt dat.
--
-- Verwacht: één rij "Proefdraai 0094 geslaagd — er is niets blijven staan".
-- Bij een fout: een melding (TEST MISLUKT: … of een SQL-fout), en ook dan is
-- alles teruggedraaid.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0094 — supabase/migrations/0094_freelancer_projects_policies.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Freelancers: samenwerkingen weer beschrijfbaar (docs/freelancers-overzicht.md, B1 en B7).
--
-- 0093 haalde de insert-policy op freelancer_projects weg, want toen werd een
-- project een opdracht. Dat plan is verlaten: freelancer_projects is weer de
-- lijst "samenwerkingen", en die moet je kunnen toevoegen, bewerken en
-- verwijderen met het niveau Beheren.
--
--   lezen    user_can_view_freelancers()          (0092, ongewijzigd)
--   toevoegen, wijzigen, verwijderen  user_has_section('freelancers')
--
-- B7: een freelancer hard verwijderen neemt zijn samenwerkingen mee. Daarvoor
-- wordt de verwijzing freelancer_projects.freelancer_id → freelancers(id)
-- "on delete cascade". Zonder dat zou de route eerst de samenwerkingen en dan
-- de freelancer moeten wissen, in twee stappen.
--
-- Alleen toevoegen en een verwijzing vervangen: er verdwijnt geen tabel,
-- kolom of rij. Herhaalbaar.

-- ── Policies ────────────────────────────────────────────────────────────────

drop policy if exists "freelancers section can insert freelancer_projects" on public.freelancer_projects;
drop policy if exists "freelancers section can update freelancer_projects" on public.freelancer_projects;

create policy "freelancers section can insert freelancer_projects" on public.freelancer_projects
  for insert to authenticated
  with check (public.user_has_section('freelancers'));

create policy "freelancers section can update freelancer_projects" on public.freelancer_projects
  for update to authenticated
  using (public.user_has_section('freelancers'))
  with check (public.user_has_section('freelancers'));

-- select ("freelancers can view freelancer_projects") en delete ("freelancers
-- section can delete freelancer_projects") blijven zoals 0092 ze zette.

-- ── Verwijzing naar de freelancer: on delete cascade ────────────────────────

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.freelancer_projects'::regclass
       and contype = 'f'
       and confrelid = 'public.freelancers'::regclass
  loop
    execute format('alter table public.freelancer_projects drop constraint %I', c);
  end loop;
end $$;

alter table public.freelancer_projects
  add constraint freelancer_projects_freelancer_id_fkey
  foreign key (freelancer_id) references public.freelancers(id) on delete cascade;

-- ════════════════════════════════════════════════════════════════════════════
-- Controles
-- ════════════════════════════════════════════════════════════════════════════

-- ── Structuur (als postgres) ────────────────────────────────────────────────
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'freelancer_projects'
       and policyname in ('freelancers can view freelancer_projects', 'freelancers section can insert freelancer_projects',
                          'freelancers section can update freelancer_projects', 'freelancers section can delete freelancer_projects')) <> 4 then
    raise exception 'TEST MISLUKT: niet alle vier de policies op freelancer_projects staan er';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancer_projects'
              and (qual = 'true' or with_check = 'true')) then
    raise exception 'TEST MISLUKT: er staat een open policy (true) op freelancer_projects';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.freelancer_projects'::regclass
       and contype = 'f' and confrelid = 'public.freelancers'::regclass) <> 1 then
    raise exception 'TEST MISLUKT: freelancer_projects heeft niet precies één verwijzing naar freelancers';
  end if;
  if (select confdeltype from pg_constraint where conrelid = 'public.freelancer_projects'::regclass
       and contype = 'f' and confrelid = 'public.freelancers'::regclass) <> 'c' then
    raise exception 'TEST MISLUKT: de verwijzing naar freelancers is niet on delete cascade';
  end if;
  if (select confdeltype from pg_constraint where conrelid = 'public.gear_bookings'::regclass
       and contype = 'f' and confrelid = 'public.freelancers'::regclass) <> 'n' then
    raise exception 'TEST MISLUKT: gear_bookings.freelancer_id is niet meer on delete set null';
  end if;
end $$;

-- Testdata, als postgres.
insert into public.freelancers (name) values ('TEST 0094'), ('TEST 0094 weg');
insert into public.freelancer_projects (freelancer_id, project_name, score)
  select id, 'TEST 0094 samenwerking', 4 from public.freelancers where name in ('TEST 0094', 'TEST 0094 weg');

set local role authenticated;

-- ── Geen freelancerrecht ────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["team","planning"]}}}', true);
do $$
begin
  if (select count(*) from public.freelancer_projects) <> 0 then
    raise exception 'TEST MISLUKT: zonder freelancerrecht zijn er samenwerkingen zichtbaar';
  end if;
end $$;

-- ── Bekijken: lezen, niets schrijven ────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["freelancers_bekijken"]}}}', true);
do $$
declare n int;
begin
  if not exists (select 1 from public.freelancer_projects where project_name = 'TEST 0094 samenwerking') then
    raise exception 'TEST MISLUKT: bekijken ziet de samenwerkingen niet';
  end if;
  begin
    insert into public.freelancer_projects (freelancer_id, project_name)
      select id, 'mag niet' from public.freelancers where name = 'TEST 0094';
    raise exception 'TEST MISLUKT: bekijken mag een samenwerking toevoegen';
  exception when insufficient_privilege then null;
  end;
  update public.freelancer_projects set notes = 'mag niet' where project_name = 'TEST 0094 samenwerking';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST MISLUKT: bekijken mag een samenwerking wijzigen'; end if;
end $$;

-- ── Beheren (oude sleutel): toevoegen, wijzigen, verwijderen met cascade ────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["freelancers"]}}}', true);
do $$
declare n int;
begin
  insert into public.freelancer_projects (freelancer_id, project_name)
    select id, 'TEST 0094 nieuw' from public.freelancers where name = 'TEST 0094';
  update public.freelancer_projects set score = 5, notes = 'gewijzigd'
   where project_name = 'TEST 0094 samenwerking'
     and freelancer_id = (select id from public.freelancers where name = 'TEST 0094');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST MISLUKT: beheren mag een samenwerking niet wijzigen'; end if;

  delete from public.freelancers where name = 'TEST 0094 weg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST MISLUKT: beheren kan een freelancer met samenwerkingen niet verwijderen'; end if;
  if exists (select 1 from public.freelancer_projects p
              where not exists (select 1 from public.freelancers f where f.id = p.freelancer_id)) then
    raise exception 'TEST MISLUKT: samenwerkingen van een verwijderde freelancer zijn blijven staan';
  end if;
end $$;

-- ── Alleen materiaal: de keuzelijst werkt nog ──────────────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["materiaal"]}}}', true);
do $$
begin
  if not exists (select 1 from public.freelancer_picker() where name = 'TEST 0094') then
    raise exception 'TEST MISLUKT: freelancer_picker() toont de freelancer niet aan de materiaalplanner';
  end if;
  if (select count(*) from public.freelancer_projects) <> 0 then
    raise exception 'TEST MISLUKT: met alleen materiaalrecht zijn samenwerkingen zichtbaar';
  end if;
end $$;

reset role;

rollback;

-- Na de rollback, zodat de SQL-editor (die alleen het laatste resultaat
-- toont) dit laat zien. Bij een fout hierboven stopt het script hier nooit.
select 'Proefdraai 0094 geslaagd — er is niets blijven staan' as resultaat;
