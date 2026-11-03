-- Poolwagens (/poolwagens), stap 1 van de database: rechten en wagens.
--
-- Maakt uitsluitend nieuwe objecten aan; raakt niets bestaands aan. Bestaande
-- functies (user_has_section) worden alleen aangeroepen. Alles in één
-- transactie: bestaat een naam toch al, dan faalt het geheel en blijft er
-- niets half staan (bewust "create" zonder "if not exists" of "or replace").
--
-- Objecten:
--   function public.poolwagen_can(text)
--   table    public.pool_cars
--   index    public.pool_cars_license_plate_key
--   index    public.pool_cars_active_idx
--   policy   poolwagens_bekijken   on public.pool_cars (select)
--   policy   poolwagens_toevoegen  on public.pool_cars (insert)
--   policy   poolwagens_wijzigen   on public.pool_cars (update)
--
-- Rechten, met de sleutels van de module Poolwagens (src/lib/access-roles.ts):
--   poolwagens          bekijken, reserveren, ritten registreren, schade melden
--   poolwagens_beheren  wagens beheren, schadestatus, blokkades, reservaties
--                       van anderen
-- Deny-by-default (user_has_section, niet user_has_open_section): een account
-- zonder ingestelde rechten krijgt niets. Wie 'beheer' heeft, mag alles.
-- Freelancer-accounts krijgen nooit iets.
--
-- Verwijderen kan niet (geen delete-policy): een wagen wordt gearchiveerd,
-- zodat zijn historiek blijft.

begin;

-- ── Rechten ─────────────────────────────────────────────────────────────────

create function public.poolwagen_can(section text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not coalesce((auth.jwt() -> 'app_metadata' ->> 'freelancer')::boolean, false)
     and public.user_has_section(section)
$$;

-- ── Wagens ──────────────────────────────────────────────────────────────────

create table public.pool_cars (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) > 0),
  license_plate     text not null check (length(btrim(license_plate)) > 0),
  make_model        text,
  current_km        int  not null default 0 check (current_km >= 0),
  -- Handmatig "niet beschikbaar" (los van blokkades door schade, die in 0078
  -- uit de schademeldingen zelf volgen).
  manual_block      boolean not null default false,
  manual_block_note text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- Eén wagen per nummerplaat, ongeacht streepjes, spaties of hoofdletters
-- ("1-ABC-234" = "1abc234").
create unique index pool_cars_license_plate_key
  on public.pool_cars (upper(regexp_replace(license_plate, '[^A-Za-z0-9]', '', 'g')));

create index pool_cars_active_idx
  on public.pool_cars (name) where archived_at is null;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.pool_cars enable row level security;

create policy poolwagens_bekijken on public.pool_cars
  for select to authenticated using (public.poolwagen_can('poolwagens'));

create policy poolwagens_toevoegen on public.pool_cars
  for insert to authenticated with check (public.poolwagen_can('poolwagens_beheren'));

create policy poolwagens_wijzigen on public.pool_cars
  for update to authenticated
  using (public.poolwagen_can('poolwagens_beheren'))
  with check (public.poolwagen_can('poolwagens_beheren'));

commit;
