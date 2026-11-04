-- Materiaalplanner (/materiaal): van "units" naar items en kits.
--
-- Elk fysiek voorwerp is een eigen item (body, lens, batterij, kabel, …) met
-- een eigen status en geschiedenis. Een kit is een groep items die je zelf
-- samenstelt; een item zit in hooguit één kit tegelijk, en elke verhuis blijft
-- bewaard. Boeken gebeurt per item: wie een kit boekt, boekt de items die er
-- op dat moment in zitten (een momentopname), met "via kit" erbij.
--
-- Niet-additief, met akkoord: er zijn nog geen echte boekingen (alleen twee
-- geannuleerde). Alleen gear_* verandert; equipment* en alle andere tabellen
-- blijven onaangeroerd. De gegevensomzetting zelf zit in 0075.
--
--   gear_units           → gear_items (zelfde id's); quantity weg;
--                          home_client_id → responsible_client_id; nieuw:
--                          model, number, serial_number, responsible_user_id,
--                          responsible_name
--   gear_booking_units   → gear_booking_items; unit_id → item_id; nieuw:
--                          via_kit_id, via_kit_name
--   gear_status_log      unit_id → item_id
--   gear_kits            nieuw
--   gear_kit_members     nieuw (lidmaatschap met geschiedenis)
--   functies             boeken, wijzigen, status opnieuw geschreven;
--                        verplaatsen, kit opheffen, volgorde nieuw
--
-- gear_unit_contents blijft hier nog staan: 0075 zet hem om en ruimt hem op.

-- ── 1. Items ────────────────────────────────────────────────────────────────

alter table public.gear_units rename to gear_items;
alter index public.gear_units_pkey            rename to gear_items_pkey;
alter index public.gear_units_name_key        rename to gear_items_name_key;
alter index public.gear_units_category_idx    rename to gear_items_category_idx;
alter index public.gear_units_home_client_idx rename to gear_items_responsible_client_idx;

alter table public.gear_items drop column quantity;
alter table public.gear_items rename column home_client_id to responsible_client_id;

alter table public.gear_items
  add column model               text,
  add column number              text,
  add column serial_number       text,
  -- Verantwoordelijke: een klant óf een collega (account). De naam van de
  -- collega als kopie, zodat hij leesbaar blijft als het account verdwijnt.
  add column responsible_user_id uuid references auth.users(id) on delete set null,
  add column responsible_name    text,
  add constraint gear_items_one_responsible
    check (num_nonnulls(responsible_client_id, responsible_user_id) <= 1);

create index if not exists gear_items_model_idx on public.gear_items (lower(model)) where model is not null;

-- ── 2. Kits ─────────────────────────────────────────────────────────────────

create table if not exists public.gear_kits (
  id                    uuid primary key default gen_random_uuid(),
  category_id           uuid not null references public.gear_categories(id) on delete restrict,
  name                  text not null check (length(btrim(name)) > 0),
  label_color           text,
  warning               text,
  notes                 text,
  responsible_client_id uuid references public.clients(id) on delete set null,
  responsible_user_id   uuid references auth.users(id) on delete set null,
  responsible_name      text,
  sort_order            int  not null default 0,
  created_at            timestamptz not null default now(),
  -- Opgeheven kits blijven bestaan voor de geschiedenis.
  dissolved_at          timestamptz,
  dissolved_by          uuid references auth.users(id) on delete set null,
  dissolved_by_name     text,
  constraint gear_kits_one_responsible
    check (num_nonnulls(responsible_client_id, responsible_user_id) <= 1)
);
create unique index if not exists gear_kits_name_key
  on public.gear_kits (lower(btrim(name))) where dissolved_at is null;
create index if not exists gear_kits_category_idx on public.gear_kits (category_id, sort_order);

create table if not exists public.gear_kit_members (
  id              uuid primary key default gen_random_uuid(),
  kit_id          uuid not null references public.gear_kits(id) on delete restrict,
  item_id         uuid not null references public.gear_items(id) on delete cascade,
  sort_order      int  not null default 0,
  added_at        timestamptz not null default now(),
  added_by        uuid references auth.users(id) on delete set null,
  added_by_name   text not null,
  removed_at      timestamptz,
  removed_by      uuid references auth.users(id) on delete set null,
  removed_by_name text,
  constraint gear_kit_members_period check (removed_at is null or removed_at >= added_at)
);
-- Een item zit in hooguit één kit tegelijk.
create unique index if not exists gear_kit_members_one_kit
  on public.gear_kit_members (item_id) where removed_at is null;
create index if not exists gear_kit_members_kit_idx
  on public.gear_kit_members (kit_id, sort_order) where removed_at is null;

-- ── 3. Boekingsregels per item ──────────────────────────────────────────────

alter table public.gear_booking_units rename to gear_booking_items;
alter table public.gear_booking_items rename column unit_id to item_id;
alter index public.gear_booking_units_pkey rename to gear_booking_items_pkey;
alter table public.gear_booking_items rename constraint gear_booking_units_no_overlap to gear_booking_items_no_overlap;

alter table public.gear_booking_items
  add column via_kit_id   uuid references public.gear_kits(id) on delete set null,
  add column via_kit_name text;
create index if not exists gear_booking_items_via_kit_idx
  on public.gear_booking_items (via_kit_id) where via_kit_id is not null;

-- ── 4. Statuslogboek ────────────────────────────────────────────────────────

alter table public.gear_status_log rename column unit_id to item_id;
alter index public.gear_status_log_unit_idx rename to gear_status_log_item_idx;

-- ── 5. Oude functies en triggers weg ────────────────────────────────────────

drop trigger if exists gear_booking_units_defaults on public.gear_booking_items;
drop trigger if exists gear_bookings_sync_units on public.gear_bookings;
drop function if exists public.gear_booking_unit_defaults();
drop function if exists public.gear_booking_sync_units();
drop function if exists public.gear_set_unit_status(uuid, text, text);
drop function if exists public.gear_create_booking(date, date, uuid[], uuid, uuid, text, uuid, uuid, text);
drop function if exists public.gear_update_booking(uuid, date, date, uuid[], uuid, uuid, text, uuid, uuid, text);
drop function if exists public.gear_conflicts(uuid[], date, date, uuid);
drop function if exists public.gear_check_unit_list(uuid[]);

-- ── 6. Statuslogboek-trigger (item_id) ──────────────────────────────────────
-- Zelfde als in 0071, nu op items. gear.skip_log = 'on' slaat het logboek
-- over; alleen voor gegevensmigraties (0075), die zelf de geschiedenis
-- meeverhuizen.

create or replace function public.gear_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(current_setting('gear.status_note', true), '');
begin
  if current_setting('gear.skip_log', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'ok' then return new; end if;
  elsif new.status is not distinct from old.status
    and new.status_note is not distinct from old.status_note then
    return new;
  end if;

  insert into public.gear_status_log
    (item_id, old_status, new_status, note, changed_by, changed_by_name)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    coalesce(v_note, new.status_note),
    auth.uid(),
    public.gear_actor_name()
  );
  return new;
end $$;

revoke all on function public.gear_log_status() from public, anon, authenticated;
-- De trigger zelf (gear_units_status_log) verhuisde mee met de tabel.

-- ── 7. Naam van de verantwoordelijke (collega) bijhouden ────────────────────

create or replace function public.gear_fill_responsible_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsible_user_id is not null then
    if tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id then
      select coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), email)
        into new.responsible_name
        from auth.users where id = new.responsible_user_id;
      if new.responsible_name is null then
        raise exception 'Onbekende collega als verantwoordelijke.' using errcode = '23503';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and old.responsible_user_id is not null then
    -- Account verwijderd (de foreign key zette het id op null): de naam
    -- blijft staan. Zelf leeggemaakt terwijl het account bestaat: weg.
    if exists (select 1 from auth.users where id = old.responsible_user_id) then
      new.responsible_name := null;
    end if;
  elsif new.responsible_client_id is not null then
    new.responsible_name := null;
  end if;
  return new;
