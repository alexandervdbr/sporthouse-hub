-- Poolwagens (/poolwagens), stap 6 van de database: een tankkaart en de
-- pincode van die kaart per wagen.
--
-- 1. Het volledige kaartnummer en de pincode staan in een aparte tabel,
--    pool_car_fuel_cards, waar niemand rechtstreeks in kan lezen of
--    schrijven: RLS staat aan zonder één policy, en de rechten op de tabel
--    zijn ingetrokken. Alles loopt via drie functies.
-- 2. pool_cars krijgt fuel_card_last4: de laatste vier tekens van het
--    kaartnummer. Die staan overal naast de nummerplaat en zijn zichtbaar
--    voor iedereen die de wagens ziet.
-- 3. De pincode krijgt alleen wie op dat moment met die wagen onderweg is
--    (een rit op zijn naam, vertrokken en nog niet aangekomen) en beheer.
--
-- Functies:
--   pool_set_fuel_card(car, nummer, pincode, pincode_wissen)  beheer
--       Een leeg nummer wist het nummer. Een lege pincode laat de bestaande
--       staan; pincode_wissen = true wist ze.
--   pool_fuel_cards()                                          beheer
--       Per wagen het volledige nummer en of er een pincode is (niet de
--       pincode zelf).
--   pool_fuel_card_pin(car)                                    rijder of beheer
--
-- Raakt alleen pool_-objecten aan. Alles in één transactie. Bestaande code
-- blijft werken: er verdwijnt niets en er verandert geen signatuur.
--
-- Wijzigt:
--   column   public.pool_cars.fuel_card_last4                 nieuw
--   table    public.pool_car_fuel_cards                       nieuw
--   function public.pool_set_fuel_card(uuid, text, text, boolean)  nieuw
--   function public.pool_fuel_cards()                        nieuw
--   function public.pool_fuel_card_pin(uuid)                 nieuw

begin;

-- ── Laatste vier tekens, naast de nummerplaat ───────────────────────────────

alter table public.pool_cars
  add column fuel_card_last4 text check (fuel_card_last4 ~ '^[0-9A-Z]{1,4}$');

-- ── Kaartnummer en pincode, afgeschermd ─────────────────────────────────────

create table public.pool_car_fuel_cards (
  car_id          uuid primary key references public.pool_cars(id) on delete cascade,
  card_number     text check (card_number is null or length(btrim(card_number)) between 4 and 40),
  pin             text check (pin is null or pin ~ '^[0-9]{4,8}$'),
  updated_at      timestamptz not null default now(),
  updated_by_name text
);

-- Geen policies: rechtstreeks lezen of schrijven kan niemand, ook beheer
-- niet. Alleen de functies hieronder (security definer) komen erbij.
alter table public.pool_car_fuel_cards enable row level security;
revoke all on table public.pool_car_fuel_cards from public, anon, authenticated;

-- ── Instellen (beheer) ──────────────────────────────────────────────────────

create function public.pool_set_fuel_card(
  p_car_id      uuid,
  p_card_number text,
  p_pin         text default null,
  p_clear_pin   boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := nullif(btrim(coalesce(p_card_number, '')), '');
  v_pin    text := nullif(btrim(coalesce(p_pin, '')), '');
  v_clean  text;
  v_keep   text;
begin
  if not public.poolwagen_can('poolwagens_beheren') then
    raise exception 'Je hebt hier geen rechten voor.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pool_cars where id = p_car_id) then
    raise exception 'Wagen niet gevonden.' using errcode = 'P0002';
  end if;

  if v_number is not null then
    v_clean := upper(regexp_replace(v_number, '[^0-9A-Za-z]', '', 'g'));
    if length(v_clean) < 4 or length(v_number) > 40 then
      raise exception 'Het kaartnummer telt minstens 4 cijfers of letters (hoogstens 40 tekens).' using errcode = '22023';
    end if;
  end if;
  if v_pin is not null and v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'De pincode bestaat uit 4 tot 8 cijfers.' using errcode = '22023';
  end if;

  -- De bestaande pincode blijft staan, tenzij er een nieuwe is of ze gewist wordt.
  select pin into v_keep from public.pool_car_fuel_cards where car_id = p_car_id;
  v_pin := case when p_clear_pin then null else coalesce(v_pin, v_keep) end;

  if v_number is null and v_pin is null then
    delete from public.pool_car_fuel_cards where car_id = p_car_id;
  else
    insert into public.pool_car_fuel_cards (car_id, card_number, pin, updated_at, updated_by_name)
    values (p_car_id, v_number, v_pin, now(), public.pool_user_name(auth.uid()))
    on conflict (car_id) do update
      set card_number = excluded.card_number, pin = excluded.pin,
          updated_at = excluded.updated_at, updated_by_name = excluded.updated_by_name;
  end if;

  update public.pool_cars set fuel_card_last4 = case when v_clean is null then null else right(v_clean, 4) end
   where id = p_car_id;
end $$;

-- ── Overzicht voor beheer (zonder de pincodes) ──────────────────────────────

create function public.pool_fuel_cards()
returns table (car_id uuid, card_number text, has_pin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.poolwagen_can('poolwagens_beheren') then
    raise exception 'Je hebt hier geen rechten voor.' using errcode = '42501';
  end if;
  return query select f.car_id, f.card_number, f.pin is not null from public.pool_car_fuel_cards f;
end $$;

-- ── De pincode: wie onderweg is met deze wagen, of beheer ───────────────────
-- Geeft null als er voor deze wagen geen pincode is.

create function public.pool_fuel_card_pin(p_car_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pin text;
begin
  if not public.poolwagen_can('poolwagens') then
    raise exception 'Je hebt hier geen rechten voor.' using errcode = '42501';
  end if;
  if not public.poolwagen_can('poolwagens_beheren')
     and not exists (select 1 from public.pool_car_reservations r
                      where r.car_id = p_car_id and r.user_id = auth.uid()
                        and r.departed_at is not null and r.arrived_at is null
                        and r.cancelled_at is null) then
    raise exception 'De pincode zie je alleen tijdens je eigen rit met deze wagen.' using errcode = '42501';
  end if;
  select pin into v_pin from public.pool_car_fuel_cards where car_id = p_car_id;
  return v_pin;
end $$;

revoke all on function public.pool_set_fuel_card(uuid, text, text, boolean) from public, anon;
revoke all on function public.pool_fuel_cards() from public, anon;
revoke all on function public.pool_fuel_card_pin(uuid) from public, anon;
grant execute on function public.pool_set_fuel_card(uuid, text, text, boolean) to authenticated;
grant execute on function public.pool_fuel_cards() to authenticated;
grant execute on function public.pool_fuel_card_pin(uuid) to authenticated;

commit;
