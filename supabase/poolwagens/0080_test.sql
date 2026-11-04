-- Test van 0080 (reserveren voor een collega, unieke wagennaam).
-- Draait volledig in begin … rollback: er blijft niets achter. Schrijft
-- alleen in pool_-tabellen. Bestaande accounts worden alleen gelezen, als
-- verwijzing. Is er geen freelancer-account, dan wordt die ene controle
-- overgeslagen (NOTICE).
--
-- Verwacht: één rij "Alle tests van 0080 geslaagd".
-- Bij een fout stopt het script met "TEST MISLUKT: …" (of "TEST KAN NIET
-- DRAAIEN: …") en is alles teruggedraaid.

begin;

-- ── Verwijzingen (alleen lezen) ─────────────────────────────────────────────
-- A en B: twee collega's die geen freelancer zijn en niet verlopen.
select set_config('pooltest.a', coalesce((
  select id::text from auth.users
   where not coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
     and (raw_app_meta_data ->> 'expires_at' is null
          or left(raw_app_meta_data ->> 'expires_at', 10) >= to_char(now() at time zone 'Europe/Brussels', 'YYYY-MM-DD'))
   order by created_at limit 1), ''), true);
select set_config('pooltest.b', coalesce((
  select id::text from auth.users
   where not coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
     and (raw_app_meta_data ->> 'expires_at' is null
          or left(raw_app_meta_data ->> 'expires_at', 10) >= to_char(now() at time zone 'Europe/Brussels', 'YYYY-MM-DD'))
   order by created_at offset 1 limit 1), ''), true);
select set_config('pooltest.fl', coalesce((
  select id::text from auth.users
   where coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
   order by created_at limit 1), ''), true);

do $$
begin
  if current_setting('pooltest.a') = '' or current_setting('pooltest.b') = '' then
    raise exception 'TEST KAN NIET DRAAIEN: er zijn minstens twee actieve collega-accounts nodig.';
  end if;
end $$;

select set_config('pooltest.claims_a', jsonb_build_object('sub', current_setting('pooltest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);
select set_config('pooltest.claims_b', jsonb_build_object('sub', current_setting('pooltest.b'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);

-- ── 1. Unieke naam per actieve wagen (als postgres) ─────────────────────────
insert into public.pool_cars (id, name, license_plate, current_km) values
  ('00000000-0000-4000-8000-0000000080c1', 'zz Test 0080 Bus', '0-TST-801', 1000),
  ('00000000-0000-4000-8000-0000000080c2', 'zz Test 0080 Wagen', '0-TST-802', 500);

do $$
begin
  -- Andere hoofdletters en spaties: telt als dezelfde naam.
  begin
    insert into public.pool_cars (name, license_plate) values ('  ZZ TEST 0080 bus ', '0-TST-803');
    raise exception 'TEST MISLUKT: een tweede actieve wagen met dezelfde naam werd aanvaard';
  exception when unique_violation then
    if sqlerrm not like '%pool_cars_name_active_key%' then
      raise exception 'TEST MISLUKT: verkeerde unieke index: %', sqlerrm;
    end if;
  end;

  -- Hernoemen naar een bestaande naam: ook niet.
  begin
    update public.pool_cars set name = 'zz test 0080 bus' where id = '00000000-0000-4000-8000-0000000080c2';
    raise exception 'TEST MISLUKT: hernoemen naar een bestaande naam werd aanvaard';
  exception when unique_violation then null;
  end;

  -- Een gearchiveerde wagen telt niet mee.
  insert into public.pool_cars (id, name, license_plate, archived_at)
  values ('00000000-0000-4000-8000-0000000080c3', 'zz Test 0080 Bus', '0-TST-804', now());

  -- Maar terugzetten uit het archief botst wel.
  begin
    update public.pool_cars set archived_at = null where id = '00000000-0000-4000-8000-0000000080c3';
    raise exception 'TEST MISLUKT: een gearchiveerde wagen met een bezette naam kon terug actief worden';
  exception when unique_violation then null;
  end;
end $$;

select set_config('pooltest.t', (date_trunc('day', now()) + interval '1 day 9 hours')::text, true);
-- De namen zoals de database ze op een reservatie zet (pool_user_name is
-- niet aanroepbaar voor gebruikers, dus hier al opgehaald).
select set_config('pooltest.name_a', public.pool_user_name(current_setting('pooltest.a')::uuid), true);
select set_config('pooltest.name_b', public.pool_user_name(current_setting('pooltest.b')::uuid), true);

set local role authenticated;

-- ── 2. A reserveert voor B ──────────────────────────────────────────────────
do $$
declare
  v_t  timestamptz := current_setting('pooltest.t')::timestamptz;
  v_a  uuid := current_setting('pooltest.a')::uuid;
  v_b  uuid := current_setting('pooltest.b')::uuid;
  v_id uuid;
  r    public.pool_car_reservations;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  v_id := public.pool_create_reservation('00000000-0000-4000-8000-0000000080c1', v_t, v_t + interval '2 hours',
    null, 'zz Test klant', 'voor B', v_b);
  perform set_config('pooltest.r1', v_id::text, true);

  select * into r from public.pool_car_reservations where id = v_id;
  if r.user_id <> v_b then raise exception 'TEST MISLUKT: de reservatie staat niet op naam van B'; end if;
  if r.created_by <> v_a then raise exception 'TEST MISLUKT: created_by is niet de maker (A)'; end if;
  if r.person_name is distinct from current_setting('pooltest.name_b') then
    raise exception 'TEST MISLUKT: person_name is niet de naam van B';
  end if;
  if r.created_by_name is distinct from current_setting('pooltest.name_a') then
    raise exception 'TEST MISLUKT: created_by_name is niet de naam van A';
  end if;

  -- Zonder p_user_id, of met de eigen id: op eigen naam (zoals vroeger).
  v_id := public.pool_create_reservation('00000000-0000-4000-8000-0000000080c1', v_t + interval '3 hours', v_t + interval '4 hours');
  select * into r from public.pool_car_reservations where id = v_id;
  if r.user_id <> v_a or r.created_by <> v_a then raise exception 'TEST MISLUKT: zonder collega staat de reservatie niet op eigen naam'; end if;
  v_id := public.pool_create_reservation('00000000-0000-4000-8000-0000000080c1', v_t + interval '5 hours', v_t + interval '6 hours',
    null, null, null, v_a);
  select * into r from public.pool_car_reservations where id = v_id;
  if r.user_id <> v_a then raise exception 'TEST MISLUKT: met de eigen id staat de reservatie niet op eigen naam'; end if;

  -- Een onbekend account.
  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000080c2', v_t, v_t + interval '1 hour',
      null, null, null, '00000000-0000-4000-8000-00000000dead');
    raise exception 'TEST MISLUKT: reserveren voor een onbekend account werd aanvaard';
  exception when foreign_key_violation then null;
  end;

  -- Overlap blijft gelden, ook voor een collega.
  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000080c1', v_t + interval '1 hour', v_t + interval '2 hours',
      null, null, null, v_b);
    raise exception 'TEST MISLUKT: een overlappende reservatie voor een collega werd aanvaard';
  exception when exclusion_violation then null;
  end;
end $$;

-- ── 3. Een freelancer kan niet gekozen worden ───────────────────────────────
do $$
declare
  v_t timestamptz := current_setting('pooltest.t')::timestamptz;
begin
  if current_setting('pooltest.fl') = '' then
    raise notice 'Overgeslagen: er is geen freelancer-account om mee te testen.';
    return;
  end if;
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000080c2', v_t, v_t + interval '1 hour',
      null, null, null, current_setting('pooltest.fl')::uuid);
    raise exception 'TEST MISLUKT: reserveren voor een freelancer werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ── 4. Zowel B (op wiens naam) als A (de maker) mag de reservatie beheren ───
do $$
declare
  v_t  timestamptz := current_setting('pooltest.t')::timestamptz;
  v_r1 uuid := current_setting('pooltest.r1')::uuid;
  r    public.pool_car_reservations;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);
  perform public.pool_update_reservation(v_r1, '00000000-0000-4000-8000-0000000080c1', v_t, v_t + interval '150 minutes',
    null, 'zz Test klant', 'door B aangepast');

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  perform public.pool_update_reservation(v_r1, '00000000-0000-4000-8000-0000000080c1', v_t, v_t + interval '2 hours',
    null, 'zz Test klant', 'door A aangepast');

  select * into r from public.pool_car_reservations where id = v_r1;
  if r.user_id <> current_setting('pooltest.b')::uuid or r.note <> 'door A aangepast' then
    raise exception 'TEST MISLUKT: wijzigen door maker of collega liep niet zoals verwacht';
  end if;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);
  perform public.pool_cancel_reservation(v_r1);
  if not exists (select 1 from public.pool_car_reservations where id = v_r1 and cancelled_at is not null) then
    raise exception 'TEST MISLUKT: B kon de reservatie op zijn naam niet annuleren';
  end if;
end $$;

-- ── 5. Nu vertrekken voor een collega; de maker sluit de rit af ─────────────
do $$
declare
  v_id uuid;
  r    public.pool_car_reservations;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  v_id := public.pool_depart_now('00000000-0000-4000-8000-0000000080c2', now() + interval '2 hours',
    null, null, null, null, current_setting('pooltest.b')::uuid);
  select * into r from public.pool_car_reservations where id = v_id;
  if r.user_id <> current_setting('pooltest.b')::uuid or r.created_by <> current_setting('pooltest.a')::uuid
     or r.departed_at is null or r.departure_km <> 500 then
    raise exception 'TEST MISLUKT: Nu vertrekken voor een collega registreerde niet juist';
  end if;

  perform public.pool_register_arrival(v_id, null, 540);
  select * into r from public.pool_car_reservations where id = v_id;
  if r.arrival_km <> 540 then raise exception 'TEST MISLUKT: de maker kon de rit niet afsluiten'; end if;
end $$;

reset role;

rollback;

select 'Alle tests van 0080 geslaagd' as resultaat;
