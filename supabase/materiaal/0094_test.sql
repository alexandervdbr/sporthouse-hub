-- TEST van 0094 (boekingen samenvoegen). Eerst 0094 zelf uitvoeren (op de
-- testomgeving of live: de migratie is additief), dan dit script. Draait
-- volledig in begin … rollback: er blijft niets achter. Schrijft alleen in
-- gear_-tabellen, met een eigen testcategorie, testmateriaal en een testkit.
-- Bestaande accounts worden alleen gelezen, als verwijzing.
--
-- Verwacht: één rij "Alle tests van 0094 geslaagd".
-- Bij een fout stopt het script met "TEST MISLUKT: …" (of "TEST KAN NIET
-- DRAAIEN: …") en is alles teruggedraaid.

begin;

-- ── Verwijzingen (alleen lezen) ─────────────────────────────────────────────
-- A en B: twee actieve collega's. M: account A met Beheren.
select set_config('geartest.a', coalesce((
  select id::text from auth.users
   where not coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
     and (raw_app_meta_data ->> 'expires_at' is null
          or left(raw_app_meta_data ->> 'expires_at', 10) >= to_char(now() at time zone 'Europe/Brussels', 'YYYY-MM-DD'))
   order by created_at limit 1), ''), true);
select set_config('geartest.b', coalesce((
  select id::text from auth.users
   where not coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
     and (raw_app_meta_data ->> 'expires_at' is null
          or left(raw_app_meta_data ->> 'expires_at', 10) >= to_char(now() at time zone 'Europe/Brussels', 'YYYY-MM-DD'))
   order by created_at offset 1 limit 1), ''), true);

do $$
begin
  if current_setting('geartest.a') = '' or current_setting('geartest.b') = '' then
    raise exception 'TEST KAN NIET DRAAIEN: er zijn minstens twee actieve collega-accounts nodig.';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'gear_merge_bookings') then
    raise exception 'TEST KAN NIET DRAAIEN: voer eerst 0094_gear_samenvoegen.sql uit.';
  end if;
end $$;

select set_config('geartest.claims_a', jsonb_build_object('sub', current_setting('geartest.a'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('materiaal', 'materiaal_reserveren'))))::text, true);
select set_config('geartest.claims_b', jsonb_build_object('sub', current_setting('geartest.b'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('materiaal', 'materiaal_reserveren'))))::text, true);
select set_config('geartest.claims_m', jsonb_build_object('sub', current_setting('geartest.b'), 'role', 'authenticated',
  'app_metadata', jsonb_build_object('permissions', jsonb_build_object('sections', jsonb_build_array('materiaal', 'materiaal_reserveren', 'reservering_verwijderen'))))::text, true);

-- ── Testmateriaal (als eigenaar, vóór de rol wisselt) ───────────────────────
do $$
declare
  v_cat uuid; v_kit uuid; v_p1 uuid; v_p2 uuid; v uuid;
begin
  insert into public.gear_categories (name) values ('ZZ test 0094') returning id into v_cat;
  for n in 1..5 loop
    insert into public.gear_items (category_id, name) values (v_cat, 'ZZ0094 los ' || n) returning id into v;
    perform set_config('geartest.i' || n, v::text, true);
  end loop;
  insert into public.gear_items (category_id, name) values (v_cat, 'ZZ0094 deel 1') returning id into v_p1;
  insert into public.gear_items (category_id, name) values (v_cat, 'ZZ0094 deel 2') returning id into v_p2;
  insert into public.gear_kits (category_id, name) values (v_cat, 'ZZ0094 kit') returning id into v_kit;
  insert into public.gear_kit_members (kit_id, item_id, sort_order, added_by_name) values (v_kit, v_p1, 1, 'test'), (v_kit, v_p2, 2, 'test');
  perform set_config('geartest.kit', v_kit::text, true);
  perform set_config('geartest.p1', v_p1::text, true);
end $$;

set local role authenticated;

