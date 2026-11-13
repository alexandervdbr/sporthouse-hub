-- Dry-run van migratie 0093 (het nieuwe freelancer-datamodel).
--
-- ALLEEN LEZEN: één SELECT, geen create/alter/insert/update/delete. Er
-- verandert niets. Hangt niet af van 0092 of 0093: het leest alleen tabellen
-- die vandaag al bestaan. Draai het VÓÓR 0093 (daarna kloppen de cijfers niet
-- meer; sectie 0 zegt het als dat zo is).
--
-- Plak het geheel in de SQL-editor van Supabase en klik Run. Het resultaat is
-- één tabel met drie kolommen: sectie, onderwerp, details.
--
-- De berekeningen hieronder zijn dezelfde als in
-- supabase/migrations/0093_freelancers_datamodel.sql. Wijzig je de ene, wijzig
-- dan ook de andere (src/lib/__tests__/freelancers-migration.test.ts
-- controleert dat ze dezelfde regels gebruiken).
--
-- Secties:
--   0 stand         is 0092 al uitgevoerd, en 0093 (dan is deze dry-run te laat)?
--   1 rijen nu         hoeveel rijen er vandaag per tabel staan (om test- en
--                      echte data te kunnen inschatten)
--   2 blokkerend       alles waarop de migratie zou afbreken; leeg = ok
--   3 per freelancer   oude rating, overall_rating en review_avg na de
--                      migratie, en waar elke oude waarde terechtkomt
--   4 bestemming       hoeveel rijen er waar terechtkomen
--   5 aandacht         wat niet blokkeert maar wel een blik verdient

