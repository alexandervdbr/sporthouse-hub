-- Wat zouden de bestaande crons doen bij hun EERSTE run, als ze weer
-- doorgelaten worden? ALLEEN LEZEN: alleen SELECT, er verandert niets.
--
-- Plak het geheel in de SQL-editor van Supabase en klik Run. Het resultaat is
-- één tabel: cron, onderwerp, aantal, details.
--
--   expire-users (02:00) — verwijdert DEFINITIEF elk Auth-account waarvan
--     app_metadata.expires_at <= nu (src/app/api/cron/expire-users/route.ts).
--     Let op: de route kijkt alleen naar de eerste 1000 accounts (perPage 1000).
--   purge-trash (03:00) — verwijdert definitief elk bestand en elk
--     Sporthouse-document dat langer dan 30 dagen in de prullenbak staat
--     (DB-rij weg, Drive-bestand naar de Drive-prullenbak, Supabase-bestand weg).
--
-- Sectie "gevolg bij verwijderen" toont per tabel die naar auth.users
-- verwijst wat er met de rijen van die verlopen accounts zou gebeuren:
--   cascade  → de rijen worden mee verwijderd
--   set null → de verwijzing wordt leeggemaakt
--   blokkeert→ het verwijderen van dat account MISLUKT (restrict / no action)

with
verlopen as (
  select id, email, raw_app_meta_data ->> 'expires_at' as expires_at, last_sign_in_at
  from auth.users
  where raw_app_meta_data ->> 'expires_at' ~ '^\d{4}-\d{2}-\d{2}'
    and (raw_app_meta_data ->> 'expires_at')::timestamptz <= now()
),
fk as (
  select c.conrelid::regclass::text as tabel,
         a.attname as kolom,
         case c.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default'
                            else 'blokkeert' end as bij_verwijderen
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and cardinality(c.conkey) = 1
),
fk_telling as (
  select fk.*,
         (xpath('/row/n/text()', query_to_xml(format(
            'select count(*) as n from %s where %I in (select id from auth.users where raw_app_meta_data ->> ''expires_at'' ~ ''^\d{4}-\d{2}-\d{2}'' and (raw_app_meta_data ->> ''expires_at'')::timestamptz <= now())',
            fk.tabel, fk.kolom), false, true, '')))[1]::text::bigint as rijen
  from fk
),
rapport(volgorde, cron, onderwerp, aantal, details) as (
  select 10, 'expire-users', 'accounts in totaal', (select count(*) from auth.users),
         jsonb_build_object('let op', case when (select count(*) from auth.users) > 1000
           then 'meer dan 1000 accounts: de cron ziet er maar 1000' else 'minder dan 1000: de cron ziet alles' end)
  union all
  select 11, 'expire-users', 'accounts die DEFINITIEF verwijderd zouden worden', (select count(*) from verlopen),
         coalesce((select jsonb_agg(jsonb_build_object('email', email, 'verliep', expires_at, 'laatst ingelogd', last_sign_in_at) order by expires_at)
                   from verlopen), '[]'::jsonb)
  union all
  select 12, 'expire-users', 'accounts met een einddatum in de toekomst', (
           select count(*) from auth.users
           where raw_app_meta_data ->> 'expires_at' ~ '^\d{4}-\d{2}-\d{2}'
             and (raw_app_meta_data ->> 'expires_at')::timestamptz > now()), null
  union all
  select 13, 'expire-users', 'expires_at in een onbekend formaat (de cron leest die anders)', (
           select count(*) from auth.users
           where raw_app_meta_data ? 'expires_at'
             and coalesce(raw_app_meta_data ->> 'expires_at', '') !~ '^\d{4}-\d{2}-\d{2}'), null
  union all
  select 20, 'expire-users: gevolg bij verwijderen', tabel || '.' || kolom || ' (' || bij_verwijderen || ')', rijen, null
    from fk_telling where rijen > 0
  union all
  select 30, 'purge-trash', 'bestanden (files) die definitief weg zouden gaan', count(*),
         jsonb_build_object(
           'in Drive', count(*) filter (where storage_provider = 'drive'),
           'in Supabase Storage', count(*) filter (where storage_provider is distinct from 'drive'),
           'grootte (MB)', round(coalesce(sum(file_size), 0) / 1048576.0, 1),
           'oudste in prullenbak sinds', min(deleted_at), 'jongste', max(deleted_at))
    from files where deleted_at is not null and deleted_at < now() - interval '30 days'
  union all
  select 31, 'purge-trash', 'Sporthouse-documenten die definitief weg zouden gaan', count(*),
         jsonb_build_object(
           'in Drive', count(*) filter (where storage_provider = 'drive'),
           'in Supabase Storage', count(*) filter (where storage_provider is distinct from 'drive'),
           'oudste in prullenbak sinds', min(deleted_at))
    from sporthouse_documents where deleted_at is not null and deleted_at < now() - interval '30 days'
  union all
  select 32, 'purge-trash', 'in de prullenbak, nog geen 30 dagen (blijven staan)',
         (select count(*) from files where deleted_at >= now() - interval '30 days')
       + (select count(*) from sporthouse_documents where deleted_at >= now() - interval '30 days'), null
)
select cron, onderwerp, aantal, details from rapport order by volgorde, onderwerp;