do $$
declare
  a   uuid := current_setting('geartest.a')::uuid;
  b   uuid := current_setting('geartest.b')::uuid;
  i1  uuid := current_setting('geartest.i1')::uuid;
  i2  uuid := current_setting('geartest.i2')::uuid;
  i3  uuid := current_setting('geartest.i3')::uuid;
  i4  uuid := current_setting('geartest.i4')::uuid;
  i5  uuid := current_setting('geartest.i5')::uuid;
  kit uuid := current_setting('geartest.kit')::uuid;
  p1  uuid := current_setting('geartest.p1')::uuid;
  -- Ver in de toekomst: niets van echte boekingen in de weg.
  d1  date := (now() at time zone 'Europe/Brussels')::date + 400;
  d2  date := (now() at time zone 'Europe/Brussels')::date + 402;
  bk1 uuid; bk2 uuid; bk3 uuid; bk4 uuid; bkb uuid; bkn uuid;
  r jsonb; t uuid; v_ok boolean; v_n int; v_note text; v_via uuid;
begin
  perform set_config('request.jwt.claims', current_setting('geartest.claims_a'), true);
  -- A boekt voor zichzelf: drie keer 10:00–18:00, één keer 10:15–18:00.
  bk1 := public.gear_create_booking(d1, d2, array[i1], '{}', '{}', a, null, null, null, null, 'shoot A', time '10:00', time '18:00');
  bk2 := public.gear_create_booking(d1, d2, '{}', array[kit], '{}', a, null, null, null, null, 'shoot B', time '10:00', time '18:00');
  bk3 := public.gear_create_booking(d1, d2, array[i2], '{}', '{}', a, null, null, null, null, 'Shoot A', time '10:00', time '18:00');
  bk4 := public.gear_create_booking(d1, d2, array[i3], '{}', '{}', a, null, null, null, null, null, time '10:15', time '18:00');

  -- 1. Andere periode (een kwartier): geweigerd.
  v_ok := false;
  begin perform public.gear_merge_bookings(array[bk1, bk4]);
  exception when others then v_ok := sqlerrm like '%exact dezelfde periode%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: andere uren werden toch samengevoegd'; end if;

  -- 2. Eén boeking: geweigerd.
  v_ok := false;
  begin perform public.gear_merge_bookings(array[bk1, bk1]);
  exception when others then v_ok := sqlerrm like '%minstens twee%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: één boeking "samenvoegen" werd aanvaard'; end if;

  -- 3. B mag de boekingen van A niet samenvoegen.
  perform set_config('request.jwt.claims', current_setting('geartest.claims_b'), true);
  v_ok := false;
  begin perform public.gear_merge_bookings(array[bk1, bk2]);
  exception when others then v_ok := sqlerrm like '%eigen boekingen%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: B kon de boekingen van A samenvoegen'; end if;

  -- 4. Andere persoon (B boekt voor zichzelf), ook met Beheren: geweigerd.
  bkb := public.gear_create_booking(d1, d2, array[i4], '{}', '{}', b, null, null, null, null, null, time '10:00', time '18:00');
  perform set_config('request.jwt.claims', current_setting('geartest.claims_m'), true);
  v_ok := false;
  begin perform public.gear_merge_bookings(array[bk1, bkb]);
  exception when others then v_ok := sqlerrm like '%dezelfde persoon%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: boekingen van twee personen werden samengevoegd'; end if;

  -- 5. A voegt drie boekingen samen; klant/project van bk2. Eén boeking blijft
  --    (de oudste; in deze ene transactie hebben ze dezelfde tijd, dus welke ook).
  perform set_config('request.jwt.claims', current_setting('geartest.claims_a'), true);
  r := public.gear_merge_bookings(array[bk3, bk2, bk1], bk2);
  t := (r ->> 'target_id')::uuid;
  if not (t = any(array[bk1, bk2, bk3])) then raise exception 'TEST MISLUKT: onbekende boeking bleef over'; end if;
  select count(*) into v_n from public.gear_booking_items where booking_id = t;
  if v_n <> 4 then raise exception 'TEST MISLUKT: verwacht 4 regels op de samengevoegde boeking, kreeg %', v_n; end if;
  select via_kit_id into v_via from public.gear_booking_items where booking_id = t and item_id = p1;
  if v_via is distinct from kit then raise exception 'TEST MISLUKT: het kitonderdeel ging niet meer via zijn kit'; end if;
  -- "shoot A" en "Shoot A" tellen één keer.
  select lower(note) into v_note from public.gear_bookings where id = t;
  if v_note not in ('shoot a · shoot b', 'shoot b · shoot a') then raise exception 'TEST MISLUKT: notities niet goed samengevoegd: %', v_note; end if;
  select count(*) into v_n from public.gear_bookings
   where id = any(array[bk1, bk2, bk3]) and id <> t and cancelled_at is not null and merged_into_id = t;
  if v_n <> 2 then raise exception 'TEST MISLUKT: de andere boekingen verdwenen niet (merged_into_id)'; end if;
  if exists (select 1 from public.gear_booking_items where booking_id = any(array[bk1, bk2, bk3]) and booking_id <> t) then
    raise exception 'TEST MISLUKT: er bleven regels achter op een opgenomen boeking';
  end if;
  if (select client_id from public.gear_bookings where id = t) is not null then
    raise exception 'TEST MISLUKT: klant niet van de gekozen boeking';
  end if;

  -- 6. Een opgenomen boeking kan niet nog eens samengevoegd worden.
  v_ok := false;
  begin perform public.gear_merge_bookings(array[bk1, bk2, bk3]);
  exception when others then v_ok := sqlerrm like '%al geannuleerd%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: een opgenomen boeking werd opnieuw gebruikt'; end if;

  -- 7. B mag de samenvoeging van A niet ongedaan maken.
  perform set_config('request.jwt.claims', current_setting('geartest.claims_b'), true);
  v_ok := false;
  begin perform public.gear_unmerge_bookings((r ->> 'merge_id')::uuid);
  exception when others then v_ok := sqlerrm like '%Alleen wie samenvoegde%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: B kon de samenvoeging van A ongedaan maken'; end if;

  -- 8. A maakt ongedaan: alles terug zoals het was.
  perform set_config('request.jwt.claims', current_setting('geartest.claims_a'), true);
  perform public.gear_unmerge_bookings((r ->> 'merge_id')::uuid);
  if (select count(*) from public.gear_booking_items where booking_id = bk1) <> 1
     or (select count(*) from public.gear_booking_items where booking_id = bk2) <> 2
     or (select count(*) from public.gear_booking_items where booking_id = bk3) <> 1 then
    raise exception 'TEST MISLUKT: de regels kwamen niet terug bij hun boeking';
  end if;
  if exists (select 1 from public.gear_bookings where id in (bk1, bk2, bk3) and (cancelled_at is not null or merged_into_id is not null))
     or (select note from public.gear_bookings where id = bk1) <> 'shoot A' then
    raise exception 'TEST MISLUKT: de boekingen kwamen niet terug zoals ze waren';
  end if;
  if exists (select 1 from public.gear_booking_items where booking_id in (bk1, bk2, bk3) and cancelled) then
    raise exception 'TEST MISLUKT: teruggezette regels staan nog als geannuleerd';
  end if;

  -- 9. Twee keer ongedaan maken: geweigerd.
  v_ok := false;
  begin perform public.gear_unmerge_bookings((r ->> 'merge_id')::uuid);
  exception when others then v_ok := sqlerrm like '%al ongedaan%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: twee keer ongedaan maken werd aanvaard'; end if;

  -- 10. Boeken en meteen toevoegen aan bk1, klant/project van de nieuwe.
  r := public.gear_create_booking_into(bk1, 'new', d1, d2, array[i5], '{}', '{}', a, null, null, null, null, 'extra', time '10:00', time '18:00');
  bkn := (r ->> 'created_id')::uuid;
  if (r ->> 'target_id')::uuid <> bk1
     or (select count(*) from public.gear_booking_items where booking_id = bk1) <> 2
     or not exists (select 1 from public.gear_bookings where id = bkn and merged_into_id = bk1)
     or (select note from public.gear_bookings where id = bk1) <> 'shoot A · extra' then
    raise exception 'TEST MISLUKT: boeken en toevoegen aan de bestaande boeking';
  end if;

  -- 11. Boeken en toevoegen met een andere periode: niets geboekt (atomair).
  v_ok := false;
  begin perform public.gear_create_booking_into(bk1, 'existing', d2 + 10, d2 + 10, array[i4], '{}', '{}', a, null, null, null, null, null, null, null);
  exception when others then v_ok := sqlerrm like '%exact dezelfde periode%'; end;
  if not v_ok then raise exception 'TEST MISLUKT: toevoegen met een andere periode werd aanvaard'; end if;
  if exists (select 1 from public.gear_booking_items bi join public.gear_bookings g on g.id = bi.booking_id
              where bi.item_id = i4 and g.booked_for_user_id = a) then
    raise exception 'TEST MISLUKT: een mislukte toevoeging liet toch een boeking achter';
  end if;
end $$;

reset role;

rollback;

select 'Alle tests van 0094 geslaagd' as resultaat;
