-- Rollback van 0078_poolwagens_schade.sql. Verwijdert alleen wat 0078
-- aanmaakte, in omgekeerde volgorde. De foto's zelf blijven in Google Drive
-- staan (map Poolwagens/Schade); alleen de verwijzingen verdwijnen.
--
-- LET OP: dit wist ook de ingestelde ontvangers en de fotoverwijzingen.

begin;

drop policy poolwagens_beheren  on public.pool_settings;
drop policy poolwagens_bekijken on public.pool_car_damage_photos;
drop function public.pool_set_mail_recipients(text[]);
drop function public.pool_set_damage_mail_status(uuid, text, text);
drop function public.pool_lift_damage_block(uuid);
drop function public.pool_set_damage_status(uuid, text);
drop function public.pool_add_damage_photo(uuid, text, text, text);
drop function public.pool_report_damage(uuid, uuid, text, text);
drop table public.pool_settings;
drop index public.pool_car_damage_photos_report_idx;
drop table public.pool_car_damage_photos;

commit;
