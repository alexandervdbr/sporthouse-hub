-- Rollback van 0087_poolwagens_tankkaart.sql: terug naar de toestand na 0080.
-- Verwijdert de drie functies, de tabel met kaartnummers en pincodes, en de
-- kolom fuel_card_last4. LET OP: de ingegeven kaartnummers en pincodes zijn
-- daarna weg. Raakt alleen pool_-objecten aan.
--
-- Verwacht: "Success. No rows returned".

begin;

drop function public.pool_fuel_card_pin(uuid);
drop function public.pool_fuel_cards();
drop function public.pool_set_fuel_card(uuid, text, text, boolean);
drop table public.pool_car_fuel_cards;
alter table public.pool_cars drop column fuel_card_last4;

commit;
