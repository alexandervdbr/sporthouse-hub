-- Test van 0078. Draait volledig in begin … rollback: er blijft niets achter.
-- Schrijft alleen in pool_-tabellen. Bestaande accounts (twee collega's) en
-- een bestaand project worden alleen gelezen, als verwijzing.
--
-- Verwacht: één rij "Alle tests van 0078 geslaagd".
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

select set_config('pooltest.claims_a', jsonb_build_object('sub', current_setting('pooltest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);
select set_config('pooltest.claims_b', jsonb_build_object('sub', current_setting('pooltest.b'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);
select set_config('pooltest.claims_b_mgr', jsonb_build_object('sub', current_setting('pooltest.b'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens', 'poolwagens_beheren'))))::text, true);
select set_config('pooltest.claims_fl', jsonb_build_object('sub', current_setting('pooltest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('freelancer', true, 'permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens'))))::text, true);

insert into public.pool_cars (id, name, license_plate, current_km) values
  ('00000000-0000-4000-8000-0000000000c1', 'Testwagen 1', '1-TST-201', 1000),
  ('00000000-0000-4000-8000-0000000000c2', 'Testwagen 2', '1-TST-202', 1000);

select set_config('pooltest.t', (date_trunc('day', now()) + interval '2 days 9 hours')::text, true);

set local role authenticated;

-- ── 1. A meldt schade; foute invoer wordt geweigerd ─────────────────────────
do $$
declare
  v_p    uuid := current_setting('pooltest.project')::uuid;
  v_t    timestamptz := current_setting('pooltest.t')::timestamptz;
  v_trip uuid;
  v_plan uuid;
  v_id   uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);

  v_trip := public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', now() - interval '1 hour', now() + interval '1 hour', v_p);
  perform public.pool_register_departure(v_trip, now() - interval '1 hour', null);
  v_plan := public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t, v_t + interval '2 hours', v_p);
  perform set_config('pooltest.plan', v_plan::text, true);

  begin
    perform public.pool_report_damage('00000000-0000-4000-8000-0000000000c1', v_plan, 'deuk', 'licht');
    raise exception 'TEST MISLUKT: melding bij een rit die nog niet gestart is, werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.pool_report_damage('00000000-0000-4000-8000-0000000000c2', v_trip, 'deuk', 'licht');
    raise exception 'TEST MISLUKT: melding bij een rit van een andere wagen werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.pool_report_damage('00000000-0000-4000-8000-0000000000c1', null, 'deuk', 'middel');
    raise exception 'TEST MISLUKT: onbekende ernst werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.pool_report_damage('00000000-0000-4000-8000-0000000000c1', null, '   ', 'licht');
    raise exception 'TEST MISLUKT: lege omschrijving werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  -- Lichte schade blokkeert niets.
  perform public.pool_report_damage('00000000-0000-4000-8000-0000000000c2', null, 'kras', 'licht');
  perform public.pool_cancel_reservation(public.pool_create_reservation(
    '00000000-0000-4000-8000-0000000000c2', v_t, v_t + interval '1 hour', v_p));

  -- Ernstige schade, bij de rit.
  v_id := public.pool_report_damage('00000000-0000-4000-8000-0000000000c1', v_trip, 'voorruit gebarsten', 'ernstig');
  perform set_config('pooltest.d1', v_id::text, true);

  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '1 day', v_t + interval '1 day 1 hour', v_p);
    raise exception 'TEST MISLUKT: wagen met ernstige schade kon gereserveerd worden';
  exception when check_violation then null;
  end;

  -- De bestaande reservatie blijft staan.
  if not exists (select 1 from public.pool_car_reservations where id = v_plan and cancelled_at is null) then
    raise exception 'TEST MISLUKT: de blokkade annuleerde een bestaande reservatie';
  end if;
end $$;

-- ── 2. Foto's: wie meldde (of beheer), hoogstens 10 ─────────────────────────
do $$
declare
  v_d uuid := current_setting('pooltest.d1')::uuid;
  i   int;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  perform public.pool_add_damage_photo(v_d, 'test-drive-1', 'foto1.jpg', 'image/jpeg');

  begin
    perform public.pool_add_damage_photo(v_d, 'test-drive-1', 'dubbel.jpg', 'image/jpeg');
    raise exception 'TEST MISLUKT: hetzelfde Drive-bestand kon twee keer gekoppeld worden';
  exception when unique_violation then null;
  end;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);
  begin
    perform public.pool_add_damage_photo(v_d, 'test-drive-x', 'x.jpg', 'image/jpeg');
    raise exception 'TEST MISLUKT: B kon een foto bij de melding van A zetten';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b_mgr'), true);
  perform public.pool_add_damage_photo(v_d, 'test-drive-2', 'foto2.jpg', 'image/jpeg');

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  for i in 3..10 loop
    perform public.pool_add_damage_photo(v_d, 'test-drive-' || i, 'foto' || i || '.jpg', 'image/jpeg');
  end loop;
  begin
    perform public.pool_add_damage_photo(v_d, 'test-drive-11', 'foto11.jpg', 'image/jpeg');
    raise exception 'TEST MISLUKT: een elfde foto werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  if (select count(*) from public.pool_car_damage_photos where report_id = v_d) <> 10 then
    raise exception 'TEST MISLUKT: A ziet niet de 10 foto''s';
  end if;
end $$;

-- ── 3. Status en blokkade: alleen beheer ────────────────────────────────────
do $$
declare
  v_d uuid := current_setting('pooltest.d1')::uuid;
  v_p uuid := current_setting('pooltest.project')::uuid;
  v_t timestamptz := current_setting('pooltest.t')::timestamptz;
  v_id uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  begin
    perform public.pool_set_damage_status(v_d, 'hersteld');
    raise exception 'TEST MISLUKT: gebruiker kon de schadestatus wijzigen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pool_lift_damage_block(v_d);
    raise exception 'TEST MISLUKT: gebruiker kon de blokkade opheffen';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b_mgr'), true);
  begin
    perform public.pool_set_damage_status(v_d, 'weg');
    raise exception 'TEST MISLUKT: onbekende status werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  -- In behandeling: nog altijd geblokkeerd.
  perform public.pool_set_damage_status(v_d, 'in_behandeling');
  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '1 day', v_t + interval '1 day 1 hour', v_p);
    raise exception 'TEST MISLUKT: in behandeling blokkeerde niet meer';
  exception when check_violation then null;
  end;

  -- Blokkade opheffen: weer te reserveren, de melding blijft open.
  perform public.pool_lift_damage_block(v_d);
  perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '1 day', v_t + interval '1 day 1 hour', v_p);
  if (select status from public.pool_car_damage_reports where id = v_d) <> 'in_behandeling' then
    raise exception 'TEST MISLUKT: blokkade opheffen veranderde de status';
  end if;
  begin
    perform public.pool_lift_damage_block(v_d);
    raise exception 'TEST MISLUKT: een opgeheven blokkade kon nog eens opgeheven worden';
  exception when invalid_parameter_value then null;
  end;

  -- Nieuwe ernstige melding (door A), daarna hersteld door beheer.
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  v_id := public.pool_report_damage('00000000-0000-4000-8000-0000000000c1', null, 'band lek', 'ernstig');
  begin
    perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '2 days', v_t + interval '2 days 1 hour', v_p);
    raise exception 'TEST MISLUKT: tweede ernstige melding blokkeerde niet';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b_mgr'), true);
  perform public.pool_set_damage_status(v_id, 'hersteld');
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  perform public.pool_create_reservation('00000000-0000-4000-8000-0000000000c1', v_t + interval '2 days', v_t + interval '2 days 1 hour', v_p);
end $$;

-- ── 4. Mailstatus: wie meldde één keer, beheer altijd ───────────────────────
do $$
declare
  v_d uuid := current_setting('pooltest.d1')::uuid;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);
  begin
    perform public.pool_set_damage_mail_status(v_d, 'verstuurd', null);
    raise exception 'TEST MISLUKT: B kon de mailstatus van A''s melding zetten';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  begin
    perform public.pool_set_damage_mail_status(v_d, 'misschien', null);
    raise exception 'TEST MISLUKT: onbekende mailstatus werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
  perform public.pool_set_damage_mail_status(v_d, 'mislukt', 'testfout');
  begin
    perform public.pool_set_damage_mail_status(v_d, 'verstuurd', null);
    raise exception 'TEST MISLUKT: de melder kon de mailstatus een tweede keer zetten';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b_mgr'), true);
  perform public.pool_set_damage_mail_status(v_d, 'verstuurd', null);
  if (select mail_status from public.pool_car_damage_reports where id = v_d) <> 'verstuurd' then
    raise exception 'TEST MISLUKT: beheer kon de mail niet opnieuw als verstuurd zetten';
  end if;
end $$;

-- ── 5. Ontvangers: alleen beheer, gevalideerd ───────────────────────────────
do $$
declare
  v_list text[];
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  begin
    perform public.pool_set_mail_recipients(array['iemand@example.com']);
    raise exception 'TEST MISLUKT: gebruiker kon de ontvangers instellen';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.pool_settings) then
    raise exception 'TEST MISLUKT: gebruiker ziet de instellingen';
  end if;

  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b_mgr'), true);
  begin
    perform public.pool_set_mail_recipients(array['geen-adres']);
    raise exception 'TEST MISLUKT: ongeldig e-mailadres werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  v_list := public.pool_set_mail_recipients(array[' Vloot@Example.com ', 'vloot@example.com', 'beheer@example.be', '']);
  if v_list <> array['beheer@example.be', 'vloot@example.com'] then
    raise exception 'TEST MISLUKT: ontvangers niet genormaliseerd: %', v_list;
  end if;
  if (select damage_mail_recipients from public.pool_settings) <> v_list then
    raise exception 'TEST MISLUKT: ontvangers niet opgeslagen';
  end if;

  v_list := public.pool_set_mail_recipients(array[]::text[]);
  if cardinality(v_list) <> 0 then raise exception 'TEST MISLUKT: lege lijst werd niet leeg'; end if;
end $$;

-- ── 6. Freelancer: geen melding ─────────────────────────────────────────────
do $$
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_fl'), true);
  begin
    perform public.pool_report_damage('00000000-0000-4000-8000-0000000000c2', null, 'x', 'licht');
    raise exception 'TEST MISLUKT: freelancer kon schade melden';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.pool_car_damage_photos) or exists (select 1 from public.pool_car_damage_reports) then
    raise exception 'TEST MISLUKT: freelancer ziet schademeldingen';
  end if;
end $$;

reset role;
rollback;

select 'Alle tests van 0078 geslaagd' as resultaat;
