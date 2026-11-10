-- Test van 0087 (tankkaart en pincode). Draait volledig in begin … rollback:
-- er blijft niets achter. Schrijft alleen in pool_-tabellen, met twee
-- testwagens en een verzonnen kaart (pincode 1234). Bestaande accounts worden
-- alleen gelezen, als verwijzing.
--
-- Verwacht: één rij "Alle tests van 0087 geslaagd".
-- Bij een fout stopt het script met "TEST MISLUKT: …" (of "TEST KAN NIET
-- DRAAIEN: …") en is alles teruggedraaid.

begin;

-- ── Verwijzingen (alleen lezen) ─────────────────────────────────────────────
-- A: rijdt met de wagen. B: een collega zonder rit. M: beheer (account A met
-- het beheerrecht; de rechten komen uit de claims).
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
select set_config('pooltest.claims_m', jsonb_build_object('sub', current_setting('pooltest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('poolwagens', 'poolwagens_beheren'))))::text, true);

insert into public.pool_cars (id, name, license_plate, current_km) values
  ('00000000-0000-4000-8000-0000000087c1', 'zz Test 0087 Bus', '0-TST-871', 1000),
  ('00000000-0000-4000-8000-0000000087c2', 'zz Test 0087 Wagen', '0-TST-872', 500);

set local role authenticated;

-- ── 1. Beheer stelt de kaart in ─────────────────────────────────────────────
do $$
declare
  v_c1 uuid := '00000000-0000-4000-8000-0000000087c1';
  r    record;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_m'), true);
  perform public.pool_set_fuel_card(v_c1, ' 7077 1234-5678 90ab ', '1234');

  if (select fuel_card_last4 from public.pool_cars where id = v_c1) is distinct from '90AB' then
    raise exception 'TEST MISLUKT: de laatste vier tekens zijn niet 90AB';
  end if;
  select * into r from public.pool_fuel_cards() f where f.car_id = v_c1;
  if r.card_number is distinct from '7077 1234-5678 90ab' or not r.has_pin then
    raise exception 'TEST MISLUKT: het overzicht voor beheer klopt niet';
  end if;
  if public.pool_fuel_card_pin(v_c1) is distinct from '1234' then
    raise exception 'TEST MISLUKT: beheer ziet de pincode niet';
  end if;

  -- Ongeldige invoer.
  begin
    perform public.pool_set_fuel_card(v_c1, '7077 1234', '12a4');
    raise exception 'TEST MISLUKT: een pincode met een letter werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.pool_set_fuel_card(v_c1, '1-2', null);
    raise exception 'TEST MISLUKT: een kaartnummer van 2 tekens werd aanvaard';
  exception when invalid_parameter_value then null;
  end;

  -- Alleen het nummer wijzigen: de pincode blijft.
  perform public.pool_set_fuel_card(v_c1, '7077 0000 0000 4321', null);
  if public.pool_fuel_card_pin(v_c1) is distinct from '1234'
     or (select fuel_card_last4 from public.pool_cars where id = v_c1) is distinct from '4321' then
    raise exception 'TEST MISLUKT: het nummer wijzigen raakte de pincode, of de laatste vier kloppen niet';
  end if;
end $$;

-- ── 2. Een collega zonder rit: niets ────────────────────────────────────────
do $$
declare
  v_c1 uuid := '00000000-0000-4000-8000-0000000087c1';
  v_n  int;
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);

  begin
    perform public.pool_fuel_card_pin(v_c1);
    raise exception 'TEST MISLUKT: een collega zonder rit kreeg de pincode';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pool_set_fuel_card(v_c1, '9999 9999', '0000');
    raise exception 'TEST MISLUKT: een collega zonder beheerrecht kon de kaart wijzigen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.pool_fuel_cards();
    raise exception 'TEST MISLUKT: een collega zonder beheerrecht kreeg het overzicht';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into v_n from public.pool_car_fuel_cards;
    raise exception 'TEST MISLUKT: de tabel met pincodes is rechtstreeks leesbaar';
  exception when insufficient_privilege then null;
  end;
  -- De laatste vier tekens ziet iedereen.
  if (select fuel_card_last4 from public.pool_cars where id = v_c1) is distinct from '4321' then
    raise exception 'TEST MISLUKT: een collega ziet de laatste vier tekens niet';
  end if;
end $$;

-- ── 3. Tijdens de eigen rit wel, ervoor en erna niet ────────────────────────
do $$
declare
  v_c1 uuid := '00000000-0000-4000-8000-0000000087c1';
  v_c2 uuid := '00000000-0000-4000-8000-0000000087c2';
  v_id uuid;
begin
  -- A vertrekt met c1.
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  begin
    perform public.pool_fuel_card_pin(v_c1);
    raise exception 'TEST MISLUKT: A kreeg de pincode vóór het vertrek';
  exception when insufficient_privilege then null;
  end;

  v_id := public.pool_depart_now(v_c1, now() + interval '2 hours');
  if public.pool_fuel_card_pin(v_c1) is distinct from '1234' then
    raise exception 'TEST MISLUKT: A ziet de pincode niet tijdens de rit';
  end if;
  -- Alleen voor de eigen wagen: c2 heeft geen rit van A.
  begin
    perform public.pool_fuel_card_pin(v_c2);
    raise exception 'TEST MISLUKT: A kreeg toegang tot de pincode van een andere wagen';
  exception when insufficient_privilege then null;
  end;

  -- B blijft buiten, ook nu A onderweg is.
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_b'), true);
  begin
    perform public.pool_fuel_card_pin(v_c1);
    raise exception 'TEST MISLUKT: B kreeg de pincode tijdens de rit van A';
  exception when insufficient_privilege then null;
  end;

  -- Na de aankomst: niet meer.
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_a'), true);
  perform public.pool_register_arrival(v_id, null, 1050);
  begin
    perform public.pool_fuel_card_pin(v_c1);
    raise exception 'TEST MISLUKT: A kreeg de pincode na de aankomst';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── 4. Wissen ───────────────────────────────────────────────────────────────
do $$
declare
  v_c1 uuid := '00000000-0000-4000-8000-0000000087c1';
begin
  perform set_config('request.jwt.claims', current_setting('pooltest.claims_m'), true);

  perform public.pool_set_fuel_card(v_c1, '7077 0000 0000 4321', null, true);
  if public.pool_fuel_card_pin(v_c1) is not null
     or (select has_pin from public.pool_fuel_cards() f where f.car_id = v_c1) then
    raise exception 'TEST MISLUKT: de pincode werd niet gewist';
  end if;

  perform public.pool_set_fuel_card(v_c1, '', null);
  if exists (select 1 from public.pool_fuel_cards() f where f.car_id = v_c1)
     or (select fuel_card_last4 from public.pool_cars where id = v_c1) is not null then
    raise exception 'TEST MISLUKT: zonder nummer en pincode blijft er iets staan';
  end if;
end $$;

reset role;

rollback;

select 'Alle tests van 0087 geslaagd' as resultaat;
