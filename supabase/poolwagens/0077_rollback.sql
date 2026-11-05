-- Rollback van 0077_poolwagens_reservaties.sql. Verwijdert alleen wat 0077
-- aanmaakte, in omgekeerde volgorde. Draai eerst de rollback van 0079 en dan
-- die van 0078, als die al gedraaid zijn: ze hangen aan deze tabellen.
--
-- LET OP: dit wist ook alle reservaties, ritten en schademeldingen.

begin;

drop policy poolwagens_bekijken on public.pool_car_damage_reports;
drop policy poolwagens_bekijken on public.pool_car_reservations;
drop function public.pool_claim_late_notifications();
drop function public.pool_depart_now(uuid, timestamptz, uuid, text, int);
drop function public.pool_register_arrival(uuid, timestamptz, int);
drop function public.pool_register_departure(uuid, timestamptz, int);
drop function public.pool_cancel_reservation(uuid);
drop function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text);
drop function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text);
drop function public.pool_check_reservation_access(public.pool_car_reservations);
drop function public.pool_conflicts(uuid, timestamptz, timestamptz, uuid);
drop function public.pool_car_block_reason(uuid);
drop function public.pool_user_name(uuid);
drop index public.pool_car_damage_reports_blocking_idx;
drop index public.pool_car_damage_reports_car_idx;
drop table public.pool_car_damage_reports;
drop index public.pool_car_reservations_one_open_trip;
drop index public.pool_car_reservations_project_idx;
drop index public.pool_car_reservations_user_idx;
drop index public.pool_car_reservations_car_idx;
drop table public.pool_car_reservations;

commit;
