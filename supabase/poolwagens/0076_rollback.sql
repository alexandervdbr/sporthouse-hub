-- Rollback van 0076_poolwagens.sql. Verwijdert alleen wat 0076 aanmaakte,
-- in omgekeerde volgorde. Pas draaien nadat 0077 en 0078 (als die al
-- gedraaid zijn) zelf teruggedraaid zijn: die hangen aan pool_cars.
--
-- LET OP: dit wist ook alle wagens die intussen ingevoerd zijn.

begin;

drop policy poolwagens_wijzigen  on public.pool_cars;
drop policy poolwagens_toevoegen on public.pool_cars;
drop policy poolwagens_bekijken  on public.pool_cars;
drop index  public.pool_cars_active_idx;
drop index  public.pool_cars_license_plate_key;
drop table  public.pool_cars;
drop function public.poolwagen_can(text);

commit;
