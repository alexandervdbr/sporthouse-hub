-- Poolwagens (/poolwagens), stap 2 van de database: reservaties, ritten en de
-- basis van de schademeldingen (de tabel en wat blokkeert).
--
-- Maakt uitsluitend nieuwe objecten aan; raakt niets bestaands aan. Bestaande
-- functies (poolwagen_can uit 0076, user_has_section) worden alleen
-- aangeroepen. Vereist de extensie btree_gist (0070, al geïnstalleerd voor de
-- materiaalplanner). Alles in één transactie, met gewone "create".
--
-- Verwijzingen naar bestaande tabellen (projects, auth.users) zijn gewone
-- foreign keys op de nieuwe tabellen, zoals gear_bookings ze ook heeft.
--
-- Objecten:
--   table    public.pool_car_reservations
--              constraint pool_car_reservations_no_overlap (exclusion)
--   index    public.pool_car_reservations_car_idx
--   index    public.pool_car_reservations_user_idx
--   index    public.pool_car_reservations_project_idx
--   index    public.pool_car_reservations_one_open_trip (uniek)
--   table    public.pool_car_damage_reports
--   index    public.pool_car_damage_reports_car_idx
--   index    public.pool_car_damage_reports_blocking_idx
--   function public.pool_user_name(uuid)
--   function public.pool_car_block_reason(uuid)
--   function public.pool_conflicts(uuid, timestamptz, timestamptz, uuid)
--   function public.pool_check_reservation_access(public.pool_car_reservations)
--   function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text)
--   function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text)
--   function public.pool_cancel_reservation(uuid)
--   function public.pool_register_departure(uuid, timestamptz, int)
--   function public.pool_register_arrival(uuid, timestamptz, int)
--   function public.pool_depart_now(uuid, timestamptz, uuid, text, int)
--   function public.pool_claim_late_notifications()
--   policy   poolwagens_bekijken on public.pool_car_reservations (select)
--   policy   poolwagens_bekijken on public.pool_car_damage_reports (select)
--
-- Een rit is een reservatie die vertrokken is: departed_at + departure_km bij
-- vertrek, arrived_at + arrival_km bij aankomst. Schrijven gebeurt alleen via
-- de functies hieronder (security definer); er zijn geen schrijf-policies.
-- Rechten (src/lib/access-roles.ts, module Poolwagens):
--   poolwagens          reserveren; eigen reservatie wijzigen of annuleren
--                       zolang de rit niet gestart is; eigen vertrek/aankomst
--   poolwagens_beheren  reservaties en ritten van iedereen

begin;

-- ── Reservaties en ritten ───────────────────────────────────────────────────

create table public.pool_car_reservations (
  id                 uuid primary key default gen_random_uuid(),
  car_id             uuid not null references public.pool_cars(id) on delete restrict,
  user_id            uuid references auth.users(id) on delete set null,
  -- Kopie van de naam: accounts verlopen en worden door de nachtelijke cron
  -- verwijderd; de historiek moet leesbaar blijven.
  person_name        text not null,
  project_id         uuid references public.projects(id) on delete set null,
  start_at           timestamptz not null,
  end_at             timestamptz not null,
  note               text,

  departed_at        timestamptz,
  departure_km       int check (departure_km >= 0),
  arrived_at         timestamptz,
  arrival_km         int,
  driven_km          int generated always as (arrival_km - departure_km) stored,

  -- Wanneer de gebruiker van deze reservatie een push kreeg omdat de vorige
  -- rit op deze wagen te laat is (één keer per reservatie).
  late_notified_at   timestamptz,

  created_by         uuid references auth.users(id) on delete set null,
  created_by_name    text not null,
  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  cancelled_by       uuid references auth.users(id) on delete set null,
  cancelled_by_name  text,

  constraint pool_car_reservations_period check (end_at > start_at),
  constraint pool_car_reservations_departure_pair check ((departed_at is null) = (departure_km is null)),
  constraint pool_car_reservations_arrival_pair check ((arrived_at is null) = (arrival_km is null)),
  constraint pool_car_reservations_arrival_after_departure check (
    arrived_at is null
    or (departed_at is not null and arrived_at >= departed_at and arrival_km >= departure_km)
  ),
  constraint pool_car_reservations_started_not_cancelled check (cancelled_at is null or departed_at is null),
  -- Geen twee reservaties tegelijk op dezelfde wagen. Halfopen: wie om 12:00
  -- terug is, laat de volgende om 12:00 vertrekken.
  constraint pool_car_reservations_no_overlap
    exclude using gist (car_id with =, tstzrange(start_at, end_at, '[)') with &&)
    where (cancelled_at is null)
);

