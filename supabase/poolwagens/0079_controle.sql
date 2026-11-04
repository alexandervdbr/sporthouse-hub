-- Controle na 0079. Alleen lezen. Verwacht: zes rijen, alle zes ok = true.

select 'project_id is weg' as onderdeel,
       not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'pool_car_reservations'
                      and column_name = 'project_id') as ok
union all
select 'client_id en client_name bestaan',
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'pool_car_reservations'
           and column_name in ('client_id', 'client_name')) = 2
union all
select 'foreign key naar clients (on delete set null)',
       exists (select 1 from pg_constraint
                where conrelid = 'public.pool_car_reservations'::regclass and contype = 'f'
                  and confrelid = 'public.clients'::regclass and confdeltype = 'n')
union all
select 'nieuwe functies aanroepbaar voor ingelogde gebruikers',
       has_function_privilege('authenticated', 'public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text)', 'execute')
       and has_function_privilege('authenticated', 'public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text, text)', 'execute')
       and has_function_privilege('authenticated', 'public.pool_depart_now(uuid, timestamptz, uuid, text, text, int)', 'execute')
       and not has_function_privilege('anon', 'public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text)', 'execute')
union all
select 'oude functies met project zijn weg',
       to_regprocedure('public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text)') is null
       and to_regprocedure('public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text)') is null
       and to_regprocedure('public.pool_depart_now(uuid, timestamptz, uuid, text, int)') is null
union all
select 'hulpfunctie pool_resolve_client niet aanroepbaar voor gebruikers',
       to_regprocedure('public.pool_resolve_client(uuid, text)') is not null
       and not has_function_privilege('authenticated', 'public.pool_resolve_client(uuid, text)', 'execute');
