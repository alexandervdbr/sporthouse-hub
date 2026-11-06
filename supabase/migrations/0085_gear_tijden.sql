-- Materiaalplanner: ophaal- en terugbrengtijden die echt meetellen.
--
-- Een boeking krijgt een optioneel uur bij ophalen en terugbrengen (per
-- kwartier, 06:00–23:45). Leeg = de hele dag: ophalen vanaf 00:00,
-- terugbrengen tot het einde van de dag.
--
-- De bezetting per boekingsregel wordt een tsrange '[)' in Brusselse
-- kloktijd (timestamp zonder tijdzone): nergens omgerekend naar UTC, dus
-- niets kan een uur verschuiven rond de zomer-/wintertijd. Het venster
-- 06:00–23:45 houdt het nachtuur dat op wisseldagen niet bestaat of dubbel
-- is, erbuiten; 00:00 bestaat op elke dag. Half-open: terugbrengen om 10:00
-- en ophalen om 10:00 op dezelfde dag botst niet.
--
-- Additief: start_date/end_date en de kolom period blijven (met dezelfde
-- betekenis); er komen twee tijden en een kolom slot bij. Bestaande boekingen
-- worden hele dagen — er gaat niets verloren. De exclusion constraint kijkt
-- voortaan naar slot. gear_create_booking en gear_update_booking krijgen
-- p_start_time en p_end_time; al de rest blijft (achteraf boeken uit 0083,
-- onderdelen alleen via hun kit uit 0081, botsingen, defect, rechten).

-- ── 1. Tijden op de boeking ─────────────────────────────────────────────────

