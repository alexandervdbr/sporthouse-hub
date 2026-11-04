-- Rollback van 0080_poolwagens_voor_wie.sql: terug naar de toestand na 0079.
-- Verwijdert alleen wat 0080 aanmaakte en zet de twee functies terug zoals in
-- 0079 (zonder p_user_id). Raakt alleen pool_-objecten aan.
--
-- Reservaties die voor een collega gemaakt zijn, blijven bestaan zoals ze
-- zijn (op naam van die collega, met de maker in created_by).
--
-- Verwacht: "Success. No rows returned".

begin;

drop function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid);
drop function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid);
drop function public.pool_reservation_person(uuid);
drop index public.pool_cars_name_active_key;

-- De functies zoals in 0079.

create function public.pool_create_reservation(
  p_car_id      uuid,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_client_id   uuid default null,
  p_client_name text default null,
  p_note        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_client    text;
  v_block     text;
  v_conflicts text;
  v_id        uuid;
begin
  if v_uid is null or not public.poolwagen_can('poolwagens') then
    raise exception 'Geen recht om een poolwagen te reserveren.' using errcode = '42501';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'Kies een geldige periode: de terugkomst ligt na het vertrek.' using errcode = '22023';
  end if;
  if p_end_at <= now() and not public.poolwagen_can('poolwagens_beheren') then
    raise exception 'Een reservatie in het verleden kan alleen een beheerder maken.' using errcode = '42501';
  end if;
  v_client := public.pool_resolve_client(p_client_id, p_client_name);

  -- Eén reservatie tegelijk per wagen: wacht op wie deze wagen nu boekt.
  perform 1 from public.pool_cars where id = p_car_id for update;
  if not found then
    raise exception 'Wagen niet gevonden.' using errcode = 'P0002';
  end if;

  v_block := public.pool_car_block_reason(p_car_id);
  if v_block is not null then
    raise exception '% en kan niet gereserveerd worden.', v_block using errcode = '23514';
  end if;

  v_conflicts := public.pool_conflicts(p_car_id, p_start_at, p_end_at, null);
  if v_conflicts is not null then
    raise exception 'Deze wagen is dan al gereserveerd: %', v_conflicts using errcode = '23P01';
  end if;

  insert into public.pool_car_reservations (
    car_id, user_id, person_name, client_id, client_name, start_at, end_at, note, created_by, created_by_name
  ) values (
    p_car_id, v_uid, public.pool_user_name(v_uid), p_client_id, v_client, p_start_at, p_end_at,
    nullif(btrim(coalesce(p_note, '')), ''), v_uid, public.pool_user_name(v_uid)
  ) returning id into v_id;

  return v_id;
end $$;

create function public.pool_depart_now(
  p_car_id      uuid,
  p_end_at      timestamptz,
  p_client_id   uuid default null,
  p_client_name text default null,
  p_note        text default null,
  p_km          int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.pool_create_reservation(p_car_id, now(), p_end_at, p_client_id, p_client_name, p_note);
  perform public.pool_register_departure(v_id, now(), p_km);
  return v_id;
end $$;

revoke all on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text) from public, anon;
revoke all on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int) from public, anon;
grant execute on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text) to authenticated;
grant execute on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int) to authenticated;

commit;
