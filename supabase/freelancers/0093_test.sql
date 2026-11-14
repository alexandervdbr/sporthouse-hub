-- Test van 0093 (freelancer-datamodel). Draai dit NA de migratie.
--
-- Draait volledig in begin … rollback: er blijft niets achter. Maakt één
-- testfreelancer met een testopdracht en een testlink aan, en controleert:
--   - de structuur (types, tabellen, view, functies, bucket, RLS)
--   - dat de overgezette data klopt (dezelfde regels als de controle in 0093)
--   - de triggers: onbekende discipline geweigerd, archiveren trekt de link in,
--     e-mail uniek zonder hoofdlettergevoeligheid
--   - freelancer_stats en freelancer_picker
--
-- Verwacht: één rij "Alle tests van 0093 geslaagd — er is niets blijven staan".
-- Bij een fout stopt het script met "TEST MISLUKT: …" en is alles teruggedraaid.

begin;

do $$
declare
  v_f uuid; v_a uuid; v_a2 uuid; n bigint; v_avg numeric;
begin
  -- ── Structuur ─────────────────────────────────────────────────────────────
  if (select count(*) from public.freelancer_disciplines) < 13 then
    raise exception 'TEST MISLUKT: minder dan 13 disciplines';
  end if;
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'freelancer_assignments' and column_name = 'status') <> 'USER-DEFINED' then
    raise exception 'TEST MISLUKT: opdrachtstatus is geen enum';
  end if;
  if (select udt_name from information_schema.columns
       where table_schema = 'public' and table_name = 'freelancers' and column_name = 'email') <> 'citext' then
    raise exception 'TEST MISLUKT: freelancers.email is geen citext';
  end if;
  if not exists (select 1 from storage.buckets where id = 'freelancer-avatars') then
    raise exception 'TEST MISLUKT: bucket freelancer-avatars ontbreekt';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('freelancer_links', 'public_rate_limits')) then
    raise exception 'TEST MISLUKT: freelancer_links of public_rate_limits heeft een policy (mag niet)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.freelancer_links'::regclass) then
    raise exception 'TEST MISLUKT: RLS staat niet aan op freelancer_links';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'freelancer%'
              and (qual = 'true' or with_check = 'true')) then
    raise exception 'TEST MISLUKT: er staat nog een open policy (true) op een freelancertabel';
  end if;
  -- Oude kolommen en freelancer_projects staan er nog (niets verwijderd).
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'freelancers'
       and column_name in ('rating', 'tested', 'types', 'specialties', 'hourly_rate', 'price_info', 'portfolio_url', 'bio')) <> 8 then
    raise exception 'TEST MISLUKT: een oude kolom van freelancers is verdwenen';
  end if;
  if to_regclass('public.freelancer_projects') is null then
    raise exception 'TEST MISLUKT: freelancer_projects is verdwenen';
  end if;

  -- ── Overgezette data ──────────────────────────────────────────────────────
  select count(*) into n from public.freelancers where rating is distinct from overall_rating;
  if n > 0 then raise exception 'TEST MISLUKT: % rating(s) niet overgezet', n; end if;
  select count(*) into n from public.freelancer_projects p
   where not exists (select 1 from public.freelancer_assignments a where a.legacy_project_id = p.id and a.is_historical);
  if n > 0 then raise exception 'TEST MISLUKT: % project(en) niet overgezet', n; end if;
  select count(*) into n from public.freelancer_projects p
   where p.score is not null and not exists (
     select 1 from public.freelancer_assignments a join public.freelancer_reviews r on r.assignment_id = a.id
      where a.legacy_project_id = p.id and r.score = p.score);
  if n > 0 then raise exception 'TEST MISLUKT: % score(s) niet overgezet', n; end if;
  if exists (select 1 from public.freelancer_assignments where status::text in ('nieuw', 'in_behandeling')) then
    raise exception 'TEST MISLUKT: oude status nog aanwezig';
  end if;
  if exists (select 1 from public.freelancers where email is not null and email::text <> lower(btrim(email::text))) then
    raise exception 'TEST MISLUKT: e-mail niet genormaliseerd';
  end if;

  -- ── Triggers en regels ────────────────────────────────────────────────────
  insert into public.freelancers (name, email, disciplines, status)
  values ('TEST 0093', 'test-0093@example.invalid', array['video'], 'vast')
  returning id into v_f;

  begin
    insert into public.freelancers (name, email) values ('TEST 0093 dubbel', 'TEST-0093@example.invalid');
    raise exception 'TEST MISLUKT: dubbel e-mailadres (andere hoofdletters) toegelaten';
  exception when unique_violation then null;
           when check_violation then null;   -- hoofdletters geweigerd door freelancers_email_normalized
  end;

  begin
    update public.freelancers set disciplines = array['bestaat-niet'] where id = v_f;
    raise exception 'TEST MISLUKT: onbekende discipline toegelaten';
  exception when foreign_key_violation then null;
  end;

  begin
    update public.freelancers set overall_rating = 6 where id = v_f;
    raise exception 'TEST MISLUKT: overall_rating 6 toegelaten';
  exception when check_violation then null;
  end;

  insert into public.freelancer_assignments (freelancer_id, title, status) values (v_f, 'TEST opdracht', 'afgerond')
  returning id into v_a;
  insert into public.freelancer_assignments (freelancer_id, title, status) values (v_f, 'TEST opdracht 2', 'gedeeld')
  returning id into v_a2;
  if (select status from public.freelancer_assignments where id = v_a2) <> 'gedeeld' then
    raise exception 'TEST MISLUKT: status niet bewaard';
  end if;
  insert into public.freelancer_reviews (assignment_id, score) values (v_a, 4);

  begin
    insert into public.freelancer_reviews (assignment_id, score) values (v_a, 5);
    raise exception 'TEST MISLUKT: tweede review op dezelfde opdracht toegelaten';
  exception when unique_violation then null;
  end;

  select review_avg, active_assignments into v_avg, n from public.freelancer_stats where freelancer_id = v_f;
  if v_avg is distinct from 4.0 or n <> 1 then
    raise exception 'TEST MISLUKT: freelancer_stats geeft % / % (verwacht 4.0 / 1)', v_avg, n;
  end if;
  if (select overall_rating from public.freelancers where id = v_f) is not null then
    raise exception 'TEST MISLUKT: overall_rating werd automatisch ingevuld';
  end if;

  -- Een event van de freelancer draagt nooit een medewerker-id.
  if exists (select 1 from auth.users) then
    begin
      insert into public.freelancer_assignment_events (assignment_id, actor_type, actor_id)
      values (v_a, 'freelancer', (select id from auth.users limit 1));
      raise exception 'TEST MISLUKT: een freelancer-event met een medewerker-id toegelaten';
    exception when check_violation then null;
    end;
  end if;
  -- Een standaard nieuwe opdracht is een concept.
  insert into public.freelancer_assignments (freelancer_id, title) values (v_f, 'TEST concept') returning id into v_a2;
  if (select status from public.freelancer_assignments where id = v_a2) <> 'concept' then
    raise exception 'TEST MISLUKT: standaardstatus is geen concept';
  end if;

  -- Link + archiveren
  insert into public.freelancer_links (freelancer_id, token_hash, token_encrypted, pin_hash)
  values (v_f, decode(repeat('ab', 32), 'hex'), '\x00', 'scrypt$test');
  begin
    insert into public.freelancer_links (freelancer_id, token_hash, token_encrypted, pin_hash)
    values (v_f, decode(repeat('cd', 32), 'hex'), '\x00', 'scrypt$test');
    raise exception 'TEST MISLUKT: twee actieve links voor één freelancer';
  exception when unique_violation then null;
  end;

  if not exists (select 1 from public.freelancer_picker() where id = v_f) and public.gear_can('materiaal') then
    raise exception 'TEST MISLUKT: actieve freelancer staat niet in freelancer_picker';
  end if;

  update public.freelancers set archived_at = now() where id = v_f;
  if exists (select 1 from public.freelancer_links where freelancer_id = v_f and revoked_at is null) then
    raise exception 'TEST MISLUKT: archiveren trok de link niet in';
  end if;
  if exists (select 1 from public.freelancer_picker() where id = v_f) then
    raise exception 'TEST MISLUKT: gearchiveerde freelancer staat in freelancer_picker';
  end if;

  -- Pincode: 5 fouten → 15 min dicht; 3 blokkeringen in 24 u → nieuwe pincode nodig.
  update public.freelancers set archived_at = null where id = v_f;
  insert into public.freelancer_links (freelancer_id, token_hash, token_encrypted, pin_hash)
  values (v_f, decode(repeat('ee', 32), 'hex'), '\x00', 'scrypt$test');
  declare
    v_l uuid := (select id from public.freelancer_links where freelancer_id = v_f and revoked_at is null);
    r record;
  begin
    for i in 1..4 loop
      select * into r from public.freelancer_link_pin_failed(v_l, 5, 15, 3, 24);
    end loop;
    if r.failed <> 4 or r.locked_until is not null then
      raise exception 'TEST MISLUKT: na 4 fouten al geblokkeerd of verkeerd geteld';
    end if;
    select * into r from public.freelancer_link_pin_failed(v_l, 5, 15, 3, 24);
    if r.locked_until is null or r.locked_until < now() + interval '14 minutes' or r.failed <> 0 or r.lockout_count <> 1 or r.needs_new_pin then
      raise exception 'TEST MISLUKT: na 5 fouten niet 15 minuten geblokkeerd';
    end if;
    for j in 1..10 loop
      select * into r from public.freelancer_link_pin_failed(v_l, 5, 15, 3, 24);
    end loop;
    if r.lockout_count <> 3 or not r.needs_new_pin then
      raise exception 'TEST MISLUKT: na 3 blokkeringen geen nieuwe pincode vereist (count %)', r.lockout_count;
    end if;
    perform public.freelancer_link_pin_ok(v_l);
    if (select failed_pin_attempts from public.freelancer_links where id = v_l) <> 0
       or (select last_opened_at from public.freelancer_links where id = v_l) is null then
      raise exception 'TEST MISLUKT: freelancer_link_pin_ok zet de teller niet terug';
    end if;
  end;
  -- Terug gearchiveerd: de controles verderop rekenen daarop.
  update public.freelancers set archived_at = now() where id = v_f;

  -- Rate limit: 2 toegelaten, de derde niet.
  if not public.public_rate_hit('test-0093', decode(repeat('ef', 32), 'hex'), 2, 60)
     or not public.public_rate_hit('test-0093', decode(repeat('ef', 32), 'hex'), 2, 60)
     or public.public_rate_hit('test-0093', decode(repeat('ef', 32), 'hex'), 2, 60) then
    raise exception 'TEST MISLUKT: public_rate_hit telt niet juist';
  end if;
