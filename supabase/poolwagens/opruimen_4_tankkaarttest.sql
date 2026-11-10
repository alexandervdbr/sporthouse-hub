-- Poolwagens: de testwagen van de tankkaarttest verwijderen. ÉÉN TRANSACTIE.
--
-- Verwijdert precies één wagen: "TEST Poolwagen" (1-ABC-123), met zijn
-- reservaties, schademeldingen en tankkaart (die laatste via on delete cascade).
-- Andere wagens blijven onaangeroerd.
--
-- Het script stopt met een fout en verwijdert NIETS als:
--   - er niet precies één wagen is waarvan de naam met "TEST" begint;
--   - die wagen een andere naam of nummerplaat heeft;
--   - er schadefoto's aan hangen (die staan ook in Drive en moeten eerst daar weg).
--
-- Verwacht: één rij met test_wagens 0, reservaties 0, meldingen 0, tankkaarten 0.

begin;

do $$
declare
  n_test   int  := (select count(*) from public.pool_cars where name ilike 'TEST%');
  v_car    uuid := (select id from public.pool_cars where name = 'TEST Poolwagen' and license_plate = '1-ABC-123');
  n_photos int;
begin
  if n_test <> 1 or v_car is null then
    raise exception 'Niets verwijderd: verwacht precies één wagen "TEST Poolwagen" (1-ABC-123), gevonden: % TEST-wagen(s), %',
      n_test, coalesce((select string_agg(name || ' · ' || license_plate, ', ') from public.pool_cars where name ilike 'TEST%'), '-');
  end if;

  select count(*) into n_photos
    from public.pool_car_damage_photos p
    join public.pool_car_damage_reports d on d.id = p.report_id
   where d.car_id = v_car;
  if n_photos <> 0 then
    raise exception 'Niets verwijderd: er hangen % schadefoto(''s) aan de testwagen.', n_photos;
  end if;

  delete from public.pool_car_damage_reports where car_id = v_car;
  delete from public.pool_car_reservations   where car_id = v_car;
  delete from public.pool_cars               where id = v_car;   -- tankkaart volgt via cascade

  if exists (select 1 from public.pool_cars where id = v_car)
     or exists (select 1 from public.pool_car_fuel_cards where car_id = v_car) then
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
