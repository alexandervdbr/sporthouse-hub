-- Controle na 0080. Alleen lezen. Verwacht: vijf rijen, alle vijf ok = true.

select 'unieke naam per actieve wagen (index bestaat)' as onderdeel,
       exists (select 1 from pg_indexes
                where schemaname = 'public' and tablename = 'pool_cars'
                  and indexname = 'pool_cars_name_active_key'
                  and indexdef ilike '%unique%' and indexdef ilike '%archived_at is null%') as ok
union all
select 'geen dubbele namen bij de actieve wagens',
       not exists (select 1 from public.pool_cars where archived_at is null
                    group by lower(btrim(name)) having count(*) > 1)
union all
select 'nieuwe functies aanroepbaar voor ingelogde gebruikers, niet voor anon',
       has_function_privilege('authenticated', 'public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid)', 'execute')
       and has_function_privilege('authenticated', 'public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid)', 'execute')
       and not has_function_privilege('anon', 'public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid)', 'execute')
       and not has_function_privilege('anon', 'public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid)', 'execute')
union all
select 'oude functies zonder p_user_id zijn weg',
       to_regprocedure('public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text)') is null
       and to_regprocedure('public.pool_depart_now(uuid, timestamptz, uuid, text, text, int)') is null
union all
select 'hulpfunctie pool_reservation_person niet aanroepbaar voor gebruikers',
       to_regprocedure('public.pool_reservation_person(uuid)') is not null
       and not has_function_privilege('authenticated', 'public.pool_reservation_person(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.pool_reservation_person(uuid)', 'execute');
