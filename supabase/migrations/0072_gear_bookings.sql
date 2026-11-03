-- Materiaalplanner (/materiaal), stap 3 van de database: boekingen.
--
-- Alleen toevoegen. Bouwt op 0070 (btree_gist) en 0071 (catalogus).
--
--   gear_bookings       één boeking: periode (hele dagen, begin en einde
--                       inbegrepen), voor wie, optioneel klant en project
--   gear_booking_units  welke units in die boeking zitten, met een kopie van
--                       de periode: daar weigert de database overlap
--
-- Voor wie: minstens een persoon of een klant, hooguit één soort persoon
-- (collega-account, freelancer of externe naam). Dezelfde regel als
-- src/lib/gear/holder.ts.
--
-- Schrijven gebeurt alleen via de drie functies onderaan (maken, wijzigen,
-- annuleren). Ze controleren de rechten van de module Materiaal:
--   materiaal_reserveren     boeken, en eigen boekingen wijzigen of annuleren
--   reservering_verwijderen  (niveau Beheren) boekingen van iedereen, ook
--                            in het verleden
-- Geannuleerde boekingen blijven bewaard voor de geschiedenis en houden
-- niets bezet.

-- ── Tabellen ────────────────────────────────────────────────────────────────

create table if not exists public.gear_bookings (
  id                 uuid primary key default gen_random_uuid(),
  start_date         date not null,
  end_date           date not null,

  booked_for_user_id uuid references auth.users(id) on delete set null,
  freelancer_id      uuid references public.freelancers(id) on delete set null,
  external_name      text check (external_name is null or length(btrim(external_name)) > 0),
  -- Kopie van de naam van de persoon. Accounts verlopen en worden door de
  -- nachtelijke cron verwijderd; dan blijft de boeking leesbaar, en blijft
  -- ze voldoen aan "minstens een persoon of een klant".
  person_name        text,

  client_id          uuid references public.clients(id) on delete set null,
  project_id         uuid references public.projects(id) on delete set null,
  note               text,

  created_by         uuid references auth.users(id) on delete set null,
  created_by_name    text not null,
  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  cancelled_by       uuid references auth.users(id) on delete set null,
  cancelled_by_name  text,

  constraint gear_bookings_dates check (end_date >= start_date),
  constraint gear_bookings_has_holder check (
    num_nonnulls(booked_for_user_id, freelancer_id, external_name, client_id, person_name) >= 1
  ),
  constraint gear_bookings_one_person check (
    num_nonnulls(booked_for_user_id, freelancer_id, external_name) <= 1
  )
);
create index if not exists gear_bookings_dates_idx on public.gear_bookings (start_date, end_date);

create table if not exists public.gear_booking_units (
  booking_id uuid not null references public.gear_bookings(id) on delete cascade,
  unit_id    uuid not null references public.gear_units(id) on delete restrict,
  -- Kopieën van de boeking, bijgehouden door de triggers hieronder.
  period     daterange not null,
  cancelled  boolean not null default false,
  primary key (booking_id, unit_id),
  constraint gear_booking_units_no_overlap
    exclude using gist (unit_id with =, period with &&) where (not cancelled)
);

-- ── Periode en annulatie gelijk houden met de boeking ───────────────────────

create or replace function public.gear_booking_unit_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  u record;
begin
  select start_date, end_date, cancelled_at into b
    from public.gear_bookings where id = new.booking_id;
  new.period    := daterange(b.start_date, b.end_date, '[]');
  new.cancelled := b.cancelled_at is not null;

  -- Defect of uit dienst kan niet geboekt worden. Alleen bij toevoegen: wat
  -- al geboekt was en daarna defect raakt, blijft staan en wordt getoond.
  select name, status into u from public.gear_units where id = new.unit_id;
  if u.status in ('defect', 'uit_dienst') then
    raise exception '% is % en kan niet geboekt worden.', u.name,
      case u.status when 'defect' then 'defect' else 'uit dienst' end
      using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function public.gear_booking_unit_defaults() from public, anon, authenticated;

drop trigger if exists gear_booking_units_defaults on public.gear_booking_units;
create trigger gear_booking_units_defaults
  before insert on public.gear_booking_units
  for each row execute function public.gear_booking_unit_defaults();

create or replace function public.gear_booking_sync_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gear_booking_units
     set period    = daterange(new.start_date, new.end_date, '[]'),
         cancelled = new.cancelled_at is not null
   where booking_id = new.id;
  return new;
end $$;

revoke all on function public.gear_booking_sync_units() from public, anon, authenticated;

