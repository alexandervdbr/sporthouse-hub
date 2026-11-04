-- Controle na 0077. Alleen lezen. Verwacht: zes rijen, alle zes ok = true.
-- Alleen geldig vóór 0079 (0079 verandert de signatuur van
-- pool_create_reservation); daarna geldt 0079_controle.sql.

select 'twee tabellen met RLS aan' as onderdeel,
       (select count(*) from pg_class
         where oid in (to_regclass('public.pool_car_reservations'), to_regclass('public.pool_car_damage_reports'))
           and relrowsecurity) = 2 as ok
union all
select 'overlapcontrole (exclusion constraint)',
       exists (select 1 from pg_constraint
                where conname = 'pool_car_reservations_no_overlap' and contype = 'x')
union all
select 'één open rit per wagen (unieke index)',
       to_regclass('public.pool_car_reservations_one_open_trip') is not null
union all
select 'elf functies',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in (
           'pool_user_name', 'pool_car_block_reason', 'pool_conflicts', 'pool_check_reservation_access',
           'pool_create_reservation', 'pool_update_reservation', 'pool_cancel_reservation',
           'pool_register_departure', 'pool_register_arrival', 'pool_depart_now',
           'pool_claim_late_notifications')) = 11
union all
select 'leesrechten: één policy per tabel',
       (select count(*) from pg_policies where schemaname = 'public'
         and tablename in ('pool_car_reservations', 'pool_car_damage_reports')) = 2
union all
select 'hulpfuncties niet aanroepbaar voor gebruikers',
       not has_function_privilege('authenticated', 'public.pool_car_block_reason(uuid)', 'execute')
       and has_function_privilege('authenticated', 'public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text)', 'execute');
