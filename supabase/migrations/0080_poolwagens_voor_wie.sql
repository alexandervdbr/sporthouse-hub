-- Poolwagens (/poolwagens), stap 5 van de database: reserveren voor een
-- collega, en een unieke naam per actieve wagen.
--
-- 1. Reserveren voor iemand anders. Wie het niveau poolwagens heeft, kan een
--    reservatie (of "Nu vertrekken") op naam van een collega zetten: user_id
--    en person_name zijn die van de collega, created_by blijft de maker.
--    Beiden mogen de reservatie daarna beheren; dat liet
--    pool_check_reservation_access (0077) al toe. De collega moet een
--    bestaand account zijn, geen freelancer en niet verlopen (dezelfde regel
--    als de lijst activePeople in de app).
--
-- 2. Twee actieve wagens kunnen niet dezelfde naam hebben. Hoofdletters en
--    spaties vooraan of achteraan tellen niet mee; gearchiveerde wagens ook
--    niet. Bestaan er al dubbele namen, dan stopt deze migratie meteen met een
--    melding die ze opsomt, en is er niets veranderd.
--
-- Raakt alleen pool_-objecten aan. De signatuur van twee functies verandert
-- (een extra parameter p_user_id), dus die worden met DROP FUNCTION en CREATE
-- opnieuw gemaakt, met dezelfde grants. Alles in één transactie.
--
-- Wijzigt:
--   index    public.pool_cars_name_active_key                                       nieuw
--   function public.pool_reservation_person(uuid)                                   nieuw
--   function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int)       verwijderd
--   function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text) verwijderd
--   function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid) nieuw
--   function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid) nieuw

begin;

-- ── Eerst: geen dubbele namen ───────────────────────────────────────────────
-- Anders zou de unieke index hieronder mislukken; nu met een duidelijke
-- melding. Een exception hier breekt de hele transactie af.

do $$
declare
  v_dubbel text;
begin
  select string_agg(format('"%s" (%s wagens)', naam, aantal), ', ' order by naam)
    into v_dubbel
    from (select min(btrim(name)) as naam, count(*) as aantal
            from public.pool_cars
           where archived_at is null
           group by lower(btrim(name))
          having count(*) > 1) d;
  if v_dubbel is not null then
    raise exception 'Migratie 0080 gestopt, er is niets aangepast. Deze namen komen meer dan eens voor bij de actieve wagens: %. Hernoem of archiveer er telkens één en draai de migratie opnieuw.', v_dubbel;
  end if;
end $$;

-- ── Unieke naam per actieve wagen ───────────────────────────────────────────

create unique index pool_cars_name_active_key
  on public.pool_cars (lower(btrim(name)))
  where archived_at is null;

-- ── Voor wie: de collega controleren ────────────────────────────────────────
-- Geen collega opgegeven (of jezelf): de ingelogde gebruiker. Anders een
-- bestaand account, geen freelancer, niet verlopen. Niet rechtstreeks
-- aanroepbaar.

create function public.pool_reservation_person(p_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_meta jsonb;
begin
  if p_user_id is null or p_user_id = auth.uid() then
    return auth.uid();
  end if;
  select coalesce(raw_app_meta_data, '{}'::jsonb) into v_meta from auth.users where id = p_user_id;
  if not found then
    raise exception 'Onbekende collega.' using errcode = '23503';
  end if;
  if coalesce((v_meta ->> 'freelancer')::boolean, false) then
    raise exception 'Voor een freelancer kan je geen poolwagen reserveren.' using errcode = '22023';
  end if;
  if v_meta ->> 'expires_at' is not null
     and left(v_meta ->> 'expires_at', 10) < to_char(now() at time zone 'Europe/Brussels', 'YYYY-MM-DD') then
    raise exception 'Het account van deze collega is niet meer actief.' using errcode = '22023';
  end if;
  return p_user_id;
end $$;

revoke all on function public.pool_reservation_person(uuid) from public, anon, authenticated;

-- ── Functies met de oude signatuur weg ──────────────────────────────────────
-- Eerst wat de andere aanroept.

drop function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int);
drop function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text);

-- ── Reserveren ──────────────────────────────────────────────────────────────
-- Zoals in 0079, plus p_user_id: voor wie de reservatie is.

create function public.pool_create_reservation(
  p_car_id      uuid,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_client_id   uuid default null,
  p_client_name text default null,
  p_note        text default null,
  p_user_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_person    uuid;
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
  v_person := public.pool_reservation_person(p_user_id);
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
    p_car_id, v_person, public.pool_user_name(v_person), p_client_id, v_client, p_start_at, p_end_at,
    nullif(btrim(coalesce(p_note, '')), ''), v_uid, public.pool_user_name(v_uid)
  ) returning id into v_id;

  return v_id;
end $$;

-- ── Nu vertrekken ───────────────────────────────────────────────────────────
-- Een reservatie vanaf nu en het vertrek in één handeling. Voor een collega
-- mag ook: de maker mag het vertrek registreren (created_by).

create function public.pool_depart_now(
  p_car_id      uuid,
  p_end_at      timestamptz,
  p_client_id   uuid default null,
  p_client_name text default null,
  p_note        text default null,
  p_km          int default null,
  p_user_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.pool_create_reservation(p_car_id, now(), p_end_at, p_client_id, p_client_name, p_note, p_user_id);
  perform public.pool_register_departure(v_id, now(), p_km);
  return v_id;
end $$;

-- ── Rechten, zoals in 0079 ──────────────────────────────────────────────────

revoke all on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid) from public, anon;
revoke all on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid) from public, anon;
grant execute on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid) to authenticated;
grant execute on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid) to authenticated;

commit;
