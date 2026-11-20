-- Poolwagens (/poolwagens), stap 8 van de database: geen vertrek meer
-- registreren.
--
-- Het vertrek bevestigen was meer last dan nut. Een reservatie wordt nu
-- vanzelf een rit op het gereserveerde uur, met de laatst bekende
-- kilometerstand van de wagen als stand bij vertrek. Alleen de aankomst
-- (met km) blijft een handeling. departed_at/departure_km blijven bestaan,
-- zodat alles wat erop steunt (status, te laat, tankkaart, historiek,
-- schade bij een rit) ongewijzigd werkt.
--
-- 1. pool_auto_depart(): zet het vertrek voor reservaties die begonnen zijn
--    en nog lopen. Geen timer: de app roept dit aan bij het laden van de
--    planning, net als de te-laat-meldingen. Per wagen hoogstens één open
--    rit: is de vorige rit nog niet terug, dan wacht de volgende tot die
--    aankomst geregistreerd is (en neemt dan de juiste km-stand).
--    Reservaties die al voorbij zijn zonder vertrek (no-shows van vóór deze
--    migratie) blijven ongemoeid.
--
-- 2. pool_register_arrival: werkt ook als het vertrek nog niet gezet is
--    (bv. niemand opende de planning tijdens de rit); dan eerst het vertrek
--    zoals hierboven.
--
-- 3. pool_cancel_reservation: een rit zonder aankomst kan nog geannuleerd
--    worden (niet gereden). Het automatische vertrek wordt dan gewist. Een
--    teruggebrachte rit annuleren kan niet.
--
-- pool_register_departure blijft bestaan (niet meer gebruikt door de app).
-- Raakt alleen pool_-objecten aan. Signaturen blijven gelijk (create or
-- replace), grants blijven. Alles in één transactie.
--
-- Wijzigt:
--   function public.pool_depart_reservation(public.pool_car_reservations)  nieuw
--   function public.pool_auto_depart()                                     nieuw
--   function public.pool_register_arrival(uuid, timestamptz, int)          vervangen
--   function public.pool_cancel_reservation(uuid)                          vervangen

begin;

-- ── Eén reservatie laten vertrekken ─────────────────────────────────────────
-- Op het gereserveerde uur, met de huidige km-stand van de wagen. Geeft false
-- als de wagen nog een andere open rit heeft. Niet rechtstreeks aanroepbaar.

create function public.pool_depart_reservation(r public.pool_car_reservations)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_km int;
begin
  select current_km into v_km from public.pool_cars where id = r.car_id for update;
  if exists (
    select 1 from public.pool_car_reservations o
     where o.car_id = r.car_id and o.id <> r.id
       and o.departed_at is not null and o.arrived_at is null and o.cancelled_at is null
  ) then
    return false;
  end if;
  update public.pool_car_reservations
     set departed_at = r.start_at, departure_km = coalesce(v_km, 0)
   where id = r.id and departed_at is null;
  return true;
end $$;

revoke all on function public.pool_depart_reservation(public.pool_car_reservations) from public, anon, authenticated;

-- ── Automatisch vertrek ─────────────────────────────────────────────────────
-- Per wagen de vroegste reservatie die begonnen is, nog loopt en nog niet
-- vertrokken is. Meestal nul rijen: dan schrijft dit niets.

create function public.pool_auto_depart()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.pool_car_reservations;
  v_count int := 0;
begin
  if not public.poolwagen_can('poolwagens') then
    raise exception 'Je hebt geen toegang tot de poolwagens.' using errcode = '42501';
  end if;
  for r in
    select distinct on (t.car_id) t.*
      from public.pool_car_reservations t
     where t.departed_at is null and t.arrived_at is null and t.cancelled_at is null
       and t.start_at <= now() and t.end_at > now()
     order by t.car_id, t.start_at
  loop
    if public.pool_depart_reservation(r) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

revoke all on function public.pool_auto_depart() from public, anon;
grant execute on function public.pool_auto_depart() to authenticated;

-- ── Aankomst ────────────────────────────────────────────────────────────────
-- Zoals in 0077; is het vertrek nog niet gezet, dan eerst automatisch.

create or replace function public.pool_register_arrival(
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

  if r.arrived_at is not null then
    raise exception 'De aankomst is al geregistreerd.' using errcode = '22023';
  end if;
  if r.departed_at is null then
    if r.start_at > now() then
      raise exception 'De rit is nog niet begonnen.' using errcode = '22023';
    end if;
    if not public.pool_depart_reservation(r) then
      raise exception 'De wagen is nog niet terug van een vorige rit; registreer eerst die aankomst.' using errcode = '23P01';
    end if;
    select * into r from public.pool_car_reservations where id = p_id;
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

-- ── Annuleren ───────────────────────────────────────────────────────────────
-- Zoals in 0077, maar een rit zonder aankomst mag ook (niet gereden): het
-- vertrek wordt dan gewist. Schade gemeld bij die rit blijft bestaan.

create or replace function public.pool_cancel_reservation(p_id uuid)
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

  if r.arrived_at is not null then
    raise exception 'De wagen is al teruggebracht; deze rit kan niet meer geannuleerd worden.' using errcode = '22023';
  end if;

  update public.pool_car_reservations
     set departed_at       = null,
         departure_km      = null,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancelled_by_name = public.pool_user_name(auth.uid())
   where id = p_id;
end $$;

commit;
