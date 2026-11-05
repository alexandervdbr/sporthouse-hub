-- Controle na 0078. Alleen lezen. Verwacht: vijf rijen, alle vijf ok = true.

select 'twee tabellen met RLS aan' as onderdeel,
       (select count(*) from pg_class
         where oid in (to_regclass('public.pool_car_damage_photos'), to_regclass('public.pool_settings'))
           and relrowsecurity) = 2 as ok
union all
select 'instellingen: precies één rij, zonder ontvangers',
       (select count(*) = 1 and bool_and(cardinality(damage_mail_recipients) = 0) from public.pool_settings)
union all
select 'zes functies',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in (
           'pool_report_damage', 'pool_add_damage_photo', 'pool_set_damage_status',
           'pool_lift_damage_block', 'pool_set_damage_mail_status', 'pool_set_mail_recipients')) = 6
union all
select 'leesrechten: één policy per tabel',
       (select count(*) from pg_policies where schemaname = 'public'
         and tablename in ('pool_car_damage_photos', 'pool_settings')) = 2
union all
select 'aanroepbaar voor ingelogde gebruikers, niet voor anon',
       has_function_privilege('authenticated', 'public.pool_report_damage(uuid, uuid, text, text)', 'execute')
       and not has_function_privilege('anon', 'public.pool_report_damage(uuid, uuid, text, text)', 'execute');
