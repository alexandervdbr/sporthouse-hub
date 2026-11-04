-- Diagnose bij de aankomsttijd van 4 november (punt 2). Alleen lezen.
-- Toont de tien laatst gemaakte reservaties met alle tijdstippen in Brusselse
-- tijd, plus de tijd van de database zelf. Verwacht: tot tien rijen.
--
-- Wat ik wil zien: bij de rit van ~15:27 de geplande terugkomst (end_bxl) en
-- het werkelijke vertrek (departed_bxl). Staat end_bxl op 17:27, dan kwam de
-- 17:27 uit de verwachte terugkomst en niet uit het aankomstveld.

select r.id,
       c.name                                                    as wagen,
       r.person_name                                             as wie,
       to_char(r.created_at  at time zone 'Europe/Brussels', 'DD/MM HH24:MI:SS') as gemaakt_bxl,
       to_char(r.start_at    at time zone 'Europe/Brussels', 'DD/MM HH24:MI')    as start_bxl,
       to_char(r.end_at      at time zone 'Europe/Brussels', 'DD/MM HH24:MI')    as end_bxl,
       to_char(r.departed_at at time zone 'Europe/Brussels', 'DD/MM HH24:MI:SS') as departed_bxl,
       to_char(r.arrived_at  at time zone 'Europe/Brussels', 'DD/MM HH24:MI:SS') as arrived_bxl,
       r.cancelled_at is not null                                as geannuleerd,
       to_char(now() at time zone 'Europe/Brussels', 'DD/MM HH24:MI:SS')         as nu_bxl
  from public.pool_car_reservations r
  join public.pool_cars c on c.id = r.car_id
 order by r.created_at desc
 limit 10;
