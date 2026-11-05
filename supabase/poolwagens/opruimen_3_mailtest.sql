-- Poolwagens: de testwagen van de mailtest verwijderen. ÉÉN TRANSACTIE.
--
-- Verwijdert alleen wagens waarvan de naam met "TEST" begint, met hun
-- reservaties, schademeldingen en foto-records. Andere wagens blijven staan.
-- De ontvangers in pool_settings blijven ook staan (die zijn echt).
--
-- Stopt zonder iets te verwijderen als er geen of meer dan één TEST-wagen is,
-- of als er meer dan 5 meldingen aan hangen.

begin;

do $$
declare
  ids       uuid[] := array(select id from public.pool_cars where name ilike 'TEST%');
  n_reports int;
  n_photos  int;
  n_res     int;
begin
  if cardinality(ids) <> 1 then
    raise exception 'Verwacht precies 1 wagen met een naam die met TEST begint, gevonden: %. Niets verwijderd.', cardinality(ids);
  end if;

  n_reports := (select count(*) from public.pool_car_damage_reports where car_id = any(ids));
  n_photos  := (select count(*) from public.pool_car_damage_photos p
                join public.pool_car_damage_reports d on d.id = p.report_id where d.car_id = any(ids));
  n_res     := (select count(*) from public.pool_car_reservations where car_id = any(ids));
  if n_reports > 5 then
    raise exception 'Meer meldingen dan verwacht (%). Niets verwijderd.', n_reports;
  end if;

  delete from public.pool_car_damage_photos p using public.pool_car_damage_reports d
    where d.id = p.report_id and d.car_id = any(ids);
  delete from public.pool_car_damage_reports where car_id = any(ids);
  delete from public.pool_car_reservations where car_id = any(ids);
  delete from public.pool_cars where id = any(ids);

  raise notice 'Verwijderd: 1 wagen, % meldingen, % foto-records, % reservaties.', n_reports, n_photos, n_res;
end $$;

commit;

-- Controle: 0 TEST-wagens; de andere aantallen zijn wat er echt in staat.
select
  (select count(*) from public.pool_cars where name ilike 'TEST%') as test_wagens,
  (select count(*) from public.pool_cars)                          as wagens,
  (select count(*) from public.pool_car_damage_reports)            as meldingen;
