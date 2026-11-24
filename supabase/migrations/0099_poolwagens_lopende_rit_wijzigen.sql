-- Poolwagens (/poolwagens), stap 10 van de database: een lopende rit zelf
-- wijzigen.
--
-- Sinds 0096 start een rit vanzelf op het gereserveerde uur. Daardoor kon wie
-- geen beheerder is zijn rit niet meer wijzigen zodra dat uur voorbij was —
-- ook niet om de terugkomst te verschuiven, of om te zeggen dat hij pas later
-- vertrekt dan gepland.
--
-- Nieuw: je eigen rit wijzigen mag zolang de aankomst niet geregistreerd is.
-- Terugkomst, klant en notitie zoals bij een reservatie. De wagen blijft
-- vast (zoals al voor iedereen). Het vertrek mag ook verschuiven:
--
--   - naar een ander moment in het verleden ("ik vertrok pas om 15:40"):
--     departed_at schuift mee, de rit blijft onderweg;
--   - naar de toekomst ("ik vertrek pas om 16:00"): de rit wordt weer een
--     gewone reservatie (departed_at en departure_km gewist, zoals bij niet
--     gereden in 0096) en start vanzelf opnieuw op het nieuwe uur, met de
--     km-stand van dat moment. Tot dan is de wagen vrij voor anderen.
--
-- Dat meeschuiven geldt ook voor beheer. Een teruggebrachte rit kan alleen
-- beheer nog wijzigen; departed_at blijft dan ongemoeid (de aankomst moet
-- erna blijven liggen).
--
-- Raakt alleen pool_-objecten aan. Signatuur blijft gelijk (create or
-- replace), grants blijven. Alles in één transactie.
--
-- Wijzigt:
--   function public.pool_update_reservation(uuid, uuid, timestamptz, timestamptz, uuid, text, text) vervangen

begin;

create or replace function public.pool_update_reservation(
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
  v_departed  timestamptz;
  v_km        int;
begin
  select * into r from public.pool_car_reservations where id = p_id for update;
  perform public.pool_check_reservation_access(r);

  if r.arrived_at is not null and not v_manager then
    raise exception 'De wagen is al teruggebracht; wijzigen kan dan alleen een beheerder.' using errcode = '42501';
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

  -- Een gestarte rit op een intussen geblokkeerde wagen mag verlengd worden:
  -- wie ermee rijdt, moet hem kunnen terugbrengen.
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

  -- Het vertrek van een lopende rit schuift mee met het geplande vertrek;
  -- ligt dat in de toekomst, dan is de rit nog niet begonnen.
  v_departed := r.departed_at;
  v_km := r.departure_km;
  if r.departed_at is not null and r.arrived_at is null and p_start_at <> r.start_at then
    if p_start_at > now() then
      v_departed := null;
      v_km := null;
    else
      v_departed := p_start_at;
    end if;
  end if;

  update public.pool_car_reservations
     set car_id       = p_car_id,
         start_at     = p_start_at,
         end_at       = p_end_at,
         client_id    = p_client_id,
         client_name  = v_client,
         note         = nullif(btrim(coalesce(p_note, '')), ''),
         departed_at  = v_departed,
         departure_km = v_km
   where id = p_id;
end $$;

commit;