end $$;

revoke all on function public.gear_fill_responsible_name() from public, anon, authenticated;

drop trigger if exists gear_items_responsible_name on public.gear_items;
create trigger gear_items_responsible_name
  before insert or update of responsible_user_id, responsible_client_id on public.gear_items
  for each row execute function public.gear_fill_responsible_name();

drop trigger if exists gear_kits_responsible_name on public.gear_kits;
create trigger gear_kits_responsible_name
  before insert or update of responsible_user_id, responsible_client_id on public.gear_kits
  for each row execute function public.gear_fill_responsible_name();

-- ── 8. Boekingsregels: standaardwaarden en datum-sync ───────────────────────

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
  select start_date, end_date, cancelled_at into b
    from public.gear_bookings where id = new.booking_id;
  new.period    := daterange(b.start_date, b.end_date, '[]');
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

revoke all on function public.gear_booking_item_defaults() from public, anon, authenticated;

create trigger gear_booking_items_defaults
  before insert on public.gear_booking_items
  for each row execute function public.gear_booking_item_defaults();

create or replace function public.gear_booking_sync_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gear_booking_items
     set period    = daterange(new.start_date, new.end_date, '[]'),
         cancelled = new.cancelled_at is not null
   where booking_id = new.id;
  return new;
end $$;

