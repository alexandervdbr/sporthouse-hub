-- Controle na 0076. Alleen lezen. Verwacht: vier rijen, alle vier ok = true.

select 'functie poolwagen_can' as onderdeel,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'poolwagen_can') as ok
union all
select 'tabel pool_cars met RLS aan',
       coalesce((select relrowsecurity from pg_class
                 where oid = to_regclass('public.pool_cars')), false)
union all
select 'drie policies op pool_cars',
       (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'pool_cars') = 3
union all
select 'twee indexen op pool_cars (+ primary key)',
       (select count(*) from pg_indexes
        where schemaname = 'public' and tablename = 'pool_cars'
          and indexname in ('pool_cars_license_plate_key', 'pool_cars_active_idx')) = 2;
