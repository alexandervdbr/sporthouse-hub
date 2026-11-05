-- Test van 0076. Draait volledig in begin … rollback: er blijft niets achter.
-- Schrijft alleen in pool_cars. Speelt verschillende gebruikers na via
-- "set local role authenticated" en nagemaakte JWT-claims (geen echte
-- accounts nodig).
--
-- Verwacht: één rij "Alle tests van 0076 geslaagd".
-- Bij een fout stopt het script met "TEST MISLUKT: …" en is alles
-- teruggedraaid.

begin;

-- Een testwagen, als postgres (buiten RLS om).
insert into public.pool_cars (id, name, license_plate, make_model, current_km)
values ('00000000-0000-4000-8000-0000000000c1', 'Testwagen', '1-TST-001', 'Test Model', 1000);

set local role authenticated;

-- ── 1. Gebruiker (niveau Gebruiken): ziet, maar beheert niet ────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"permissions":{"sections":["poolwagens"]}}}', true);

do $$
declare n int;
begin
  select count(*) into n from public.pool_cars where name = 'Testwagen';
  if n <> 1 then raise exception 'TEST MISLUKT: gebruiker ziet de testwagen niet'; end if;

  begin
    insert into public.pool_cars (name, license_plate) values ('Mag niet', '1-TST-002');
    raise exception 'TEST MISLUKT: gebruiker kon een wagen toevoegen';
  exception when insufficient_privilege then null;
  end;

  update public.pool_cars set current_km = 5 where name = 'Testwagen';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST MISLUKT: gebruiker kon een wagen wijzigen'; end if;
end $$;

-- ── 2. Account zonder rechten-object: niets (deny-by-default) ───────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated","app_metadata":{}}', true);

do $$
declare n int;
begin
  select count(*) into n from public.pool_cars;
  if n <> 0 then raise exception 'TEST MISLUKT: account zonder rechten ziet wagens'; end if;
end $$;

-- ── 3. Freelancer, zelfs met de sleutel: niets ──────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated","app_metadata":{"freelancer":true,"permissions":{"sections":["poolwagens","poolwagens_beheren"]}}}', true);

do $$
declare n int;
begin
  select count(*) into n from public.pool_cars;
  if n <> 0 then raise exception 'TEST MISLUKT: freelancer ziet wagens'; end if;
end $$;

-- ── 4. Beheerder Poolwagens: toevoegen, wijzigen, archiveren; niet wissen ───
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated","app_metadata":{"permissions":{"sections":["poolwagens","poolwagens_beheren"]}}}', true);

do $$
declare n int;
begin
  insert into public.pool_cars (name, license_plate, make_model, current_km)
  values ('Testwagen 2', '1-TST-003', 'Test Model', 50);

  update public.pool_cars
     set current_km = 1200, manual_block = true, manual_block_note = 'test'
   where name = 'Testwagen';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST MISLUKT: beheerder kon niet wijzigen'; end if;

  update public.pool_cars set archived_at = now() where name = 'Testwagen 2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST MISLUKT: beheerder kon niet archiveren'; end if;

  delete from public.pool_cars where name = 'Testwagen';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST MISLUKT: een wagen kon gewist worden (moet archiveren zijn)'; end if;
end $$;

-- ── 5. Admin (sleutel beheer, zonder poolwagens-sleutels): alles ────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated","app_metadata":{"permissions":{"sections":["beheer"]}}}', true);

do $$
begin
  insert into public.pool_cars (name, license_plate) values ('Testwagen 3', '1-TST-004');
end $$;

-- ── 6. Gegevensregels ───────────────────────────────────────────────────────
do $$
begin
  -- Zelfde nummerplaat in een andere schrijfwijze.
  begin
    insert into public.pool_cars (name, license_plate) values ('Dubbel', '1tst 001');
    raise exception 'TEST MISLUKT: dubbele nummerplaat werd aanvaard';
  exception when unique_violation then null;
  end;

  begin
    insert into public.pool_cars (name, license_plate, current_km) values ('Negatief', '1-TST-005', -1);
    raise exception 'TEST MISLUKT: negatieve kilometerstand werd aanvaard';
  exception when check_violation then null;
  end;

  begin
    insert into public.pool_cars (name, license_plate) values ('   ', '1-TST-006');
    raise exception 'TEST MISLUKT: lege naam werd aanvaard';
  exception when check_violation then null;
  end;
end $$;

reset role;
rollback;

select 'Alle tests van 0076 geslaagd' as resultaat;