end $$;

-- ── Rechten op de nieuwe tabellen, als ingelogde gebruiker ──────────────────
-- De testfreelancer, -opdracht, -review en -link van hierboven bestaan nog
-- (binnen deze transactie).

-- Een tweede, niet-gearchiveerde testfreelancer (als postgres), naast de
-- gearchiveerde 'TEST 0093' van hierboven.
insert into public.freelancers (name) values ('TEST 0093 actief');

set local role authenticated;

-- Alleen materiaalrecht: de keuzelijst toont wél de actieve en níet de
-- gearchiveerde freelancer, en de tabel zelf blijft dicht.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["materiaal"]}}}', true);
do $$
begin
  if not exists (select 1 from public.freelancer_picker() where name = 'TEST 0093 actief') then
    raise exception 'TEST MISLUKT: een actieve freelancer staat niet in freelancer_picker()';
  end if;
  if exists (select 1 from public.freelancer_picker() where name = 'TEST 0093') then
    raise exception 'TEST MISLUKT: een gearchiveerde freelancer staat in freelancer_picker()';
  end if;
  if exists (select 1 from public.freelancers) then
    raise exception 'TEST MISLUKT: met alleen materiaalrecht is de tabel freelancers zichtbaar';
  end if;
end $$;

-- Geen freelancerrecht: niets zichtbaar, ook de cijfers niet.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["team"]}}}', true);
do $$
begin
  if exists (select 1 from public.freelancers) or exists (select 1 from public.freelancer_assignments)
     or exists (select 1 from public.freelancer_reviews) or exists (select 1 from public.freelancer_assignment_events)
     or exists (select 1 from public.freelancer_stats) or exists (select 1 from public.freelancer_disciplines) then
    raise exception 'TEST MISLUKT: zonder freelancerrecht is er iets zichtbaar';
  end if;