drop trigger if exists gear_bookings_sync_units on public.gear_bookings;
create trigger gear_bookings_sync_units
  after update of start_date, end_date, cancelled_at on public.gear_bookings
  for each row execute function public.gear_booking_sync_units();

-- ── Hulpfuncties (alleen voor de functies hieronder) ────────────────────────

-- Wie ingelogd is, als naam voor created_by_name / cancelled_by_name.
create or replace function public.gear_actor_name()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), auth.jwt() ->> 'email', 'Systeem')
$$;

-- Controleert "voor wie" en geeft de naam van de persoon terug (of null bij
-- een boeking voor alleen een klant).
create or replace function public.gear_resolve_holder(
  p_user_id uuid, p_freelancer_id uuid, p_external_name text, p_client_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_external text := nullif(btrim(coalesce(p_external_name, '')), '');
  v_persons  int  := num_nonnulls(p_user_id, p_freelancer_id, v_external);
  v_name     text;
  v_is_fl    boolean;
begin
  if v_persons > 1 then
    raise exception 'Kies één persoon: een collega, een freelancer of een externe naam.' using errcode = '23514';
  end if;
  if v_persons = 0 and p_client_id is null then
    raise exception 'Kies voor wie het is: een persoon, een klant of allebei.' using errcode = '23514';
  end if;

  if p_user_id is not null then
    select coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), email),
           coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)
      into v_name, v_is_fl
      from auth.users where id = p_user_id;
    if v_name is null then
      raise exception 'Onbekende collega.' using errcode = '23503';
    end if;
    -- Een freelancer-account hoort in het freelancerveld, niet als collega.
    if v_is_fl then
      raise exception 'Dit account is een freelancer; kies het bij freelancers.' using errcode = '22023';
    end if;
    return v_name;
  end if;

  if p_freelancer_id is not null then
    select name into v_name from public.freelancers where id = p_freelancer_id;
    if v_name is null then
      raise exception 'Onbekende freelancer.' using errcode = '23503';
    end if;
    return v_name;
  end if;

  return v_external;
end $$;

revoke all on function public.gear_resolve_holder(uuid, uuid, text, uuid) from public, anon, authenticated;