with
disc(key, label) as (values
  ('story', 'Story'), ('video', 'Video'), ('foto-video', 'Foto/Video'), ('visuals', 'Visuals'),
  ('foto', 'Foto'), ('redacteur', 'Redacteur'), ('social-host', 'Social Host'), ('allround', 'Allround'),
  ('video-vfx-motion', 'Video (vfx/motion)'), ('grafisch-design', 'Grafisch Design'),
  ('online-editor', 'Online Editor'), ('vfx-generalist', 'VFX Generalist'), ('podcasting', 'Podcasting')
),
fl as (
  select f.*,
         nullif(lower(btrim(f.email)), '') as email_na,
         case f.tested when 'ja' then 'vast' when 'weinig' then 'proefopdracht' else 'kandidaat' end as status_na,
         coalesce((select array_agg(distinct d.key order by d.key) from unnest(coalesce(f.types, '{}')) t
                     join disc d on lower(btrim(t)) in (lower(d.label), d.key)), '{}') as disciplines_na,
         (select string_agg(btrim(t), ', ' order by t) from unnest(coalesce(f.types, '{}')) t
           where nullif(btrim(t), '') is not null
             and not exists (select 1 from disc d where lower(btrim(t)) in (lower(d.label), d.key))) as andere_types,
         (select string_agg(btrim(s), ', ' order by s) from unnest(coalesce(f.specialties, '{}')) s
           where nullif(btrim(s), '') is not null) as specialiteiten,
         nullif(btrim(f.bio), '') as bio_tekst,
         case when f.tested is not null and f.tested not in ('ja', 'weinig', 'nee') then f.tested end as vreemd_getest
    from public.freelancers f
),
proj as (
  select p.freelancer_id,
         count(*)                                                                   as projecten,
         count(*) filter (where p.score is not null)                                as reviews,
         round(avg(p.score) filter (where p.score between 1 and 5)::numeric, 1)     as review_avg,
         count(*) filter (where p.score is null and nullif(btrim(p.notes), '') is not null) as notities
    from public.freelancer_projects p group by p.freelancer_id
),
klant as (
  select lower(btrim(name)) as k, count(*) as n from public.clients group by 1
),
rapport(volgorde, sectie, onderwerp, details) as (

  -- ── 0. Stand van de migraties (alleen opzoeken, niets aanroepen) ──────────
  select 1, '0 stand', '0092 (rechten)', jsonb_build_object(
           'uitgevoerd', to_regprocedure('public.user_can_view_freelancers()') is not null)
  union all select 2, '0 stand', '0093 (datamodel)', jsonb_build_object(
           'uitgevoerd', to_regclass('public.freelancer_disciplines') is not null,
           'opmerking', case when to_regclass('public.freelancer_disciplines') is not null
                             then '0093 is al uitgevoerd: deze dry-run hoort ervóór; de cijfers hieronder kloppen niet meer'
                             else 'nog niet uitgevoerd: de cijfers hieronder tonen wat 0093 zou doen' end)

  -- ── 1. Rijen nu ───────────────────────────────────────────────────────────
  union all select 10, '1 rijen nu', 'freelancers', jsonb_build_object(
           'totaal', (select count(*) from public.freelancers),
           'met e-mail', (select count(*) from public.freelancers where nullif(btrim(email), '') is not null),
           'met rating', (select count(*) from public.freelancers where rating is not null),
           'aangemaakt eerste/laatste', (select jsonb_build_array(min(created_at), max(created_at)) from public.freelancers))
  union all select 11, '1 rijen nu', 'freelancer_projects', jsonb_build_object(
           'totaal', (select count(*) from public.freelancer_projects),
           'met score', (select count(*) from public.freelancer_projects where score is not null),
           'aangemaakt eerste/laatste', (select jsonb_build_array(min(created_at), max(created_at)) from public.freelancer_projects))
  union all select 12, '1 rijen nu', 'freelancer_assignments', jsonb_build_object(
           'totaal', (select count(*) from public.freelancer_assignments),
           'per status', coalesce((select jsonb_object_agg(status, n) from (select status::text, count(*) n from public.freelancer_assignments group by 1) s), '{}'),
           'aangemaakt eerste/laatste', (select jsonb_build_array(min(created_at), max(created_at)) from public.freelancer_assignments))
  union all select 13, '1 rijen nu', 'freelancer_assignment_files', jsonb_build_object(
           'totaal', (select count(*) from public.freelancer_assignment_files),
           'per opslag', coalesce((select jsonb_object_agg(coalesce(storage_provider, '(leeg)'), n)
                                     from (select storage_provider, count(*) n from public.freelancer_assignment_files group by 1) s), '{}'))
  union all select 14, '1 rijen nu', 'gear_bookings met een freelancer', jsonb_build_object(
           'totaal', (select count(*) from public.gear_bookings where freelancer_id is not null))
  union all select 15, '1 rijen nu', 'auth.users met app_metadata.freelancer = true', jsonb_build_object(
           'totaal', (select count(*) from auth.users where coalesce((raw_app_meta_data ->> 'freelancer')::boolean, false)))

  -- ── 2. Blokkerend (de migratie breekt af als hier iets staat) ──────────────
  union all
  select 20, '2 blokkerend', 'dubbel e-mailadres: ' || email_na,
         jsonb_build_object('freelancers', jsonb_agg(jsonb_build_object('id', id, 'naam', name, 'email nu', email)))
    from fl where email_na is not null group by email_na having count(*) > 1
  union all
  select 21, '2 blokkerend', 'rating buiten 1–5: ' || name, jsonb_build_object('id', id, 'rating', rating)
    from public.freelancers where rating is not null and rating not between 1 and 5
  union all
  select 22, '2 blokkerend', 'projectscore buiten 1–5: ' || project_name, jsonb_build_object('id', id, 'score', score)
    from public.freelancer_projects where score is not null and score not between 1 and 5
  union all
  select 23, '2 blokkerend', 'onbekende opdrachtstatus: ' || status::text, jsonb_build_object('aantal', count(*))
    from public.freelancer_assignments where status::text not in ('nieuw', 'in_behandeling', 'afgerond') group by status::text
  union all
  select 24, '2 blokkerend', 'negatief uurtarief: ' || name, jsonb_build_object('id', id, 'hourly_rate', hourly_rate)
    from public.freelancers where hourly_rate < 0

  -- ── 3. Per freelancer ─────────────────────────────────────────────────────
  union all
  select 30, '3 per freelancer', fl.name, jsonb_build_object(
           'id', fl.id,
           'rating (oud)', fl.rating,
           'overall_rating (na)', fl.rating,
           'review_avg (na)', p.review_avg,
           'reviews (na)', coalesce(p.reviews, 0),
           'historische opdrachten (na)', coalesce(p.projecten, 0),
           'interne notities uit projecten (na)', coalesce(p.notities, 0),
           'opdrachten nu', (select count(*) from public.freelancer_assignments a where a.freelancer_id = fl.id),
           'email', jsonb_build_array(fl.email, fl.email_na),
           'getest → status', jsonb_build_array(fl.tested, fl.status_na),
           'types → disciplines', jsonb_build_array(to_jsonb(fl.types), to_jsonb(fl.disciplines_na)),
           'naar notities', jsonb_strip_nulls(jsonb_build_object(
               'andere types', fl.andere_types, 'specialiteiten', fl.specialiteiten,
               'bio', fl.bio_tekst, 'getest (onbekende waarde)', fl.vreemd_getest)),
           'uurtarief → rate_amount (uur)', fl.hourly_rate,
           'price_info → rate_note', nullif(btrim(fl.price_info), ''),
           'portfolio_url → portfolio_links', nullif(btrim(fl.portfolio_url), ''))
    from fl left join proj p on p.freelancer_id = fl.id

  -- ── 4. Bestemming ─────────────────────────────────────────────────────────
  union all select 40, '4 bestemming', 'freelancers bijgewerkt (niets verwijderd)',
         jsonb_build_object('rijen', (select count(*) from public.freelancers))
  union all select 41, '4 bestemming', 'status (uit getest)',
         coalesce((select jsonb_object_agg(status_na, n) from (select status_na, count(*) n from fl group by 1) s), '{}')
  union all select 42, '4 bestemming', 'bestaande opdrachten: oude → nieuwe status',
         coalesce((select jsonb_object_agg(status::text || ' → ' || case status::text when 'nieuw' then 'gedeeld'
                                                when 'in_behandeling' then 'geaccepteerd' else status::text end, n)
                     from (select status, count(*) n from public.freelancer_assignments group by 1) s), '{}')
  union all select 43, '4 bestemming', 'projecten → historische, afgeronde opdrachten',
         jsonb_build_object('nieuwe rijen in freelancer_assignments', (select count(*) from public.freelancer_projects))
  union all select 44, '4 bestemming', 'projectscores → freelancer_reviews',
         jsonb_build_object('nieuwe rijen', (select count(*) from public.freelancer_projects where score is not null))
  union all select 45, '4 bestemming', 'projectnotities zonder score → interne notitie (events)',
         jsonb_build_object('nieuwe rijen', (select count(*) from public.freelancer_projects
                                              where score is null and nullif(btrim(notes), '') is not null))
  union all select 46, '4 bestemming', 'opdrachten: maker (e-mail) → account',
         jsonb_build_object(
           'gekoppeld', (select count(*) from public.freelancer_assignments a
                          where nullif(btrim(a.created_by::text), '') is not null
                            and exists (select 1 from auth.users u where lower(btrim(u.email)) = lower(btrim(a.created_by::text)))),
           'geen account gevonden (e-mail blijft in created_by_email)', (select count(*) from public.freelancer_assignments a
                          where nullif(btrim(a.created_by::text), '') is not null
                            and not exists (select 1 from auth.users u where lower(btrim(u.email)) = lower(btrim(a.created_by::text)))))
  union all select 47, '4 bestemming', 'klantnaam → client_id (exact één klant)',
         jsonb_build_object(
           'gekoppeld', (select count(*) from (
               select client_name from public.freelancer_assignments union all select client_name from public.freelancer_projects) c
               join klant k on k.k = lower(btrim(c.client_name)) and k.n = 1),
           'blijft alleen tekst', (select count(*) from (
               select client_name from public.freelancer_assignments union all select client_name from public.freelancer_projects) c
               where nullif(btrim(c.client_name), '') is not null
                 and not exists (select 1 from klant k where k.k = lower(btrim(c.client_name)) and k.n = 1)))
  union all select 48, '4 bestemming', 'bestanden (blijven waar ze zijn, krijgen kind=briefing, uploaded_by=team)',
         jsonb_build_object('rijen', (select count(*) from public.freelancer_assignment_files))

  -- ── 5. Aandacht (blokkeert niet) ──────────────────────────────────────────
  union all
  select 50, '5 aandacht', 'e-mail verandert door trimmen/kleine letters: ' || name,
         jsonb_build_object('nu', email, 'na', email_na)
    from fl where email is distinct from email_na and nullif(btrim(email), '') is not null
  union all
  select 51, '5 aandacht', 'type is geen bekende discipline (→ notities): ' || name,
         jsonb_build_object('types', andere_types)
    from fl where andere_types is not null
  union all
  select 52, '5 aandacht', 'freelancer met rating maar zonder projectscores: ' || fl.name,
         jsonb_build_object('rating', fl.rating, 'opmerking', 'overall_rating = rating; review_avg blijft leeg')
    from fl left join proj p on p.freelancer_id = fl.id
   where fl.rating is not null and coalesce(p.reviews, 0) = 0
)
select sectie, onderwerp, details from rapport order by volgorde, onderwerp;
