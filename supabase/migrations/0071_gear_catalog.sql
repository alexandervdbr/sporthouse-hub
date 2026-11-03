-- Materiaalplanner (/materiaal), stap 2 van de database: de catalogus.
--
-- Nieuwe tabellen naast de oude planner (equipment*), die blijft draaien en
-- niet aangeraakt wordt. Alleen toevoegen.
--
--   gear_categories     kolomgroepen (SET 1 VIDEO, FOTO, …)
--   gear_units          wat geboekt wordt: een los stuk, een kit (= heeft
--                       inhoud) of een bundel (quantity > 1, "5x Blackmagic")
--   gear_unit_contents  de inhoud van een kit als checklist; batterijen,
--                       kaarten en kabels worden nooit los geboekt
--   gear_status_log     elke statuswijziging, nooit bewerkt of gewist
--
-- Rechten volgen het patroon van pré-assist (0032): user_has_open_section()
-- met de sleutels van de module Materiaal (src/lib/access-roles.ts):
--   materiaal             bekijken
--   materiaal_reserveren  boeken, defect of beperkt melden
--   materiaal_toevoegen   beheren: catalogus, herstellen, uit dienst nemen
-- Eén afwijking: freelancer-accounts (app_metadata.freelancer) hebben geen
-- permissions-object en zouden met de "open"-regel overal bij mogen. Hier
-- krijgen ze niets.

-- ── Rechten ─────────────────────────────────────────────────────────────────

