-- Test van 0077. Draait volledig in begin … rollback: er blijft niets achter.
-- Schrijft alleen in pool_-tabellen. Bestaande accounts (twee collega's) en
-- een bestaand project worden alleen gelezen, als verwijzing.
--
-- Verwacht: één rij "Alle tests van 0077 geslaagd".
-- Bij een fout stopt het script met "TEST MISLUKT: …" (of "TEST KAN NIET
-- DRAAIEN: …") en is alles teruggedraaid.

begin;

-- ── Verwijzingen (alleen lezen) ─────────────────────────────────────────────
select set_config('pooltest.a', coalesce((
  select id::text from auth.users
   where not coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
   order by created_at limit 1), ''), true);
select set_config('pooltest.b', coalesce((
  select id::text from auth.users
   where not coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
   order by created_at offset 1 limit 1), ''), true);
select set_config('pooltest.project', coalesce((select id::text from public.projects order by created_at limit 1), ''), true);

do $$
begin
  if current_setting('pooltest.a') = '' or current_setting('pooltest.b') = '' then
    raise exception 'TEST KAN NIET DRAAIEN: er zijn minstens twee collega-accounts nodig.';
  end if;
  if current_setting('pooltest.project') = '' then
    raise exception 'TEST KAN NIET DRAAIEN: er is minstens één project nodig.';
  end if;
end $$;

-- Claims: A en B als gebruiker, B als beheerder, een freelancer, een account
-- zonder rechten.
select set_config('pooltest.claims_a', jsonb_build_object('sub', current_setting('pooltest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);
select set_config('pooltest.claims_b', jsonb_build_object('sub', current_setting('pooltest.b'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);
select set_config('pooltest.claims_b_mgr', jsonb_build_object('sub', current_setting('pooltest.b'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens', 'poolwagens_beheren'))))::text, true);
select set_config('pooltest.claims_fl', jsonb_build_object('sub', current_setting('pooltest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('freelancer', true, 'permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);
select set_config('pooltest.claims_none', jsonb_build_object('sub', current_setting('pooltest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object())::text, true);

-- ── Testwagens (als postgres) ───────────────────────────────────────────────
insert into public.pool_cars (id, name, license_plate, current_km) values
  ('00000000-0000-4000-8000-0000000000c1', 'Testwagen 1', '1-TST-101', 1000),
  ('00000000-0000-4000-8000-0000000000c2', 'Testwagen 2', '1-TST-102', 500),
  ('00000000-0000-4000-8000-0000000000c3', 'Testwagen 3', '1-TST-103', 2000);
update public.pool_cars set manual_block = true, manual_block_note = 'test'
 where id = '00000000-0000-4000-8000-0000000000c2';

-- Morgen 09:00 (UTC), als vast ankerpunt in de toekomst.
select set_config('pooltest.t', (date_trunc('day', now()) + interval '1 day 9 hours')::text, true);

set local role authenticated;

-- ── 1. Gebruiker A reserveert; foute invoer wordt geweigerd ─────────────────
do $$
declare
  v_t  timestamptz := current_setting('pooltest.t')::timestamptz;
  v_p  uuid := current_setting('pooltest.project')::uuid;
  v_id uuid;
  v_name text;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  v_id := public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t, v_t + interval '3 hours', v_p, 'test');
  perform set_config('pooltest.r1', v_id::text, true);

  select person_name into v_name from public.pool_car_reservations where id = v_id;
  if v_name is null or v_name = '' then raise exception 'TEST MISLUKT: geen naam bij de reservatie'; end if;

  begin
    insert into public.pool_car_reservations (car_id, person_name, start_at, end_at, created_by_name)
    values ('00000000-0000-4000-8000-0000000000c3', 'x', v_t, v_t + interval '1 hour', 'x');
    raise exception 'TEST MISLUKT: rechtstreeks in de tabel schrijven lukte';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c3', now() - interval '3 hours', now() - interval '2 hours', v_p);
    raise exception 'TEST MISLUKT: gebruiker kon in het verleden reserveren';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c3', v_t, v_t, v_p);
    raise exception 'TEST MISLUKT: terugkomst gelijk aan vertrek werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c3', v_t, v_t + interval '1 hour', null);
    raise exception 'TEST MISLUKT: reservatie zonder project werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c2', v_t, v_t + interval '1 hour', v_p);
    raise exception 'TEST MISLUKT: een handmatig geblokkeerde wagen kon gereserveerd worden';
  exception when check_violation then null;
  end;
end $$;

-- ── 2. Gebruiker B: overlap geweigerd, aansluitend mag; niet aan A's reservatie
do $$
declare
  v_t  timestamptz := current_setting('pooltest.t')::timestamptz;
  v_p  uuid := current_setting('pooltest.project')::uuid;
  v_r1 uuid := current_setting('pooltest.r1')::uuid;
  v_id uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);

  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '2 hours', v_t + interval '4 hours', v_p);
    raise exception 'TEST MISLUKT: overlappende reservatie werd aanvaard';
  exception when exclusion_violation then null;
  end;

  -- Begint precies wanneer A terug is.
  v_id := public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '3 hours', v_t + interval '5 hours', v_p);
  perform set_config('pooltest.r2', v_id::text, true);

  begin
    perform public.pool_cancel_reservation(v_r1);
    raise exception 'TEST MISLUKT: B kon de reservatie van A annuleren';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pool_update_reservation(v_r1, '00000000-0000-4000-8000-0000000000c1', v_t, v_t + interval '1 hour', v_p);
    raise exception 'TEST MISLUKT: B kon de reservatie van A wijzigen';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── 3. A wijzigt de eigen reservatie; verlengen tot in die van B mag niet ───
do $$
declare
  v_t  timestamptz := current_setting('pooltest.t')::timestamptz;
  v_p  uuid := current_setting('pooltest.project')::uuid;
  v_r1 uuid := current_setting('pooltest.r1')::uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  perform public.pool_update_reservation(v_r1, '00000000-0000-4000-8000-0000000000c1', v_t - interval '1 hour', v_t + interval '3 hours', v_p, 'vroeger');

  begin
    perform public.pool_update_reservation(v_r1, '00000000-0000-4000-8000-0000000000c1', v_t, v_t + interval '4 hours', v_p);
    raise exception 'TEST MISLUKT: verlengen over de reservatie van B werd aanvaard';
  exception when exclusion_violation then null;
  end;
end $$;

-- ── 4. Rit: vertrek met standaard km-stand, aankomst gevalideerd ────────────
do $$
declare
  v_p  uuid := current_setting('pooltest.project')::uuid;
  v_id uuid;
  r    public.pool_car_reservations;
  v_km int;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  -- Een rit die een uur geleden begon (eindtijd nog in de toekomst).
  v_id := public.pool_create_reservation('00000000-0000-4000-8000-0000000000c3', now() - interval '1 hour', now() + interval '2 hours', v_p);
  perform set_config('pooltest.r3', v_id::text, true);
  perform public.pool_register_departure(v_id, now() - interval '1 hour', null);

  select * into r from public.pool_car_reservations where id = v_id;
  if r.departure_km <> 2000 then raise exception 'TEST MISLUKT: km bij vertrek was % in plaats van de laatst bekende 2000', r.departure_km; end if;

  begin
    perform public.pool_register_departure(v_id, null, null);
    raise exception 'TEST MISLUKT: twee keer vertrekken werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pool_update_reservation(v_id, '00000000-0000-4000-8000-0000000000c3', now() - interval '1 hour', now() + interval '3 hours', v_p);
    raise exception 'TEST MISLUKT: gebruiker kon een gestarte rit wijzigen';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pool_cancel_reservation(v_id);
    raise exception 'TEST MISLUKT: een gestarte rit kon geannuleerd worden';
  exception when invalid_parameter_value then null;
  end;

  -- B (gewone gebruiker) mag de aankomst van A niet registreren.
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);
  begin
    perform public.pool_register_arrival(v_id, null, 2100);
    raise exception 'TEST MISLUKT: B kon de rit van A afsluiten';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  begin
    perform public.pool_register_arrival(v_id, null, 1999);
    raise exception 'TEST MISLUKT: km bij aankomst lager dan bij vertrek werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pool_register_arrival(v_id, now() - interval '2 hours', 2100);
    raise exception 'TEST MISLUKT: aankomst vóór vertrek werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  perform public.pool_register_arrival(v_id, now() - interval '30 minutes', 2150);

  select * into r from public.pool_car_reservations where id = v_id;
  if r.driven_km <> 150 then raise exception 'TEST MISLUKT: gereden km % in plaats van 150', r.driven_km; end if;
  -- Vroeger terug: de wagen is meteen weer vrij.
  if r.end_at <> now() - interval '30 minutes' then raise exception 'TEST MISLUKT: vroege aankomst gaf de wagen niet vrij'; end if;
  select current_km into v_km from public.pool_cars where id = '00000000-0000-4000-8000-0000000000c3';
  if v_km <> 2150 then raise exception 'TEST MISLUKT: km-stand van de wagen is % in plaats van 2150', v_km; end if;

end $$;

-- ── 5. Nu vertrekken ────────────────────────────────────────────────────────
do $$
declare
  v_p  uuid := current_setting('pooltest.project')::uuid;
  v_id uuid;
  r    public.pool_car_reservations;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);

  v_id := public.pool_depart_now('00000000-0000-4000-8000-0000000000c3', now() + interval '2 hours', v_p, null, null);
  select * into r from public.pool_car_reservations where id = v_id;
  if r.start_at <> now() or r.departed_at <> now() or r.departure_km <> 2150 then
    raise exception 'TEST MISLUKT: Nu vertrekken registreerde het vertrek niet juist';
  end if;

  -- Dezelfde wagen nog eens: bezet.
  begin
    perform public.pool_depart_now('00000000-0000-4000-8000-0000000000c3', now() + interval '1 hour', v_p, null, null);
    raise exception 'TEST MISLUKT: Nu vertrekken op een bezette wagen werd aanvaard';
  exception when exclusion_violation then null;
  end;

  -- Geblokkeerde wagen.
  begin
    perform public.pool_depart_now('00000000-0000-4000-8000-0000000000c2', now() + interval '1 hour', v_p, null, null);
    raise exception 'TEST MISLUKT: Nu vertrekken op een geblokkeerde wagen werd aanvaard';
  exception when check_violation then null;
  end;

  -- Lukt de vertrekregistratie niet (negatieve km), dan blijft er ook geen
  -- reservatie achter.
  begin
    perform public.pool_depart_now('00000000-0000-4000-8000-0000000000c1', now() + interval '1 hour', v_p, null, -5);
    raise exception 'TEST MISLUKT: negatieve km bij Nu vertrekken werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.pool_car_reservations
              where car_id = '00000000-0000-4000-8000-0000000000c1' and start_at = now()) then
    raise exception 'TEST MISLUKT: een mislukte Nu vertrekken liet een reservatie achter';
  end if;
end $$;

-- ── 6. Te laat terug: de volgende reservatie komt in het gedrang ────────────
reset role;
-- Wagen 2 weer beschikbaar, met een te late rit van A en een reservatie van
-- B binnen 24 uur (en een verdere die niet in het gedrang is).
update public.pool_cars set manual_block = false where id = '00000000-0000-4000-8000-0000000000c2';
insert into public.pool_car_reservations
  (id, car_id, user_id, person_name, project_id, start_at, end_at, departed_at, departure_km, created_by, created_by_name)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c2', current_setting('pooltest.a')::uuid, 'Test A',
   current_setting('pooltest.project')::uuid, now() - interval '5 hours', now() - interval '1 hour', now() - interval '5 hours', 500,
   current_setting('pooltest.a')::uuid, 'Test A');
insert into public.pool_car_reservations
  (id, car_id, user_id, person_name, project_id, start_at, end_at, created_by, created_by_name)
values
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2', current_setting('pooltest.b')::uuid, 'Test B',
   current_setting('pooltest.project')::uuid, now() + interval '2 hours', now() + interval '4 hours', current_setting('pooltest.b')::uuid, 'Test B'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c2', current_setting('pooltest.b')::uuid, 'Test B',
   current_setting('pooltest.project')::uuid, now() + interval '3 days', now() + interval '3 days 2 hours', current_setting('pooltest.b')::uuid, 'Test B');
set local role authenticated;

do $$
declare
  n    int;
  v_u  uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  select count(*), min(user_id::text)::uuid into n, v_u from public.pool_claim_late_notifications();
  if n <> 1 or v_u <> current_setting('pooltest.b')::uuid then
    raise exception 'TEST MISLUKT: verwacht 1 push voor B, kreeg % rij(en)', n;
  end if;

  select count(*) into n from public.pool_claim_late_notifications();
  if n <> 0 then raise exception 'TEST MISLUKT: de push werd een tweede keer klaargezet'; end if;

  -- B kan niet vertrekken: de wagen is nog niet terug.
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);
  begin
    perform public.pool_register_departure('00000000-0000-4000-8000-0000000000e2', null, null);
    raise exception 'TEST MISLUKT: vertrekken met een wagen die nog niet terug is, werd aanvaard';
  exception when exclusion_violation then null;
  end;
end $$;

-- ── 7. Beheerder: reservaties van anderen, ook een gestarte rit ─────────────
do $$
declare
  v_p  uuid := current_setting('pooltest.project')::uuid;
  v_r1 uuid := current_setting('pooltest.r1')::uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b_mgr'), true);

  -- De te late rit van A verlengen (zelfde wagen).
  perform public.pool_update_reservation('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c2',
    now() - interval '5 hours', now() + interval '1 hour', v_p);

  begin
    perform public.pool_update_reservation('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
      now() - interval '5 hours', now() + interval '1 hour', v_p);
    raise exception 'TEST MISLUKT: een gestarte rit kon naar een andere wagen';
  exception when invalid_parameter_value then null;
  end;

  perform public.pool_cancel_reservation(v_r1);
  if not exists (select 1 from public.pool_car_reservations where id = v_r1 and cancelled_at is not null) then
    raise exception 'TEST MISLUKT: beheerder kon de reservatie van A niet annuleren';
  end if;
end $$;

-- ── 8. Ernstige schade blokkeert nieuwe reservaties ─────────────────────────
reset role;
insert into public.pool_car_damage_reports (id, car_id, description, severity, reported_by_name)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'test', 'ernstig', 'Test');
set local role authenticated;

do $$
declare
  v_t timestamptz := current_setting('pooltest.t')::timestamptz;
  v_p uuid := current_setting('pooltest.project')::uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '2 days', v_t + interval '2 days 1 hour', v_p);
    raise exception 'TEST MISLUKT: een wagen met ernstige schade kon gereserveerd worden';
  exception when check_violation then null;
  end;

  -- De bestaande reservatie van B op die wagen blijft gewoon staan.
  if not exists (select 1 from public.pool_car_reservations
                  where id = current_setting('pooltest.r2')::uuid and cancelled_at is null) then
    raise exception 'TEST MISLUKT: een bestaande reservatie werd door de blokkade geannuleerd';
  end if;

  begin
    insert into public.pool_car_damage_reports (car_id, description, severity, reported_by_name)
    values ('00000000-0000-4000-8000-0000000000c1', 'x', 'licht', 'x');
    raise exception 'TEST MISLUKT: rechtstreeks een schademelding schrijven lukte';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
update public.pool_car_damage_reports set status = 'hersteld' where id = '00000000-0000-4000-8000-0000000000d1';
set local role authenticated;

do $$
declare
  v_t timestamptz := current_setting('pooltest.t')::timestamptz;
  v_p uuid := current_setting('pooltest.project')::uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '2 days', v_t + interval '2 days 1 hour', v_p);