-- Per kwartier, tussen 06:00 en 23:45.
create or replace function public.gear_valid_time(t time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select t is null or (t between time '06:00' and time '23:45'
                       and extract(minute from t)::int % 15 = 0
                       and extract(second from t) = 0)
$$;

-- Het einde van een bezetting: het terugbrenguur, of zonder uur middernacht
-- na de laatste dag. Een aparte functie: in een PL/pgSQL-IF zou het eerste
-- THEN van een CASE de voorwaarde afsluiten.
create or replace function public.gear_slot_end(p_end date, p_end_time time)
returns timestamp
language sql
immutable
set search_path = ''
as $$
  select case when p_end_time is null then (p_end + 1) + time '00:00' else p_end + p_end_time end
$$;

-- De bezetting in Brusselse kloktijd: [ophalen, terugbrengen).
create or replace function public.gear_slot(p_start date, p_start_time time, p_end date, p_end_time time)
returns tsrange
language sql
immutable
set search_path = ''
as $$
  select tsrange(p_start + coalesce(p_start_time, time '00:00'), public.gear_slot_end(p_end, p_end_time), '[)')
$$;

alter table public.gear_bookings
  add column if not exists start_time time,
  add column if not exists end_time   time;

alter table public.gear_bookings drop constraint if exists gear_bookings_times;
alter table public.gear_bookings add constraint gear_bookings_times check (
  public.gear_valid_time(start_time) and public.gear_valid_time(end_time)
  and start_date + coalesce(start_time, time '00:00') < public.gear_slot_end(end_date, end_time)
);

-- ── 2. Bezetting per regel ──────────────────────────────────────────────────

alter table public.gear_booking_items add column if not exists slot tsrange;

update public.gear_booking_items bi
   set slot = public.gear_slot(b.start_date, b.start_time, b.end_date, b.end_time)
  from public.gear_bookings b
 where b.id = bi.booking_id;

alter table public.gear_booking_items alter column slot set not null;

alter table public.gear_booking_items drop constraint if exists gear_booking_items_no_overlap;
alter table public.gear_booking_items add constraint gear_booking_items_no_overlap
  exclude using gist (item_id with =, slot with &&) where (not cancelled);

-- Nieuwe regels: periode, bezetting en geannuleerd van de boeking.
create or replace function public.gear_booking_item_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  i record;
begin
  select start_date, end_date, start_time, end_time, cancelled_at into b
    from public.gear_bookings where id = new.booking_id;
  new.period    := daterange(b.start_date, b.end_date, '[]');
  new.slot      := public.gear_slot(b.start_date, b.start_time, b.end_date, b.end_time);
  new.cancelled := b.cancelled_at is not null;

  -- Defect of uit dienst kan niet geboekt worden (alleen bij toevoegen; wat
  -- al geboekt was en daarna defect raakt, blijft staan en wordt getoond).
  select name, status into i from public.gear_items where id = new.item_id;
  if i.status in ('defect', 'uit_dienst') then
    raise exception '% is % en kan niet geboekt worden.', i.name,
      case i.status when 'defect' then 'defect' else 'uit dienst' end
      using errcode = '23514';
  end if;
  return new;
end $$;

-- Andere dagen of uren op de boeking: de regels volgen.
create or replace function public.gear_booking_sync_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gear_booking_items
     set period    = daterange(new.start_date, new.end_date, '[]'),
         slot      = public.gear_slot(new.start_date, new.start_time, new.end_date, new.end_time),
         cancelled = new.cancelled_at is not null
   where booking_id = new.id;
  return new;
end $$;

drop trigger if exists gear_bookings_sync_items on public.gear_bookings;
create trigger gear_bookings_sync_items
  after update of start_date, end_date, start_time, end_time, cancelled_at on public.gear_bookings
  for each row execute function public.gear_booking_sync_items();

-- ── 3. Botsingen per uur ────────────────────────────────────────────────────

-- "05/11–07/11" voor hele dagen, "05/11 14:00–07/11 10:00" met uren.
create or replace function public.gear_slot_label(s tsrange)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(lower(s), 'DD/MM') || case when lower(s)::time <> time '00:00' then ' ' || to_char(lower(s), 'HH24:MI') else '' end
      || '–'
      || case when upper(s)::time = time '00:00' then to_char(upper(s) - interval '1 day', 'DD/MM')
              else to_char(upper(s), 'DD/MM HH24:MI') end
$$;

create or replace function public.gear_conflicts(
  p_item_ids uuid[], p_slot tsrange, p_ignore_booking uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(
           i.name || ' (' || public.gear_slot_label(bi.slot) || ', '
           || coalesce(b.person_name, c.name, 'onbekend') || ')',
           ', ' order by i.name, lower(bi.slot))
    from public.gear_booking_items bi
    join public.gear_items i    on i.id = bi.item_id
    join public.gear_bookings b on b.id = bi.booking_id
    left join public.clients c  on c.id = b.client_id
   where bi.item_id = any(p_item_ids)
     and not bi.cancelled
     and bi.slot && p_slot
     and bi.booking_id is distinct from p_ignore_booking
$$;

-- De oude vorm (hele dagen) blijft voor gear_move_item.
create or replace function public.gear_conflicts(
  p_item_ids uuid[], p_start date, p_end date, p_ignore_booking uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.gear_conflicts(p_item_ids, public.gear_slot(p_start, null, p_end, null), p_ignore_booking)
$$;

revoke all on function public.gear_conflicts(uuid[], tsrange, uuid) from public, anon, authenticated;
revoke all on function public.gear_conflicts(uuid[], date, date, uuid) from public, anon, authenticated;

-- Periode en uren controleren, met een leesbare melding.
create or replace function public.gear_check_period(p_start date, p_start_time time, p_end date, p_end_time time)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Kies een geldige periode: het einde ligt niet vóór het begin.' using errcode = '22023';
  end if;
  if not public.gear_valid_time(p_start_time) or not public.gear_valid_time(p_end_time) then
    raise exception 'Kies een uur per kwartier tussen 06:00 en 23:45.' using errcode = '22023';
  end if;
  if p_start + coalesce(p_start_time, time '00:00') >= public.gear_slot_end(p_end, p_end_time) then
    raise exception 'Het terugbrengen moet na het ophalen liggen.' using errcode = '22023';
  end if;
end $$;

-- ── 4. Boeken en wijzigen, met uren ─────────────────────────────────────────

drop function if exists public.gear_create_booking(date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text);
drop function if exists public.gear_update_booking(uuid, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text);

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
  p_note              text default null,
  p_start_time        time default null,
  p_end_time          time default null
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
  perform public.gear_check_period(p_start_date, p_start_time, p_end_date, p_end_time);

  select array_agg(l.item_id) into v_items
    from public.gear_expand_lines(p_item_ids, p_kit_ids, p_excluded_item_ids) l;
  if v_items is null then
    raise exception 'Kies minstens één stuk materiaal.' using errcode = '22023';
  end if;
  v_person := public.gear_resolve_holder(p_user_id, p_freelancer_id, p_external_name, p_client_id);

  v_conflicts := public.gear_conflicts(v_items, public.gear_slot(p_start_date, p_start_time, p_end_date, p_end_time), null);
  if v_conflicts is not null then
    raise exception 'Al geboekt: %', v_conflicts using errcode = '23P01';
  end if;

  insert into public.gear_bookings (
    start_date, end_date, start_time, end_time, booked_for_user_id, freelancer_id, external_name, person_name,
    client_id, project_id, note, created_by, created_by_name
  ) values (
    p_start_date, p_end_date, p_start_time, p_end_time, p_user_id, p_freelancer_id,
    nullif(btrim(coalesce(p_external_name, '')), ''), v_person,
    p_client_id, p_project_id, nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid(), public.gear_actor_name()
  ) returning id into v_id;

  insert into public.gear_booking_items (booking_id, item_id, via_kit_id, via_kit_name)
  select v_id, l.item_id, l.via_kit_id, l.via_kit_name
    from public.gear_expand_lines(p_item_ids, p_kit_ids, p_excluded_item_ids) l;

  return v_id;
end $$;

create or replace function public.gear_update_booking(
  p_booking_id        uuid,
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
  p_note              text default null,
  p_start_time        time default null,
  p_end_time          time default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b           public.gear_bookings;
  v_items     uuid[];
  v_person    text;
  v_conflicts text;
begin
  select * into b from public.gear_bookings where id = p_booking_id for update;
  perform public.gear_check_booking_access(b);

  perform public.gear_check_period(p_start_date, p_start_time, p_end_date, p_end_time);
  if p_start_date < (now() at time zone 'Europe/Brussels')::date
     and p_start_date <> b.start_date
     and not public.gear_can('reservering_verwijderen') then
    raise exception 'Een boeking naar het verleden verplaatsen kan alleen een beheerder.' using errcode = '42501';
  end if;

  select array_agg(l.item_id) into v_items
    from public.gear_expand_lines(p_item_ids, p_kit_ids, p_excluded_item_ids) l;
  if v_items is null then
    raise exception 'Kies minstens één stuk materiaal.' using errcode = '22023';
  end if;
  v_person := public.gear_resolve_holder(p_user_id, p_freelancer_id, p_external_name, p_client_id);

  v_conflicts := public.gear_conflicts(v_items, public.gear_slot(p_start_date, p_start_time, p_end_date, p_end_time), p_booking_id);
  if v_conflicts is not null then
    raise exception 'Al geboekt: %', v_conflicts using errcode = '23P01';
  end if;

  -- Eerst weghalen wat niet meer meegaat, dan de periode, dan wat erbij komt.
  delete from public.gear_booking_items
   where booking_id = p_booking_id and not (item_id = any(v_items));

  update public.gear_bookings
     set start_date         = p_start_date,
         end_date           = p_end_date,
         start_time         = p_start_time,
         end_time           = p_end_time,
         booked_for_user_id = p_user_id,
         freelancer_id      = p_freelancer_id,
         external_name      = nullif(btrim(coalesce(p_external_name, '')), ''),
         person_name        = v_person,
         client_id          = p_client_id,
         project_id         = p_project_id,
         note               = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_booking_id;

  update public.gear_booking_items bi
     set via_kit_id = l.via_kit_id, via_kit_name = l.via_kit_name
    from public.gear_expand_lines(p_item_ids, p_kit_ids, p_excluded_item_ids) l
   where bi.booking_id = p_booking_id and bi.item_id = l.item_id;

  insert into public.gear_booking_items (booking_id, item_id, via_kit_id, via_kit_name)
  select p_booking_id, l.item_id, l.via_kit_id, l.via_kit_name
    from public.gear_expand_lines(p_item_ids, p_kit_ids, p_excluded_item_ids) l
   where not exists (select 1 from public.gear_booking_items
                      where booking_id = p_booking_id and item_id = l.item_id);
end $$;

revoke all on function public.gear_create_booking(date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text, time, time) from public, anon;
revoke all on function public.gear_update_booking(uuid, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text, time, time) from public, anon;
grant execute on function public.gear_create_booking(date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text, time, time) to authenticated;
grant execute on function public.gear_update_booking(uuid, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text, time, time) to authenticated;
