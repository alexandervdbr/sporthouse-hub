-- Poolwagens (/poolwagens), stap 7 van de database: reserveren voor een
-- stagiair zonder account.
--
-- 1. Niet elke stagiair heeft een account in de hub. Wie het niveau
--    poolwagens heeft, kan nu ook reserveren voor iemand zonder account: met
--    een naam (p_guest_name) en een e-mailadres (p_guest_email). user_id
--    blijft leeg, person_name is de getypte naam, created_by is de planner;
--    die beheert de reservatie (vertrek, aankomst, annuleren), dat liet
--    pool_check_reservation_access (0077) al toe.
--
--    Het e-mailadres wordt NIET bewaard. De app stuurt de bevestigingsmail er
--    rechtstreeks naartoe; de database gebruikt het hier alleen om te
--    weigeren als het bij een bestaand account hoort (kies die persoon dan
--    gewoon bij "Voor wie").
--
-- 2. Te laat terug: de push ging naar user_id van de volgende reservatie. Bij
--    een stagiair zonder account is dat leeg; dan krijgt de planner
--    (created_by) de push.
--
-- Raakt alleen pool_-objecten aan. De signatuur van twee functies verandert
-- (twee extra parameters), dus die worden met DROP FUNCTION en CREATE
-- opnieuw gemaakt, met dezelfde grants. Alles in één transactie.
--
-- Wijzigt:
--   function public.pool_reservation_guest(text, text)                                      nieuw
--   function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid)         verwijderd
--   function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid) verwijderd
--   function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid, text, text) nieuw
--   function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid, text, text) nieuw
--   function public.pool_claim_late_notifications()                                          vervangen

begin;

-- ── Stagiair zonder account: naam en e-mail controleren ─────────────────────
-- Geeft de naam terug zoals ze in person_name komt. Niet rechtstreeks
-- aanroepbaar.

create function public.pool_reservation_guest(p_name text, p_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_meta  jsonb;
begin
  if v_name is null then
    raise exception 'Vul de naam van de stagiair in.' using errcode = '22023';
  end if;
  if length(v_name) > 100 then
    raise exception 'De naam van de stagiair is hoogstens 100 tekens.' using errcode = '22023';
  end if;
  -- Dezelfde regel als isEmail() in src/lib/poolwagens/email.ts.
  if v_email !~* '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then
    raise exception 'Vul een geldig e-mailadres van de stagiair in.' using errcode = '22023';
  end if;
  select coalesce(raw_app_meta_data, '{}'::jsonb) into v_meta
    from auth.users where lower(email) = v_email limit 1;
  if found then
    if coalesce((v_meta ->> 'freelancer')::boolean, false) then
      raise exception 'Dit e-mailadres hoort bij een freelancer. Voor een freelancer kan je geen poolwagen reserveren.' using errcode = '22023';
    end if;
    raise exception 'Dit e-mailadres hoort bij een account in de hub. Kies die persoon bij "Voor wie".' using errcode = '22023';
  end if;
  return v_name;
end $$;

revoke all on function public.pool_reservation_guest(text, text) from public, anon, authenticated;

-- ── Functies met de oude signatuur weg ──────────────────────────────────────
-- Eerst wat de andere aanroept.

drop function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid);
drop function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid);

-- ── Reserveren ──────────────────────────────────────────────────────────────
-- Zoals in 0080, plus p_guest_name/p_guest_email: een stagiair zonder account.
-- Een collega (p_user_id) en een stagiair samen kan niet.

create function public.pool_create_reservation(
  p_car_id      uuid,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_client_id   uuid default null,
  p_client_name text default null,
  p_note        text default null,
  p_user_id     uuid default null,
  p_guest_name  text default null,
  p_guest_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_guest     boolean := p_guest_name is not null or p_guest_email is not null;
  v_person    uuid;
  v_name      text;
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
  if v_guest then
    if p_user_id is not null then
      raise exception 'Kies een collega of een stagiair, niet allebei.' using errcode = '22023';
    end if;
    v_person := null;
    v_name := public.pool_reservation_guest(p_guest_name, p_guest_email);
  else
    v_person := public.pool_reservation_person(p_user_id);
    v_name := public.pool_user_name(v_person);
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
    p_car_id, v_person, v_name, p_client_id, v_client, p_start_at, p_end_at,
    nullif(btrim(coalesce(p_note, '')), ''), v_uid, public.pool_user_name(v_uid)
  ) returning id into v_id;

  return v_id;
end $$;

-- ── Nu vertrekken ───────────────────────────────────────────────────────────

create function public.pool_depart_now(
  p_car_id      uuid,
  p_end_at      timestamptz,
  p_client_id   uuid default null,
  p_client_name text default null,
  p_note        text default null,
  p_km          int default null,
  p_user_id     uuid default null,
  p_guest_name  text default null,
  p_guest_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.pool_create_reservation(p_car_id, now(), p_end_at, p_client_id, p_client_name, p_note,
                                         p_user_id, p_guest_name, p_guest_email);
  perform public.pool_register_departure(v_id, now(), p_km);
  return v_id;
end $$;

-- ── Te laat terug ───────────────────────────────────────────────────────────
-- Zoals in 0077; zonder account (stagiair) krijgt de planner de push.

create or replace function public.pool_claim_late_notifications()
returns table (reservation_id uuid, user_id uuid, car_name text, start_at timestamptz, late_person text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.poolwagen_can('poolwagens') then
    raise exception 'Je hebt geen toegang tot de poolwagens.' using errcode = '42501';
  end if;

  return query
  with late as (
    select t.car_id, t.end_at, t.person_name, coalesce(t.user_id, t.created_by) as late_user
      from public.pool_car_reservations t
     where t.departed_at is not null and t.arrived_at is null and t.cancelled_at is null
       and t.end_at < now()
  ),
  nxt as (
    select distinct on (n.car_id) n.id, n.car_id, n.start_at, n.late_notified_at,
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
    returning r.id, coalesce(r.user_id, r.created_by) as notify_user, r.car_id, r.start_at
  )
  select c.id, c.notify_user, car.name, c.start_at, nxt.person_name
    from claimed c
    join nxt on nxt.id = c.id
    join public.pool_cars car on car.id = c.car_id
   -- Wie zelf te laat is én de volgende reservatie heeft, krijgt geen push.
   where c.notify_user is distinct from nxt.late_user;
end $$;

-- ── Rechten, zoals in 0080 ──────────────────────────────────────────────────

revoke all on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid, text, text) from public, anon;
revoke all on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid, text, text) from public, anon;
grant execute on function public.pool_create_reservation(uuid, timestamptz, timestamptz, uuid, text, text, uuid, text, text) to authenticated;
grant execute on function public.pool_depart_now(uuid, timestamptz, uuid, text, text, int, uuid, text, text) to authenticated;

commit;