create or replace function public.gear_can(section text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not coalesce((auth.jwt() -> 'app_metadata' ->> 'freelancer')::boolean, false)
     and public.user_has_open_section(section)
$$;

-- ── Tabellen ────────────────────────────────────────────────────────────────

create table if not exists public.gear_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  color      text not null default '#3A913F',
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists gear_categories_name_key
  on public.gear_categories (lower(btrim(name)));

create table if not exists public.gear_units (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid not null references public.gear_categories(id) on delete restrict,
  name                text not null check (length(btrim(name)) > 0),
  quantity            int  not null default 1 check (quantity >= 1),
  sort_order          int  not null default 0,
  -- Wat in de spreadsheet in de kolomkop verstopt zat.
  label_color         text,
  nd_size             text,
  warning             text,
  notes               text,
  status              text not null default 'ok'
                      check (status in ('ok', 'beperkt', 'defect', 'uit_dienst')),
  status_note         text,
  -- Vaste houder (Friends of Sports, Sporting Hasselt): niet geboekt, wel
  -- getoond, en te boeken "in samenspraak met".
  home_client_id      uuid references public.clients(id) on delete set null,
  -- Herkomst uit de oude planner; geen foreign key, zodat die tabel later
  -- los van deze opgeruimd kan worden.
  legacy_equipment_id uuid unique,
  created_at          timestamptz not null default now()
);
create unique index if not exists gear_units_name_key
  on public.gear_units (lower(btrim(name)));
create index if not exists gear_units_category_idx
  on public.gear_units (category_id, sort_order);
create index if not exists gear_units_home_client_idx
  on public.gear_units (home_client_id) where home_client_id is not null;

create table if not exists public.gear_unit_contents (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.gear_units(id) on delete cascade,
  label      text not null check (length(btrim(label)) > 0),
  quantity   int  not null default 1 check (quantity >= 1),
  note       text,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists gear_unit_contents_unit_idx
  on public.gear_unit_contents (unit_id, sort_order);

create table if not exists public.gear_status_log (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.gear_units(id) on delete cascade,
  old_status      text,
  new_status      text not null check (new_status in ('ok', 'beperkt', 'defect', 'uit_dienst')),
  note            text,
  -- Het account, en de naam als kopie: accounts verlopen en worden dan door
  -- de nachtelijke cron verwijderd, de geschiedenis moet leesbaar blijven.
  changed_by      uuid references auth.users(id) on delete set null,
  changed_by_name text not null,
  changed_at      timestamptz not null default now()
);
create index if not exists gear_status_log_unit_idx
  on public.gear_status_log (unit_id, changed_at desc);

-- ── Statuslogboek ───────────────────────────────────────────────────────────
-- Elke statuswijziging komt in het logboek, langs welke weg ook (functie
-- hieronder, Beheer, of een migratie). Een nieuwe unit die niet 'ok' is,
-- ook. security definer: het logboek heeft geen schrijfrechten voor gebruikers.

create or replace function public.gear_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(current_setting('gear.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    if new.status = 'ok' then return new; end if;
  elsif new.status is not distinct from old.status
    and new.status_note is not distinct from old.status_note then
    return new;
  end if;

  insert into public.gear_status_log
    (unit_id, old_status, new_status, note, changed_by, changed_by_name)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    coalesce(v_note, new.status_note),
    auth.uid(),
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), auth.jwt() ->> 'email', 'Systeem')
  );
  return new;
end $$;

revoke all on function public.gear_log_status() from public, anon, authenticated;

drop trigger if exists gear_units_status_log on public.gear_units;
create trigger gear_units_status_log
  after insert or update of status, status_note on public.gear_units
  for each row execute function public.gear_log_status();

-- ── Status melden of herstellen ─────────────────────────────────────────────
-- Wie mag reserveren, mag defect of beperkt melden. Herstellen (ok) of uit
-- dienst nemen is voor wie het materiaal beheert. De notitie gaat mee naar
-- het logboek, ook bij herstel (dan wordt status_note zelf leeggemaakt).

create or replace function public.gear_set_unit_status(p_unit_id uuid, p_status text, p_note text default null)
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

  update public.gear_units
     set status      = p_status,
         status_note = case when p_status = 'ok' then null else nullif(btrim(p_note), '') end
   where id = p_unit_id;

  if not found then
    perform set_config('gear.status_note', '', true);
    raise exception 'Materiaal niet gevonden.' using errcode = 'P0002';
  end if;

  perform set_config('gear.status_note', '', true);
end $$;

revoke all on function public.gear_set_unit_status(uuid, text, text) from public, anon;
grant execute on function public.gear_set_unit_status(uuid, text, text) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.gear_categories    enable row level security;
alter table public.gear_units         enable row level security;
alter table public.gear_unit_contents enable row level security;
alter table public.gear_status_log    enable row level security;

drop policy if exists "Materiaal bekijken"  on public.gear_categories;
drop policy if exists "Materiaal beheren"   on public.gear_categories;
create policy "Materiaal bekijken" on public.gear_categories
  for select to authenticated using (public.gear_can('materiaal'));
create policy "Materiaal beheren" on public.gear_categories
  for all to authenticated
  using (public.gear_can('materiaal_toevoegen'))
  with check (public.gear_can('materiaal_toevoegen'));

drop policy if exists "Materiaal bekijken"  on public.gear_units;
drop policy if exists "Materiaal beheren"   on public.gear_units;
create policy "Materiaal bekijken" on public.gear_units
  for select to authenticated using (public.gear_can('materiaal'));
create policy "Materiaal beheren" on public.gear_units
  for all to authenticated
  using (public.gear_can('materiaal_toevoegen'))
  with check (public.gear_can('materiaal_toevoegen'));

drop policy if exists "Materiaal bekijken"  on public.gear_unit_contents;
drop policy if exists "Materiaal beheren"   on public.gear_unit_contents;
create policy "Materiaal bekijken" on public.gear_unit_contents
  for select to authenticated using (public.gear_can('materiaal'));
create policy "Materiaal beheren" on public.gear_unit_contents
  for all to authenticated
  using (public.gear_can('materiaal_toevoegen'))
  with check (public.gear_can('materiaal_toevoegen'));

-- Logboek: alleen lezen. Schrijven gebeurt uitsluitend via de trigger.
drop policy if exists "Materiaal bekijken" on public.gear_status_log;
create policy "Materiaal bekijken" on public.gear_status_log
  for select to authenticated using (public.gear_can('materiaal'));