create index pool_car_reservations_car_idx     on public.pool_car_reservations (car_id, start_at);
create index pool_car_reservations_user_idx    on public.pool_car_reservations (user_id, start_at desc);
create index pool_car_reservations_project_idx on public.pool_car_reservations (project_id) where project_id is not null;
-- Een wagen kan maar één rit tegelijk onderweg zijn.
create unique index pool_car_reservations_one_open_trip
  on public.pool_car_reservations (car_id)
  where departed_at is not null and arrived_at is null and cancelled_at is null;

-- ── Schademeldingen (de functies om te melden en te behandelen zitten in 0078)

create table public.pool_car_damage_reports (
  id                     uuid primary key default gen_random_uuid(),
  car_id                 uuid not null references public.pool_cars(id) on delete restrict,
  reservation_id         uuid references public.pool_car_reservations(id) on delete set null,
  description            text not null check (length(btrim(description)) > 0),
  severity               text not null check (severity in ('licht', 'ernstig')),
  status                 text not null default 'gemeld' check (status in ('gemeld', 'in_behandeling', 'hersteld')),
  reported_by            uuid references auth.users(id) on delete set null,
  reported_by_name       text not null,
  created_at             timestamptz not null default now(),
  status_changed_at      timestamptz,
  status_changed_by_name text,
  -- Een beheerder kan de blokkade van een ernstige melding opheffen zonder
  -- dat de schade hersteld is (bv. rijden mag, herstel volgt later).
  block_lifted_at        timestamptz,
  block_lifted_by_name   text,
  -- Of de mail naar de verantwoordelijke vertrokken is. null = nog niet
  -- geprobeerd. Een mislukte mail blokkeert de melding nooit.
  mail_status            text check (mail_status in ('verstuurd', 'mislukt', 'niet_geconfigureerd', 'geen_ontvangers')),
  mail_error             text,
  mail_attempted_at      timestamptz
);

create index pool_car_damage_reports_car_idx on public.pool_car_damage_reports (car_id, created_at desc);
create index pool_car_damage_reports_blocking_idx
  on public.pool_car_damage_reports (car_id)
  where severity = 'ernstig' and status <> 'hersteld' and block_lifted_at is null;

-- ── Hulpfuncties (alleen voor de functies hieronder) ────────────────────────

-- Naam van een account, zoals de materiaalplanner hem toont.
create function public.pool_user_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), email) from auth.users where id = p_user_id),
    'Onbekend')
$$;

