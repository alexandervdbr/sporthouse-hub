-- Poolwagens: telling vóór het opruimen van de testdata. ALLEEN LEZEN.
-- Wijzigt niets. Eén resultaat: eerst de aantallen per tabel, dan de wagens.

select soort, naam, detail
from (
  select 1 as volgorde, 'telling' as soort, 'pool_cars' as naam, count(*)::text as detail from public.pool_cars
  union all select 2, 'telling', 'pool_car_reservations (reservaties en ritten)', count(*)::text from public.pool_car_reservations
  union all select 3, 'telling', 'pool_car_damage_reports', count(*)::text from public.pool_car_damage_reports
  union all select 4, 'telling', 'pool_car_damage_photos', count(*)::text from public.pool_car_damage_photos
  union all select 5, 'telling', 'pool_settings', count(*)::text from public.pool_settings
  union all select 6, 'telling', 'ontvangers in pool_settings',
    coalesce((select cardinality(damage_mail_recipients) from public.pool_settings limit 1), 0)::text
  union all
  select 10, 'wagen', c.name,
    c.license_plate || case when c.archived_at is not null then ' (gearchiveerd)' else '' end
  from public.pool_cars c
) t
order by volgorde, naam;
