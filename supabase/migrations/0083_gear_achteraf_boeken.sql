-- Materiaalplanner: boeken in het verleden mag voor iedereen met Reserveren
-- (wie vergat te boeken, kan het achteraf nog ingeven). Tot nu kon dat alleen
-- Beheren.
--
-- Alleen gear_create_booking verandert: de controle op een begindatum in het
-- verleden valt weg. Al de rest blijft: botsingen, defect, onderdelen alleen
-- via hun kit (0081), "voor wie". Een afgelopen boeking wijzigen of annuleren
-- blijft Beheren (gear_check_booking_access, 0072), en een bestaande boeking
-- naar het verleden verplaatsen ook (gear_update_booking, ongewijzigd).
--
-- "Achteraf ingevoerd" heeft geen kolom nodig: dat is een boeking waarvan
-- created_at (in Brussel) na de begindatum valt.

create or replace function public.gear_create_booking(
  p_start_date        date,
  p_end_date          date,
  p_item_ids          uuid[] default '{}',
  p_kit_ids           uuid[] default '{}',
  p_excluded_item_ids uuid[] default '{}',
  p_user_id           uuid default null,
  p_freelancer_id     uuid default null,
  p_external_name     text default null,
  p_client_id         uuid default null,
  p_project_id        uuid default null,
  p_note              text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items     uuid[];
  v_person    text;
  v_conflicts text;
  v_id        uuid;
begin
  if not public.gear_can('materiaal_reserveren') then
    raise exception 'Geen recht om materiaal te boeken.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Kies een geldige periode: het einde ligt niet vóór het begin.' using errcode = '22023';
  end if;

  select array_agg(l.item_id) into v_items
    from public.gear_expand_lines(p_item_ids, p_kit_ids, p_excluded_item_ids) l;
  if v_items is null then
    raise exception 'Kies minstens één stuk materiaal.' using errcode = '22023';
  end if;
  v_person := public.gear_resolve_holder(p_user_id, p_freelancer_id, p_external_name, p_client_id);

  v_conflicts := public.gear_conflicts(v_items, p_start_date, p_end_date, null);
  if v_conflicts is not null then
    raise exception 'Al geboekt: %', v_conflicts using errcode = '23P01';
  end if;

  insert into public.gear_bookings (
    start_date, end_date, booked_for_user_id, freelancer_id, external_name, person_name,
    client_id, project_id, note, created_by, created_by_name
  ) values (
    p_start_date, p_end_date, p_user_id, p_freelancer_id,
    nullif(btrim(coalesce(p_external_name, '')), ''), v_person,
    p_client_id, p_project_id, nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid(), public.gear_actor_name()
  ) returning id into v_id;

  insert into public.gear_booking_items (booking_id, item_id, via_kit_id, via_kit_name)
  select v_id, l.item_id, l.via_kit_id, l.via_kit_name
    from public.gear_expand_lines(p_item_ids, p_kit_ids, p_excluded_item_ids) l;

  return v_id;
end $$;

revoke all on function public.gear_create_booking(date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text) from public, anon;
grant execute on function public.gear_create_booking(date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text) to authenticated;
