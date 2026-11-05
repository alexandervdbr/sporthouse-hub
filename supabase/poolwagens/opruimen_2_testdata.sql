-- Poolwagens: alle testdata verwijderen. ÉÉN TRANSACTIE.
--
-- Bevestigd op 2026-11-05 (telling uit opruimen_1_telling.sql):
--   pool_cars                 2  (Poolwagen 1 · 1-ABC-242, gearchiveerd;
--                                 Poolwagen 1.2 · 1-ABC-245)
--   pool_car_reservations     6
--   pool_car_damage_reports   1
--   pool_car_damage_photos    0
--   pool_settings             1  (blijft bestaan; de ontvangerslijst wordt leeg)
--
-- Wijkt er ook maar één telling af, of staat er een andere wagen, dan stopt
-- het script met een fout en wordt er NIETS verwijderd. Alleen pool_-tabellen.

begin;

do $$
declare
  n_cars    int := (select count(*) from public.pool_cars);
  n_res     int := (select count(*) from public.pool_car_reservations);
  n_reports int := (select count(*) from public.pool_car_damage_reports);
  n_photos  int := (select count(*) from public.pool_car_damage_photos);
  n_set     int := (select count(*) from public.pool_settings);
  plates    text := (select string_agg(license_plate, ',' order by license_plate) from public.pool_cars);
begin
  if n_cars <> 2 or n_res <> 6 or n_reports <> 1 or n_photos <> 0 or n_set <> 1
     or plates is distinct from '1-ABC-242,1-ABC-245' then
    raise exception 'Telling wijkt af, niets verwijderd: wagens % (2), reservaties % (6), meldingen % (1), foto''s % (0), settings % (1), platen % (1-ABC-242,1-ABC-245)',
      n_cars, n_res, n_reports, n_photos, n_set, coalesce(plates, '-');
  end if;

  -- Van onder naar boven (foreign keys: foto → melding → wagen, reservatie → wagen).
  delete from public.pool_car_damage_photos;
  delete from public.pool_car_damage_reports;
  delete from public.pool_car_reservations;
  delete from public.pool_cars;
  update public.pool_settings set damage_mail_recipients = '{}', updated_at = now(), updated_by_name = null;

  if (select count(*) from public.pool_cars) + (select count(*) from public.pool_car_reservations)
     + (select count(*) from public.pool_car_damage_reports) + (select count(*) from public.pool_car_damage_photos) <> 0
     or (select count(*) from public.pool_settings where cardinality(damage_mail_recipients) = 0) <> 1 then
    raise exception 'Na het verwijderen blijft er iets over; alles teruggedraaid.';
  end if;
end $$;

commit;

-- Controle na afloop: alle aantallen 0, pool_settings 1 met 0 ontvangers.
select
  (select count(*) from public.pool_cars)               as wagens,
  (select count(*) from public.pool_car_reservations)   as reservaties,
  (select count(*) from public.pool_car_damage_reports) as meldingen,
  (select count(*) from public.pool_car_damage_photos)  as fotos,
  (select count(*) from public.pool_settings)           as settings,
  (select cardinality(damage_mail_recipients) from public.pool_settings) as ontvangers;