end $$;

-- ── 9. Freelancer en account zonder rechten: niets ──────────────────────────
do $$
declare
  v_t timestamptz := current_setting('pooltest.t')::timestamptz;
  v_p uuid := current_setting('pooltest.project')::uuid;
  n   int;
begin
  foreach n in array array[1, 2] loop
    perform set_config('request.jwt.claims',
      current_setting(case n when 1 then 'pooltest.claims_fl' else 'pooltest.claims_none' end), true);
    begin
      perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c3', v_t + interval '5 days', v_t + interval '5 days 1 hour', v_p);
      raise exception 'TEST MISLUKT: reserveren zonder recht lukte (geval %)', n;
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from public.pool_car_reservations) then
      raise exception 'TEST MISLUKT: reservaties zichtbaar zonder recht (geval %)', n;
    end if;
  end loop;
end $$;

-- ── 10. De database zelf: overlap en één open rit per wagen ─────────────────
reset role;
do $$
declare
  v_t timestamptz := current_setting('pooltest.t')::timestamptz;
begin
  begin
    insert into public.pool_car_reservations (car_id, person_name, start_at, end_at, created_by_name)
    values ('00000000-0000-4000-8000-0000000000c1', 'x', v_t + interval '3 hours 30 minutes', v_t + interval '4 hours', 'x');
    raise exception 'TEST MISLUKT: de exclusion constraint liet een overlap toe';
  exception when exclusion_violation then null;
  end;

  begin
    update public.pool_car_reservations set departed_at = now(), departure_km = 500
     where id = '00000000-0000-4000-8000-0000000000e3';
    raise exception 'TEST MISLUKT: twee open ritten op één wagen werden toegelaten';
  exception when unique_violation then null;
  end;
end $$;

rollback;

select 'Alle tests van 0077 geslaagd' as resultaat;