revoke all on function public.gear_booking_sync_items() from public, anon, authenticated;

create trigger gear_bookings_sync_items
  after update of start_date, end_date, cancelled_at on public.gear_bookings
  for each row execute function public.gear_booking_sync_items();

-- ── 9. Hulpfuncties ─────────────────────────────────────────────────────────

-- Al geboekt op die dagen? Leesbare lijst, of null.
create or replace function public.gear_conflicts(
  p_item_ids uuid[], p_start date, p_end date, p_ignore_booking uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(
           i.name || ' (' || to_char(lower(bi.period), 'DD/MM') || '–'
           || to_char(upper(bi.period) - 1, 'DD/MM') || ', '
           || coalesce(b.person_name, c.name, 'onbekend') || ')',
           ', ' order by i.name, lower(bi.period))
    from public.gear_booking_items bi
    join public.gear_items i    on i.id = bi.item_id
    join public.gear_bookings b on b.id = bi.booking_id
    left join public.clients c  on c.id = b.client_id
   where bi.item_id = any(p_item_ids)
     and not bi.cancelled
     and bi.period && daterange(p_start, p_end, '[]')
     and bi.booking_id is distinct from p_ignore_booking
$$;

revoke all on function public.gear_conflicts(uuid[], date, date, uuid) from public, anon, authenticated;

-- Wat er geboekt wordt: losse items, plus de items die nu in de gekozen kits
-- zitten, min de onderdelen die je expliciet weglaat ("zonder …").
create or replace function public.gear_expand_lines(
  p_item_ids uuid[], p_kit_ids uuid[], p_excluded_item_ids uuid[]
)
returns table (item_id uuid, via_kit_id uuid, via_kit_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items    uuid[] := coalesce(p_item_ids, '{}');
  v_kits     uuid[] := coalesce(p_kit_ids, '{}');
  v_excluded uuid[] := coalesce(p_excluded_item_ids, '{}');
  v_bad      text;
begin
  if (select count(distinct x) from unnest(v_items) x) <> cardinality(v_items)
     or (select count(distinct x) from unnest(v_kits) x) <> cardinality(v_kits) then
    raise exception 'Hetzelfde materiaal of dezelfde kit staat twee keer in de lijst.' using errcode = '22023';
  end if;
  if (select count(*) from public.gear_items where id = any(v_items)) <> cardinality(v_items) then
    raise exception 'Onbekend materiaal in de lijst.' using errcode = '23503';
  end if;
  select string_agg(coalesce(k.name, x::text), ', ') into v_bad
    from unnest(v_kits) x left join public.gear_kits k on k.id = x
   where k.id is null or k.dissolved_at is not null;
  if v_bad is not null then
    raise exception 'Deze kit bestaat niet (meer): %', v_bad using errcode = '23503';
  end if;
  select string_agg(coalesce(i.name, x::text), ', ') into v_bad
    from unnest(v_excluded) x left join public.gear_items i on i.id = x
   where not exists (select 1 from public.gear_kit_members m
                      where m.item_id = x and m.removed_at is null and m.kit_id = any(v_kits));
  if v_bad is not null then
    raise exception 'Weggelaten onderdeel zit niet in een gekozen kit: %', v_bad using errcode = '22023';
  end if;
  select string_agg(i.name, ', ') into v_bad
    from public.gear_kit_members m join public.gear_items i on i.id = m.item_id
   where m.removed_at is null and m.kit_id = any(v_kits) and m.item_id = any(v_items);
  if v_bad is not null then
    raise exception 'Staat los én via een kit in de lijst: %', v_bad using errcode = '22023';
  end if;

  return query
    select x, null::uuid, null::text from unnest(v_items) x
    union all
    select m.item_id, k.id, k.name
      from public.gear_kit_members m
      join public.gear_kits k on k.id = m.kit_id
     where m.removed_at is null and m.kit_id = any(v_kits) and not (m.item_id = any(v_excluded));
end $$;

revoke all on function public.gear_expand_lines(uuid[], uuid[], uuid[]) from public, anon, authenticated;

-- ── 10. Boeken, wijzigen ────────────────────────────────────────────────────
-- Alles of niets: lukt één regel niet (botsing, defect), dan niets.

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
  if p_start_date < (now() at time zone 'Europe/Brussels')::date
     and not public.gear_can('reservering_verwijderen') then
    raise exception 'Boeken in het verleden kan alleen een beheerder.' using errcode = '42501';
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
  p_note              text default null
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

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Kies een geldige periode: het einde ligt niet vóór het begin.' using errcode = '22023';
  end if;
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

  v_conflicts := public.gear_conflicts(v_items, p_start_date, p_end_date, p_booking_id);
  if v_conflicts is not null then
    raise exception 'Al geboekt: %', v_conflicts using errcode = '23P01';
  end if;

  -- Eerst weghalen wat niet meer meegaat, dan de periode, dan wat erbij komt.
  delete from public.gear_booking_items
   where booking_id = p_booking_id and not (item_id = any(v_items));

  update public.gear_bookings
     set start_date         = p_start_date,
         end_date           = p_end_date,
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

revoke all on function public.gear_create_booking(date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.gear_update_booking(uuid, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text) from public, anon;
grant execute on function public.gear_create_booking(date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.gear_update_booking(uuid, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text) to authenticated;

-- ── 11. Status melden of herstellen (per item) ──────────────────────────────

create or replace function public.gear_set_item_status(p_item_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.gear_can('materiaal_reserveren') then
    raise exception 'Geen recht om de status van materiaal te wijzigen.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('ok', 'beperkt', 'defect', 'uit_dienst') then
    raise exception 'Onbekende status: %', p_status using errcode = '22023';
  end if;
  if p_status in ('ok', 'uit_dienst') and not public.gear_can('materiaal_toevoegen') then
    raise exception 'Alleen wie het materiaal beheert, kan het herstellen of uit dienst nemen.' using errcode = '42501';
  end if;

  perform set_config('gear.status_note', coalesce(btrim(p_note), ''), true);
  update public.gear_items
     set status      = p_status,
         status_note = case when p_status = 'ok' then null else nullif(btrim(p_note), '') end
   where id = p_item_id;
  if not found then
    perform set_config('gear.status_note', '', true);
    raise exception 'Materiaal niet gevonden.' using errcode = 'P0002';
  end if;
  perform set_config('gear.status_note', '', true);
end $$;

revoke all on function public.gear_set_item_status(uuid, text, text) from public, anon;
grant execute on function public.gear_set_item_status(uuid, text, text) to authenticated;

-- ── 12. Kits samenstellen ───────────────────────────────────────────────────
-- Lidmaatschap wijzigt alleen via deze functies, zodat de geschiedenis klopt.
-- Alleen voor wie de catalogus beheert.

-- Een item in een kit zetten, naar een andere kit verplaatsen, of los maken
-- (p_to_kit_id = null). Met p_update_bookings ook de boekingen die nog moeten
-- beginnen: uit de boekingen "via" de oude kit, in die "via" de nieuwe kit.
-- De verhuis gaat altijd door; wat bij een boeking niet lukt, staat in
-- 'failed' met de reden. Lopende boekingen blijven ongemoeid.
create or replace function public.gear_move_item(
  p_item_id uuid, p_to_kit_id uuid, p_update_bookings boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from     uuid;
  v_to_name  text;
  v_today    date := (now() at time zone 'Europe/Brussels')::date;
  v_updated  jsonb := '[]'::jsonb;
  v_failed   jsonb := '[]'::jsonb;
  r          record;
begin
  if not public.gear_can('materiaal_toevoegen') then
    raise exception 'Alleen wie het materiaal beheert, kan kits samenstellen.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.gear_items where id = p_item_id) then
    raise exception 'Materiaal niet gevonden.' using errcode = 'P0002';
  end if;
  if p_to_kit_id is not null then
    select name into v_to_name from public.gear_kits where id = p_to_kit_id and dissolved_at is null;
    if v_to_name is null then
      raise exception 'Deze kit bestaat niet (meer).' using errcode = 'P0002';
    end if;
  end if;

  select kit_id into v_from from public.gear_kit_members where item_id = p_item_id and removed_at is null;
  if v_from is not distinct from p_to_kit_id then
    return jsonb_build_object('updated', v_updated, 'failed', v_failed);
  end if;

  if v_from is not null then
    update public.gear_kit_members
       set removed_at = now(), removed_by = auth.uid(), removed_by_name = public.gear_actor_name()
     where item_id = p_item_id and removed_at is null;
  end if;
  if p_to_kit_id is not null then
    insert into public.gear_kit_members (kit_id, item_id, sort_order, added_by, added_by_name)
    values (p_to_kit_id, p_item_id,
            coalesce((select max(sort_order) from public.gear_kit_members
                       where kit_id = p_to_kit_id and removed_at is null), 0) + 1,
            auth.uid(), public.gear_actor_name());
  end if;

  if not coalesce(p_update_bookings, false) then
    return jsonb_build_object('updated', v_updated, 'failed', v_failed);
  end if;

  -- Uit de komende boekingen van de oude kit.
  if v_from is not null then
    for r in
      select b.id, b.start_date, b.end_date
        from public.gear_booking_items bi join public.gear_bookings b on b.id = bi.booking_id
       where bi.item_id = p_item_id and bi.via_kit_id = v_from
         and b.cancelled_at is null and b.start_date > v_today
    loop
      if (select count(*) from public.gear_booking_items where booking_id = r.id) = 1 then
        v_failed := v_failed || jsonb_build_object('booking_id', r.id, 'start_date', r.start_date, 'end_date', r.end_date,
          'action', 'weghalen', 'reason', 'Het is het enige stuk in die boeking; annuleer de boeking als hij niet meer nodig is.');
      else
        delete from public.gear_booking_items where booking_id = r.id and item_id = p_item_id;
        v_updated := v_updated || jsonb_build_object('booking_id', r.id, 'start_date', r.start_date, 'end_date', r.end_date, 'action', 'weggehaald');
      end if;
    end loop;
  end if;

  -- In de komende boekingen van de nieuwe kit, als het item die dagen vrij is.
  if p_to_kit_id is not null then
    for r in
      select distinct b.id, b.start_date, b.end_date
        from public.gear_booking_items bi join public.gear_bookings b on b.id = bi.booking_id
       where bi.via_kit_id = p_to_kit_id
         and b.cancelled_at is null and b.start_date > v_today
         and not exists (select 1 from public.gear_booking_items x where x.booking_id = b.id and x.item_id = p_item_id)
    loop
      begin
        insert into public.gear_booking_items (booking_id, item_id, via_kit_id, via_kit_name)
        values (r.id, p_item_id, p_to_kit_id, v_to_name);
        v_updated := v_updated || jsonb_build_object('booking_id', r.id, 'start_date', r.start_date, 'end_date', r.end_date, 'action', 'toegevoegd');
      exception
        when exclusion_violation then
          v_failed := v_failed || jsonb_build_object('booking_id', r.id, 'start_date', r.start_date, 'end_date', r.end_date,
            'action', 'toevoegen', 'reason', 'Al geboekt: ' || coalesce(public.gear_conflicts(array[p_item_id], r.start_date, r.end_date, r.id), 'op die dagen'));
        when check_violation then
          v_failed := v_failed || jsonb_build_object('booking_id', r.id, 'start_date', r.start_date, 'end_date', r.end_date,
            'action', 'toevoegen', 'reason', sqlerrm);
      end;
    end loop;
  end if;

  return jsonb_build_object('updated', v_updated, 'failed', v_failed);
end $$;

-- Een kit opheffen: alle onderdelen worden los, de kit blijft bewaard.
-- Komende boekingen "via" deze kit behouden hun items (momentopname).
create or replace function public.gear_dissolve_kit(p_kit_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not public.gear_can('materiaal_toevoegen') then
    raise exception 'Alleen wie het materiaal beheert, kan kits opheffen.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.gear_kits where id = p_kit_id and dissolved_at is null) then
    raise exception 'Deze kit bestaat niet (meer).' using errcode = 'P0002';
  end if;
  update public.gear_kit_members
     set removed_at = now(), removed_by = auth.uid(), removed_by_name = public.gear_actor_name()
   where kit_id = p_kit_id and removed_at is null;
  get diagnostics n = row_count;
  update public.gear_kits
     set dissolved_at = now(), dissolved_by = auth.uid(), dissolved_by_name = public.gear_actor_name()
   where id = p_kit_id;
  return n;
end $$;

-- Volgorde van de onderdelen in een kit (na slepen).
create or replace function public.gear_reorder_kit(p_kit_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.gear_can('materiaal_toevoegen') then
    raise exception 'Alleen wie het materiaal beheert, kan kits samenstellen.' using errcode = '42501';
  end if;
  update public.gear_kit_members m
     set sort_order = x.pos
    from unnest(p_item_ids) with ordinality as x(item_id, pos)
   where m.kit_id = p_kit_id and m.removed_at is null and m.item_id = x.item_id;
end $$;

revoke all on function public.gear_move_item(uuid, uuid, boolean) from public, anon;
revoke all on function public.gear_dissolve_kit(uuid) from public, anon;
revoke all on function public.gear_reorder_kit(uuid, uuid[]) from public, anon;
grant execute on function public.gear_move_item(uuid, uuid, boolean) to authenticated;
grant execute on function public.gear_dissolve_kit(uuid) to authenticated;
grant execute on function public.gear_reorder_kit(uuid, uuid[]) to authenticated;

-- ── 13. RLS voor de nieuwe tabellen ─────────────────────────────────────────
-- Items en boekingsregels houden hun policies (ze verhuisden mee).

alter table public.gear_kits        enable row level security;
alter table public.gear_kit_members enable row level security;

drop policy if exists "Materiaal bekijken" on public.gear_kits;
drop policy if exists "Materiaal beheren"  on public.gear_kits;
create policy "Materiaal bekijken" on public.gear_kits
  for select to authenticated using (public.gear_can('materiaal'));
create policy "Materiaal beheren" on public.gear_kits
  for all to authenticated
  using (public.gear_can('materiaal_toevoegen'))
  with check (public.gear_can('materiaal_toevoegen'));

-- Lidmaatschap: alleen lezen; wijzigen via gear_move_item / gear_dissolve_kit.
drop policy if exists "Materiaal bekijken" on public.gear_kit_members;
create policy "Materiaal bekijken" on public.gear_kit_members
  for select to authenticated using (public.gear_can('materiaal'));