-- Waarom deze wagen niet gereserveerd kan worden, of null. Dezelfde regel als
-- carBlockReason() in src/lib/poolwagens/blocking.ts.
create function public.pool_car_block_reason(p_car_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select name, manual_block, manual_block_note, archived_at into c
    from public.pool_cars where id = p_car_id;
  if not found then
    return 'Deze wagen bestaat niet';
  end if;
  if c.archived_at is not null then
    return c.name || ' is gearchiveerd';
  end if;
  if c.manual_block then
    return c.name || ' is niet beschikbaar'
      || coalesce(' (' || nullif(btrim(c.manual_block_note), '') || ')', '');
  end if;
  if exists (select 1 from public.pool_car_damage_reports
              where car_id = p_car_id and severity = 'ernstig'
                and status <> 'hersteld' and block_lifted_at is null) then
    return c.name || ' is geblokkeerd door ernstige schade';
  end if;
  return null;
end $$;

-- Welke reservaties botsen met deze periode? Een leesbare lijst
-- ("04/11 09:00–04/11 17:00, Bram"), of null.
create function public.pool_conflicts(
  p_car_id uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(
           to_char(r.start_at at time zone 'Europe/Brussels', 'DD/MM HH24:MI') || '–'
           || to_char(r.end_at at time zone 'Europe/Brussels', 'DD/MM HH24:MI') || ', '
           || r.person_name,
           '; ' order by r.start_at)
    from public.pool_car_reservations r
   where r.car_id = p_car_id
     and r.cancelled_at is null
     and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(p_start, p_end, '[)')
     and r.id is distinct from p_ignore
$$;

-- Mag de ingelogde gebruiker iets doen met deze reservatie? Eigen reservatie
-- (voor of door jou gemaakt), of beheer. Wat er daarna nog mag (gestart of
-- niet), beslist elke functie zelf.
create function public.pool_check_reservation_access(r public.pool_car_reservations)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if r.id is null then
    raise exception 'Reservatie niet gevonden.' using errcode = 'P0002';
  end if;
  if not public.poolwagen_can('poolwagens') then
    raise exception 'Je hebt geen toegang tot de poolwagens.' using errcode = '42501';
  end if;
  if r.cancelled_at is not null then
    raise exception 'Deze reservatie is geannuleerd.' using errcode = '22023';
  end if;
  if not public.poolwagen_can('poolwagens_beheren')
     and r.user_id is distinct from auth.uid()
     and r.created_by is distinct from auth.uid() then
    raise exception 'Je kan alleen je eigen reservaties wijzigen.' using errcode = '42501';
  end if;
end $$;

revoke all on function public.pool_user_name(uuid) from public, anon, authenticated;
revoke all on function public.pool_car_block_reason(uuid) from public, anon, authenticated;
revoke all on function public.pool_conflicts(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.pool_check_reservation_access(public.pool_car_reservations) from public, anon, authenticated;

-- ── Reserveren ──────────────────────────────────────────────────────────────

create function public.pool_create_reservation(
  p_car_id     uuid,
  p_start_at   timestamptz,
  p_end_at     timestamptz,
  p_project_id uuid,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
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
  if p_project_id is null then
    raise exception 'Kies een project.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Onbekend project.' using errcode = '23503';
  end if;

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
    car_id, user_id, person_name, project_id, start_at, end_at, note, created_by, created_by_name
  ) values (
    p_car_id, v_uid, public.pool_user_name(v_uid), p_project_id, p_start_at, p_end_at,
    nullif(btrim(coalesce(p_note, '')), ''), v_uid, public.pool_user_name(v_uid)
  ) returning id into v_id;

  return v_id;
end $$;

-- ── Wijzigen ────────────────────────────────────────────────────────────────
-- Eigen reservatie zolang de rit niet gestart is; beheer altijd (behalve een
-- andere wagen kiezen voor een rit die al onderweg is). Een geblokkeerde
-- wagen: verkorten mag, verlengen of verplaatsen naar die wagen niet.

create function public.pool_update_reservation(
  p_id         uuid,
  p_car_id     uuid,
  p_start_at   timestamptz,
  p_end_at     timestamptz,
  p_project_id uuid,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r           public.pool_car_reservations;
  v_manager   boolean := public.poolwagen_can('poolwagens_beheren');
  v_block     text;
  v_conflicts text;
begin
  select * into r from public.pool_car_reservations where id = p_id for update;
  perform public.pool_check_reservation_access(r);

  if r.departed_at is not null and not v_manager then
    raise exception 'De rit is al gestart; wijzigen kan dan alleen een beheerder.' using errcode = '42501';
  end if;
  if r.departed_at is not null and p_car_id is distinct from r.car_id then
    raise exception 'Een rit die al gestart is, kan niet naar een andere wagen.' using errcode = '22023';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'Kies een geldige periode: de terugkomst ligt na het vertrek.' using errcode = '22023';
  end if;
  if p_end_at <= now() and not v_manager then
    raise exception 'Een reservatie in het verleden kan alleen een beheerder aanpassen.' using errcode = '42501';
  end if;
  if p_project_id is null then
    raise exception 'Kies een project.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Onbekend project.' using errcode = '23503';
  end if;

  perform 1 from public.pool_cars where id = p_car_id for update;
  if not found then
    raise exception 'Wagen niet gevonden.' using errcode = 'P0002';
  end if;

  if r.departed_at is null
     and (p_car_id <> r.car_id or p_start_at < r.start_at or p_end_at > r.end_at) then
    v_block := public.pool_car_block_reason(p_car_id);
    if v_block is not null then
      raise exception '% en kan niet gereserveerd worden.', v_block using errcode = '23514';
    end if;
  end if;

  v_conflicts := public.pool_conflicts(p_car_id, p_start_at, p_end_at, p_id);
  if v_conflicts is not null then
    raise exception 'Deze wagen is dan al gereserveerd: %', v_conflicts using errcode = '23P01';
  end if;

  update public.pool_car_reservations
     set car_id     = p_car_id,
         start_at   = p_start_at,
         end_at     = p_end_at,
         project_id = p_project_id,
         note       = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
end $$;

-- ── Annuleren ───────────────────────────────────────────────────────────────
-- Blijft bewaard voor de geschiedenis en houdt niets meer bezet. Een rit die
-- al gestart is, wordt niet geannuleerd maar afgesloten met de aankomst.

create function public.pool_cancel_reservation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.pool_car_reservations;
begin
  select * into r from public.pool_car_reservations where id = p_id for update;
  perform public.pool_check_reservation_access(r);

  if r.departed_at is not null then
    raise exception 'De rit is al gestart en kan niet meer geannuleerd worden; registreer de aankomst.' using errcode = '22023';
  end if;

  update public.pool_car_reservations
     set cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancelled_by_name = public.pool_user_name(auth.uid())
   where id = p_id;
end $$;

-- ── Vertrek ─────────────────────────────────────────────────────────────────
-- Tijdstip standaard nu, kilometerstand standaard de laatst bekende van de
-- wagen. Vroeger vertrekken dan gepland mag, als de wagen dan vrij is (de
-- reservatie schuift mee). Een wagen die nog niet terug is van een vorige rit,
-- kan niet vertrekken.

create function public.pool_register_departure(
  p_id          uuid,
  p_departed_at timestamptz default null,
  p_km          int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r           public.pool_car_reservations;
  v_at        timestamptz := coalesce(p_departed_at, now());
  v_km        int;
  v_open      text;
  v_conflicts text;
begin
  select * into r from public.pool_car_reservations where id = p_id for update;
  perform public.pool_check_reservation_access(r);

  if r.departed_at is not null then
    raise exception 'Het vertrek is al geregistreerd.' using errcode = '22023';
  end if;
  if v_at > now() + interval '5 minutes' then
    raise exception 'Het vertrek ligt in de toekomst.' using errcode = '22023';
  end if;
  if v_at >= r.end_at then
    raise exception 'De geplande terugkomst is al voorbij; pas eerst de reservatie aan.' using errcode = '22023';
  end if;

  select current_km into v_km from public.pool_cars where id = r.car_id for update;
  v_km := coalesce(p_km, v_km);
  if v_km is null or v_km < 0 then
    raise exception 'De kilometerstand bij vertrek is een geheel getal vanaf 0.' using errcode = '22023';
  end if;

  select person_name into v_open
    from public.pool_car_reservations
   where car_id = r.car_id and id <> r.id
     and departed_at is not null and arrived_at is null and cancelled_at is null;
  if v_open is not null then
    raise exception 'De wagen is nog niet terug van de vorige rit (%).', v_open using errcode = '23P01';
  end if;

  if v_at < r.start_at then
    v_conflicts := public.pool_conflicts(r.car_id, v_at, r.end_at, r.id);
    if v_conflicts is not null then
      raise exception 'Zo vroeg vertrekken botst met: %', v_conflicts using errcode = '23P01';
    end if;
  end if;

  update public.pool_car_reservations
     set departed_at  = v_at,
         departure_km = v_km,
         start_at     = least(start_at, v_at)
   where id = p_id;
end $$;

-- ── Aankomst ────────────────────────────────────────────────────────────────
-- De stand bij aankomst is minstens die bij vertrek; de wagen krijgt de nieuwe
-- stand (nooit een lagere dan hij al had). Wie vroeger terug is dan gepland,
-- geeft de wagen meteen vrij: de reservatie eindigt dan bij de aankomst.
-- Later terug verandert de geplande terugkomst niet (nooit automatisch
-- verlengen); de werkelijke aankomst staat in arrived_at.

create function public.pool_register_arrival(
  p_id         uuid,
  p_arrived_at timestamptz default null,
  p_km         int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r    public.pool_car_reservations;
  v_at timestamptz := coalesce(p_arrived_at, now());
begin
  select * into r from public.pool_car_reservations where id = p_id for update;
  perform public.pool_check_reservation_access(r);

  if r.departed_at is null then
    raise exception 'De rit is nog niet gestart; registreer eerst het vertrek.' using errcode = '22023';
  end if;
  if r.arrived_at is not null then
    raise exception 'De aankomst is al geregistreerd.' using errcode = '22023';
  end if;
  if p_km is null then
    raise exception 'Vul de kilometerstand bij aankomst in.' using errcode = '22023';
  end if;
  if p_km < r.departure_km then
    raise exception 'De kilometerstand bij aankomst (%) moet minstens die bij vertrek (%) zijn.', p_km, r.departure_km
      using errcode = '22023';
  end if;
  if v_at < r.departed_at then
    raise exception 'De aankomst ligt vóór het vertrek.' using errcode = '22023';
  end if;
  if v_at > now() + interval '5 minutes' then
    raise exception 'De aankomst ligt in de toekomst.' using errcode = '22023';
  end if;

  update public.pool_car_reservations
     set arrived_at = v_at,
         arrival_km = p_km,
         end_at     = case when v_at < end_at then greatest(v_at, start_at + interval '1 minute') else end_at end
   where id = p_id;

  update public.pool_cars
     set current_km = greatest(current_km, p_km)
   where id = r.car_id;
end $$;

-- ── Nu vertrekken ───────────────────────────────────────────────────────────
-- Een reservatie vanaf nu en het vertrek in één handeling, met dezelfde
-- controles als hierboven. Lukt één ding niet, dan gebeurt er niets.

create function public.pool_depart_now(
  p_car_id     uuid,
  p_end_at     timestamptz,
  p_project_id uuid,
  p_note       text default null,
  p_km         int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.pool_create_reservation(p_car_id, now(), p_end_at, p_project_id, p_note);
  perform public.pool_register_departure(v_id, now(), p_km);
  return v_id;
end $$;

-- ── Te laat terug ───────────────────────────────────────────────────────────
-- Reservaties die in het gedrang komen omdat de vorige rit op die wagen nog
-- niet terug is terwijl de geplande terugkomst voorbij is. "In het gedrang":
-- de eerstvolgende reservatie op die wagen, nog niet vertrokken, die start
-- vóór nu + 24 uur. Zelfde regel als src/lib/poolwagens/trips.ts.
--
-- Geeft alleen de reservaties terug waarvoor nog geen push vertrokken is, en
-- zet meteen late_notified_at: twee gelijktijdige aanroepen sturen dus geen
-- dubbele push.

create function public.pool_claim_late_notifications()
returns table (reservation_id uuid, user_id uuid, car_name text, start_at timestamptz, late_person text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- De uitvoerkolommen heten zoals tabelkolommen (user_id, start_at); alle
-- verwijzingen hieronder zijn gekwalificeerd, en bij twijfel wint de kolom.
begin
  if not public.poolwagen_can('poolwagens') then
    raise exception 'Je hebt geen toegang tot de poolwagens.' using errcode = '42501';
  end if;

  return query
  with late as (
    select t.car_id, t.end_at, t.person_name, t.user_id as late_user
      from public.pool_car_reservations t
     where t.departed_at is not null and t.arrived_at is null and t.cancelled_at is null
       and t.end_at < now()
  ),
  nxt as (
    select distinct on (n.car_id) n.id, n.user_id, n.car_id, n.start_at, n.late_notified_at,
           l.person_name, l.late_user
      from public.pool_car_reservations n
      join late l on l.car_id = n.car_id
     where n.cancelled_at is null and n.departed_at is null
       and n.start_at >= l.end_at
       and n.start_at < now() + interval '24 hours'
     order by n.car_id, n.start_at
  ),
  claimed as (
    update public.pool_car_reservations r
       set late_notified_at = now()
      from nxt
     where r.id = nxt.id and nxt.late_notified_at is null
    returning r.id, r.user_id, r.car_id, r.start_at
  )
  select c.id, c.user_id, car.name, c.start_at, nxt.person_name
    from claimed c
    join nxt on nxt.id = c.id
    join public.pool_cars car on car.id = c.car_id
   -- Wie zelf te laat is én de volgende reservatie heeft, krijgt geen push.
   where c.user_id is distinct from nxt.late_user;
end $$;

revoke all on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text) from public, anon;
revoke all on function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text) from public, anon;
revoke all on function public.pool_cancel_reservation(uuid) from public, anon;
revoke all on function public.pool_register_departure(uuid, timestamptz, int) from public, anon;
revoke all on function public.pool_register_arrival(uuid, timestamptz, int) from public, anon;
revoke all on function public.pool_depart_now(uuid, timestamptz, uuid, text, int) from public, anon;
revoke all on function public.pool_claim_late_notifications() from public, anon;
grant execute on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text) to authenticated;
grant execute on function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text) to authenticated;
grant execute on function public.pool_cancel_reservation(uuid) to authenticated;
grant execute on function public.pool_register_departure(uuid, timestamptz, int) to authenticated;
grant execute on function public.pool_register_arrival(uuid, timestamptz, int) to authenticated;
grant execute on function public.pool_depart_now(uuid, timestamptz, uuid, text, int) to authenticated;
grant execute on function public.pool_claim_late_notifications() to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Lezen voor wie de poolwagens gebruikt. Geen schrijf-policies: alles gaat
-- via de functies hierboven, die zelf de rechten controleren.

alter table public.pool_car_reservations   enable row level security;
alter table public.pool_car_damage_reports enable row level security;

create policy poolwagens_bekijken on public.pool_car_reservations
  for select to authenticated using (public.poolwagen_can('poolwagens'));

create policy poolwagens_bekijken on public.pool_car_damage_reports
  for select to authenticated using (public.poolwagen_can('poolwagens'));

commit;
