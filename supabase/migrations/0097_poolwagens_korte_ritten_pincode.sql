-- Poolwagens (/poolwagens), stap 9 van de database: twee correcties op 0095
-- en 0096.
--
-- 1. Korte ritten. pool_auto_depart (0096) zette het vertrek alleen voor
--    reservaties die nog liepen. Opende niemand de planning tijdens een
--    korte rit (9:00–11:00, en de bestuurder kijkt pas om 11:10), dan
--    vertrok die rit nooit: niet in "Mijn ritten", de wagen stond op vrij,
--    geen te-laat-push, niet in de historiek. Nu krijgt ook een reservatie
--    die al voorbij is het vertrek, zolang ze niet teruggebracht of
--    geannuleerd is. Alleen voor reservaties die starten vanaf de invoering
--    van het automatische vertrek (20/11/2026 11:00, Brusselse tijd): oudere
--    reservaties zonder vertrek zijn no-shows uit de tijd van de knop en
--    blijven ongemoeid. Zo'n voorbije rit wordt meteen "te laat" tot de
--    aankomst geregistreerd is, of tot iemand "Niet gereden" kiest.
--
-- 2. Tankkaart. De pincode zag alleen wie op de reservatie staat (user_id).
--    Bij een stagiair zonder account (0095) is dat niemand; nu ziet wie
--    reserveerde (created_by) de pincode tijdens die rit. Voor een collega
--    met een account verandert er niets: die ziet ze zelf.
--
-- Raakt alleen pool_-objecten aan. Signaturen blijven gelijk (create or
-- replace), grants blijven. Alles in één transactie.
--
-- Wijzigt:
--   function public.pool_auto_depart()             vervangen
--   function public.pool_fuel_card_pin(uuid)       vervangen

begin;

-- ── Automatisch vertrek, ook voor voorbije ritten ───────────────────────────

create or replace function public.pool_auto_depart()
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
  -- Per wagen de vroegste: is die nog niet terug, dan wacht de volgende.
  for r in
    select distinct on (t.car_id) t.*
      from public.pool_car_reservations t
     where t.departed_at is null and t.arrived_at is null and t.cancelled_at is null
       and t.start_at <= now()
       and (t.end_at > now() or t.start_at >= timestamptz '2026-11-20 11:00 Europe/Brussels')
     order by t.car_id, t.start_at
  loop
    if public.pool_depart_reservation(r) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- ── De pincode: wie rijdt, wie voor een stagiair reserveerde, of beheer ─────

create or replace function public.pool_fuel_card_pin(p_car_id uuid)
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
                      where r.car_id = p_car_id
                        and (r.user_id = auth.uid() or (r.user_id is null and r.created_by = auth.uid()))
                        and r.departed_at is not null and r.arrived_at is null
                        and r.cancelled_at is null) then
    raise exception 'De pincode zie je alleen tijdens je eigen rit met deze wagen.' using errcode = '42501';
  end if;
  select pin into v_pin from public.pool_car_fuel_cards where car_id = p_car_id;
  return v_pin;
end $$;

commit;
