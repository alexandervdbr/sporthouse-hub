-- Poolwagens: de testwagens van de tankkaarttest verwijderen. ÉÉN TRANSACTIE.
--
-- Verwijdert precies twee wagens: "TEST Poolwagen" (1-ABC-123) en
-- "TEST Poolwagen 2" (1-ABC-124), met hun reservaties, schademeldingen en
-- tankkaart (die laatste via on delete cascade). Andere wagens blijven
-- onaangeroerd.
--
-- Het script stopt met een fout en verwijdert NIETS als:
--   - de TEST-wagens niet precies deze twee zijn (naam én nummerplaat);
--   - er schadefoto's aan hangen (die staan ook in Drive en moeten eerst daar weg).
--
-- Verwacht: één rij met test_wagens 0, reservaties 0, meldingen 0, tankkaarten 0.

begin;

do $$
declare
  v_found  text := (select string_agg(name || ' · ' || license_plate, ', ' order by license_plate)
                       from public.pool_cars where name ilike 'TEST%');
  v_cars   uuid[] := array(select id from public.pool_cars
                            where (name, license_plate) in (('TEST Poolwagen', '1-ABC-123'), ('TEST Poolwagen 2', '1-ABC-124')));
  n_photos int;
begin
  if v_found is distinct from 'TEST Poolwagen · 1-ABC-123, TEST Poolwagen 2 · 1-ABC-124' or cardinality(v_cars) <> 2 then
    raise exception 'Niets verwijderd: verwacht precies TEST Poolwagen (1-ABC-123) en TEST Poolwagen 2 (1-ABC-124), gevonden: % (%)',
      cardinality(v_cars), coalesce(v_found, '-');
  end if;

  select count(*) into n_photos
    from public.pool_car_damage_photos p
    join public.pool_car_damage_reports d on d.id = p.report_id
   where d.car_id = any(v_cars);
  if n_photos <> 0 then
    raise exception 'Niets verwijderd: er hangen % schadefoto(''s) aan de testwagens.', n_photos;
  end if;

  delete from public.pool_car_damage_reports where car_id = any(v_cars);
  delete from public.pool_car_reservations   where car_id = any(v_cars);
  delete from public.pool_cars               where id = any(v_cars);   -- tankkaart volgt via cascade

  if exists (select 1 from public.pool_cars where id = any(v_cars))
     or exists (select 1 from public.pool_car_fuel_cards where car_id = any(v_cars)) then
    raise exception 'Na het verwijderen blijft er iets over; alles teruggedraaid.';
  end if;
end $$;

commit;

select
  (select count(*) from public.pool_cars where name ilike 'TEST%')   as test_wagens,
  (select count(*) from public.pool_car_reservations r
    where not exists (select 1 from public.pool_cars c where c.id = r.car_id)) as reservaties,
  (select count(*) from public.pool_car_damage_reports d
    where not exists (select 1 from public.pool_cars c where c.id = d.car_id)) as meldingen,
  (select count(*) from public.pool_car_fuel_cards f
    where not exists (select 1 from public.pool_cars c where c.id = f.car_id)) as tankkaarten;