end $$;

-- Bekijken: alles lezen (ook reviews, alleen-lezen), niets schrijven, nooit links.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["freelancers_bekijken"]}}}', true);
do $$
declare n int;
begin
  if not exists (select 1 from public.freelancer_reviews r join public.freelancer_assignments a on a.id = r.assignment_id
                   join public.freelancers f on f.id = a.freelancer_id where f.name = 'TEST 0093') then
    raise exception 'TEST MISLUKT: bekijken ziet de review niet';
  end if;
  if not exists (select 1 from public.freelancer_stats s join public.freelancers f on f.id = s.freelancer_id where f.name = 'TEST 0093') then
    raise exception 'TEST MISLUKT: bekijken ziet freelancer_stats niet';
  end if;
  if exists (select 1 from public.freelancer_links) then
    raise exception 'TEST MISLUKT: freelancer_links is leesbaar voor een ingelogde gebruiker';
  end if;
  begin
    insert into public.freelancer_assignments (freelancer_id, title)
      select id, 'TEST mag niet' from public.freelancers where name = 'TEST 0093';
    raise exception 'TEST MISLUKT: bekijken mag een opdracht toevoegen';
  exception when insufficient_privilege then null;
  end;
  update public.freelancer_reviews set score = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST MISLUKT: bekijken mag een review wijzigen'; end if;
