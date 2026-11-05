-- Poolwagens (/poolwagens), stap 4 van de database: klant in plaats van
-- project.
--
-- Projecten worden in Asana gepland, niet in de hub. Een reservatie krijgt
-- daarom geen project meer, maar optioneel een klant: een bestaande klant uit
-- public.clients, of een zelf getypte naam. Beide leeg mag.
--
-- Raakt alleen pool_-objecten aan. Op public.clients komt enkel een gewone
-- foreign key vanuit pool_car_reservations (zoals gear_bookings die ook
-- heeft); verder blijft alles buiten pool_/poolwagen onaangeroerd. De
-- signatuur van drie functies verandert, dus die worden met DROP FUNCTION en
-- CREATE opnieuw gemaakt (alleen functies met de prefix pool_). Er bestaan nog
-- geen reservaties (ze vroegen een project, en er zijn geen projecten), dus
-- er gaat niets verloren. Alles in één transactie.
--
-- Wijzigt:
--   index    public.pool_car_reservations_project_idx         verwijderd
--   column   public.pool_car_reservations.project_id          verwijderd
--   column   public.pool_car_reservations.client_id           nieuw (fk public.clients, on delete set null)
--   column   public.pool_car_reservations.client_name         nieuw
--   index    public.pool_car_reservations_client_idx          nieuw
--   function public.pool_depart_now(uuid, timestamptz, uuid, text, int)                    verwijderd
--   function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text) verwijderd
--   function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text)   verwijderd
--   function public.pool_resolve_client(uuid, text)                                        nieuw
--   function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text)  nieuw
--   function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text, text) nieuw
--   function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int)             nieuw
--
-- client_name is altijd de naam die getoond wordt: bij een gekoppelde klant
-- een kopie van zijn naam (blijft leesbaar als de klant verdwijnt), anders
-- de getypte naam.

begin;

-- ── Kolommen ────────────────────────────────────────────────────────────────

drop index public.pool_car_reservations_project_idx;
alter table public.pool_car_reservations drop column project_id;

alter table public.pool_car_reservations
  add column client_id   uuid references public.clients(id) on delete set null,
  add column client_name text check (client_name is null or length(btrim(client_name)) between 1 and 200);

create index pool_car_reservations_client_idx
  on public.pool_car_reservations (client_id) where client_id is not null;

-- ── Functies met de oude signatuur weg ──────────────────────────────────────
-- Eerst wat de andere aanroept.

drop function public.pool_depart_now(uuid, timestamptz, uuid, text, int);
drop function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text);
drop function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text);

-- ── Klant bepalen ───────────────────────────────────────────────────────────
-- Een bestaande klant (dan zijn naam), of een getypte naam, of niets.

create function public.pool_resolve_client(p_client_id uuid, p_client_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if p_client_id is not null then
    select name into v_name from public.clients where id = p_client_id;
    if v_name is null then
      raise exception 'Onbekende klant.' using errcode = '23503';
    end if;
    return left(btrim(v_name), 200);
  end if;
  v_name := nullif(btrim(coalesce(p_client_name, '')), '');
  if v_name is not null and length(v_name) > 200 then
    raise exception 'De klantnaam is hoogstens 200 tekens.' using errcode = '22023';
  end if;
  return v_name;
end $$;

revoke all on function public.pool_resolve_client(uuid, text) from public, anon, authenticated;

-- ── Reserveren ──────────────────────────────────────────────────────────────

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

-- ── Wijzigen ────────────────────────────────────────────────────────────────
-- Eigen reservatie zolang de rit niet gestart is; beheer altijd (behalve een
-- andere wagen kiezen voor een rit die al onderweg is). Een geblokkeerde
-- wagen: verkorten mag, verlengen of verplaatsen naar die wagen niet.

create function public.pool_update_reservation(
  p_id          uuid,
  p_car_id      uuid,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_client_id   uuid default null,
  p_client_name text default null,
  p_note        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r           public.pool_car_reservations;
  v_manager   boolean := public.poolwagen_can('poolwagens_beheren');
  v_client    text;
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
  -- Een klant die intussen verwijderd is (client_id werd null), houdt zijn
  -- naam; wie niets verandert aan de klant, stuurt die naam gewoon terug.
  v_client := public.pool_resolve_client(p_client_id, p_client_name);

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
     set car_id      = p_car_id,
         start_at    = p_start_at,
         end_at      = p_end_at,
         client_id   = p_client_id,
         client_name = v_client,
         note        = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
end $$;

-- ── Nu vertrekken ───────────────────────────────────────────────────────────
-- Een reservatie vanaf nu en het vertrek in één handeling, met dezelfde
-- controles. Lukt één ding niet, dan gebeurt er niets.

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

-- ── Rechten, zoals in 0077 ──────────────────────────────────────────────────

revoke all on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text) from public, anon;
revoke all on function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text, text) from public, anon;
revoke all on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int) from public, anon;
grant execute on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text) to authenticated;
grant execute on function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text, text) to authenticated;
grant execute on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int) to authenticated;

commit;