-- Al geboekt op die dagen? Geeft een leesbare lijst ("FX3 A (03/11–05/11,
-- Bram)"), of null. De exclusion constraint vangt daarnaast ook twee
-- gelijktijdige klikken op.
create or replace function public.gear_conflicts(
  p_unit_ids uuid[], p_start date, p_end date, p_ignore_booking uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(
           u.name || ' (' || to_char(lower(bu.period), 'DD/MM') || '–'
           || to_char(upper(bu.period) - 1, 'DD/MM') || ', '
           || coalesce(b.person_name, c.name, 'onbekend') || ')',
           ', ' order by u.name, lower(bu.period))
    from public.gear_booking_units bu
    join public.gear_units u    on u.id = bu.unit_id
    join public.gear_bookings b on b.id = bu.booking_id
    left join public.clients c  on c.id = b.client_id
   where bu.unit_id = any(p_unit_ids)
     and not bu.cancelled
     and bu.period && daterange(p_start, p_end, '[]')
     and bu.booking_id is distinct from p_ignore_booking
$$;

revoke all on function public.gear_conflicts(uuid[], date, date, uuid) from public, anon, authenticated;

-- Mag de ingelogde gebruiker deze boeking wijzigen of annuleren?
create or replace function public.gear_check_booking_access(b public.gear_bookings)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_manager boolean := public.gear_can('reservering_verwijderen');
begin
  if b.id is null then
    raise exception 'Boeking niet gevonden.' using errcode = 'P0002';
  end if;
  if b.cancelled_at is not null then
    raise exception 'Deze boeking is al geannuleerd.' using errcode = '22023';
  end if;
  if not v_manager then
    if not public.gear_can('materiaal_reserveren')
       or (b.created_by is distinct from auth.uid() and b.booked_for_user_id is distinct from auth.uid()) then
      raise exception 'Je kan alleen je eigen boekingen wijzigen of annuleren.' using errcode = '42501';
    end if;
    if b.end_date < (now() at time zone 'Europe/Brussels')::date then
      raise exception 'Een afgelopen boeking kan alleen een beheerder nog wijzigen.' using errcode = '42501';
    end if;
  end if;
end $$;

revoke all on function public.gear_check_booking_access(public.gear_bookings) from public, anon, authenticated;

-- Units die geboekt worden: bestaan ze, en zijn ze niet dubbel opgegeven?
create or replace function public.gear_check_unit_list(p_unit_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_unit_ids is null or cardinality(p_unit_ids) = 0 then
    raise exception 'Kies minstens één stuk materiaal.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_unit_ids) x) <> cardinality(p_unit_ids) then
    raise exception 'Hetzelfde materiaal staat twee keer in de lijst.' using errcode = '22023';
  end if;
  if (select count(*) from public.gear_units where id = any(p_unit_ids)) <> cardinality(p_unit_ids) then
    raise exception 'Onbekend materiaal in de lijst.' using errcode = '23503';
  end if;
end $$;

revoke all on function public.gear_check_unit_list(uuid[]) from public, anon, authenticated;

-- ── Boeken ──────────────────────────────────────────────────────────────────

create or replace function public.gear_create_booking(
  p_start_date    date,
  p_end_date      date,
  p_unit_ids      uuid[],
  p_user_id       uuid default null,
  p_freelancer_id uuid default null,
  p_external_name text default null,
  p_client_id     uuid default null,
  p_project_id    uuid default null,
  p_note          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
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
  perform public.gear_check_unit_list(p_unit_ids);
  v_person := public.gear_resolve_holder(p_user_id, p_freelancer_id, p_external_name, p_client_id);

  v_conflicts := public.gear_conflicts(p_unit_ids, p_start_date, p_end_date, null);
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

  insert into public.gear_booking_units (booking_id, unit_id)
  select v_id, unnest(p_unit_ids);

  return v_id;
end $$;

-- ── Wijzigen ────────────────────────────────────────────────────────────────
-- Vervangt periode, units, voor wie, klant, project en notitie in één keer.
-- Lukt één ding niet (bv. een botsing), dan verandert er niets.

create or replace function public.gear_update_booking(
  p_booking_id    uuid,
  p_start_date    date,
  p_end_date      date,
  p_unit_ids      uuid[],
  p_user_id       uuid default null,
  p_freelancer_id uuid default null,
  p_external_name text default null,
  p_client_id     uuid default null,
  p_project_id    uuid default null,
  p_note          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b           public.gear_bookings;
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
  perform public.gear_check_unit_list(p_unit_ids);
  v_person := public.gear_resolve_holder(p_user_id, p_freelancer_id, p_external_name, p_client_id);

  v_conflicts := public.gear_conflicts(p_unit_ids, p_start_date, p_end_date, p_booking_id);
  if v_conflicts is not null then
    raise exception 'Al geboekt: %', v_conflicts using errcode = '23P01';
  end if;

  -- Eerst weghalen wat niet meer meegaat, dan de periode, dan wat erbij komt:
  -- zo botst een unit die net verwijderd wordt niet met de nieuwe periode.
  delete from public.gear_booking_units
   where booking_id = p_booking_id and not (unit_id = any(p_unit_ids));

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

  insert into public.gear_booking_units (booking_id, unit_id)
  select p_booking_id, x from unnest(p_unit_ids) x
   where not exists (select 1 from public.gear_booking_units
                      where booking_id = p_booking_id and unit_id = x);
end $$;

-- ── Annuleren ───────────────────────────────────────────────────────────────

create or replace function public.gear_cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.gear_bookings;
begin
  select * into b from public.gear_bookings where id = p_booking_id for update;
  perform public.gear_check_booking_access(b);

  update public.gear_bookings
     set cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancelled_by_name = public.gear_actor_name()
   where id = p_booking_id;
end $$;

revoke all on function public.gear_create_booking(date, date, uuid[], uuid, uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.gear_update_booking(uuid, date, date, uuid[], uuid, uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.gear_cancel_booking(uuid) from public, anon;
grant execute on function public.gear_create_booking(date, date, uuid[], uuid, uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.gear_update_booking(uuid, date, date, uuid[], uuid, uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.gear_cancel_booking(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Lezen zoals de catalogus. Geen schrijf-policies: alles gaat via de
-- functies hierboven, die zelf de rechten controleren.

alter table public.gear_bookings      enable row level security;
alter table public.gear_booking_units enable row level security;

drop policy if exists "Materiaal bekijken" on public.gear_bookings;
create policy "Materiaal bekijken" on public.gear_bookings
  for select to authenticated using (public.gear_can('materiaal'));

drop policy if exists "Materiaal bekijken" on public.gear_booking_units;
create policy "Materiaal bekijken" on public.gear_booking_units
  for select to authenticated using (public.gear_can('materiaal'));
