-- Controle na 0087 (tankkaart en pincode). Alleen lezen. Toont geen
-- kaartnummers en geen pincodes. Verwacht: vijf rijen, alle vijf ok = true.

select 'kolom pool_cars.fuel_card_last4 bestaat' as onderdeel,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'pool_cars' and column_name = 'fuel_card_last4') as ok
union all
select 'tabel pool_car_fuel_cards: RLS aan, geen policies',
       (select relrowsecurity from pg_class where oid = 'public.pool_car_fuel_cards'::regclass)
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pool_car_fuel_cards')
union all
select 'niemand leest of schrijft de tabel rechtstreeks',
       not has_table_privilege('authenticated', 'public.pool_car_fuel_cards', 'select')
       and not has_table_privilege('authenticated', 'public.pool_car_fuel_cards', 'insert')
       and not has_table_privilege('authenticated', 'public.pool_car_fuel_cards', 'update')
       and not has_table_privilege('anon', 'public.pool_car_fuel_cards', 'select')
union all
select 'de drie functies: wel voor ingelogde gebruikers, niet voor anon',
       has_function_privilege('authenticated', 'public.pool_set_fuel_card(uuid, text, text, boolean)', 'execute')
       and has_function_privilege('authenticated', 'public.pool_fuel_cards()', 'execute')
       and has_function_privilege('authenticated', 'public.pool_fuel_card_pin(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.pool_set_fuel_card(uuid, text, text, boolean)', 'execute')
       and not has_function_privilege('anon', 'public.pool_fuel_cards()', 'execute')
       and not has_function_privilege('anon', 'public.pool_fuel_card_pin(uuid)', 'execute')
union all
select 'laatste vier tekens kloppen met de opgeslagen kaartnummers',
       not exists (select 1 from public.pool_cars c
                     left join public.pool_car_fuel_cards f on f.car_id = c.id
                    where c.fuel_card_last4 is distinct from
                          right(nullif(upper(regexp_replace(coalesce(f.card_number, ''), '[^0-9A-Za-z]', '', 'g')), ''), 4));