end $$;

-- Beheren (oude sleutel): schrijven mag, links blijven onbereikbaar.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"permissions":{"sections":["freelancers"]}}}', true);
do $$
declare n int;
begin
  insert into public.freelancer_assignment_events (assignment_id, actor_type, kind, message)
    select a.id, 'systeem', 'notitie', 'TEST' from public.freelancer_assignments a
      join public.freelancers f on f.id = a.freelancer_id where f.name = 'TEST 0093' limit 1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST MISLUKT: beheren (oude sleutel) mag geen event toevoegen'; end if;
  if exists (select 1 from public.freelancer_links) then
    raise exception 'TEST MISLUKT: freelancer_links is leesbaar voor beheren';
  end if;
  begin
    insert into public.freelancer_links (freelancer_id, token_hash, token_encrypted, pin_hash)
      select id, decode(repeat('99', 32), 'hex'), '\x00', 'x' from public.freelancers where name = 'TEST 0093';
    raise exception 'TEST MISLUKT: een ingelogde gebruiker mag een link aanmaken';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.public_rate_hit('x', '\x00', 1, 60);
    raise exception 'TEST MISLUKT: een ingelogde gebruiker mag public_rate_hit uitvoeren';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

rollback;

-- Na de rollback, zodat de SQL-editor (die alleen het laatste resultaat
-- toont) dit laat zien. Bij een fout hierboven stopt het script en komt het
-- hier nooit.
select 'Alle tests van 0093 geslaagd — er is niets blijven staan' as resultaat;
