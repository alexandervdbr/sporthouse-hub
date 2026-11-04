-- Poolwagens (/poolwagens), stap 3 van de database: schade melden en
-- behandelen, foto's, en de ontvangers van de schademail.
--
-- Maakt uitsluitend nieuwe objecten aan; raakt niets bestaands aan. Bouwt op
-- 0076 (pool_cars, poolwagen_can) en 0077 (pool_car_reservations,
-- pool_car_damage_reports, pool_user_name). Alles in één transactie.
--
-- Objecten:
--   table    public.pool_car_damage_photos
--   index    public.pool_car_damage_photos_report_idx
--   table    public.pool_settings (één rij)
--   function public.pool_report_damage(uuid, uuid, text, text)
--   function public.pool_add_damage_photo(uuid, text, text, text)
--   function public.pool_set_damage_status(uuid, text)
--   function public.pool_lift_damage_block(uuid)
--   function public.pool_set_damage_mail_status(uuid, text, text)
--   function public.pool_set_mail_recipients(text[])
--   policy   poolwagens_bekijken on public.pool_car_damage_photos (select)
--   policy   poolwagens_beheren  on public.pool_settings (select)
--
-- Rechten (module Poolwagens):
--   poolwagens          schade melden, foto's bij de eigen melding
--   poolwagens_beheren  status wijzigen, blokkade opheffen, ontvangers
--
-- Een ernstige melding blokkeert de wagen voor nieuwe reservaties (zie
-- pool_car_block_reason in 0077) tot ze hersteld is of de blokkade
-- opgeheven. Bestaande reservaties blijven staan; het scherm markeert ze.

begin;

-- ── Foto's ──────────────────────────────────────────────────────────────────
-- De bestanden zelf staan in Google Drive (rechtstreeks vanuit de browser
-- geüpload, zoals Pré-assist); hier alleen de verwijzing.

create table public.pool_car_damage_photos (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.pool_car_damage_reports(id) on delete cascade,
  drive_file_id text not null unique check (length(btrim(drive_file_id)) > 0),
  filename      text not null,
  mime_type     text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index pool_car_damage_photos_report_idx on public.pool_car_damage_photos (report_id, created_at);

-- ── Instellingen ────────────────────────────────────────────────────────────
-- Eén rij. Een lege lijst ontvangers betekent: geen mail (Beheer waarschuwt).

create table public.pool_settings (
  id                     boolean primary key default true check (id),
  damage_mail_recipients text[] not null default '{}',
  updated_at             timestamptz not null default now(),
  updated_by_name        text
);

insert into public.pool_settings (id) values (true);

-- ── Schade melden ───────────────────────────────────────────────────────────
-- Optioneel bij een rit: dan moet die rit van dezelfde wagen zijn en al
-- vertrokken.

create function public.pool_report_damage(
  p_car_id         uuid,
  p_reservation_id uuid,
  p_description    text,
  p_severity       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null or not public.poolwagen_can('poolwagens') then
    raise exception 'Geen recht om schade te melden.' using errcode = '42501';
  end if;
  if p_severity is null or p_severity not in ('licht', 'ernstig') then
    raise exception 'Kies de ernst: licht of ernstig.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'Beschrijf de schade.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pool_cars where id = p_car_id and archived_at is null) then
    raise exception 'Wagen niet gevonden.' using errcode = 'P0002';
  end if;
  if p_reservation_id is not null and not exists (
    select 1 from public.pool_car_reservations
     where id = p_reservation_id and car_id = p_car_id and departed_at is not null
  ) then
    raise exception 'Die rit hoort niet bij deze wagen of is nog niet gestart.' using errcode = '22023';
  end if;

  insert into public.pool_car_damage_reports (car_id, reservation_id, description, severity, reported_by, reported_by_name)
  values (p_car_id, p_reservation_id, btrim(p_description), p_severity, v_uid, public.pool_user_name(v_uid))
  returning id into v_id;

  return v_id;
end $$;

-- ── Foto toevoegen ──────────────────────────────────────────────────────────
-- Wie de melding deed, of beheer. Hoogstens 10 foto's per melding.

create function public.pool_add_damage_photo(
  p_report_id     uuid,
  p_drive_file_id text,
  p_filename      text,
  p_mime_type     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d    public.pool_car_damage_reports;
  v_id uuid;
begin
  select * into d from public.pool_car_damage_reports where id = p_report_id for update;
  if d.id is null then
    raise exception 'Melding niet gevonden.' using errcode = 'P0002';
  end if;
  if not public.poolwagen_can('poolwagens')
     or (d.reported_by is distinct from auth.uid() and not public.poolwagen_can('poolwagens_beheren')) then
    raise exception 'Alleen wie de schade meldde, kan er foto''s bij zetten.' using errcode = '42501';
  end if;
  if (select count(*) from public.pool_car_damage_photos where report_id = p_report_id) >= 10 then
    raise exception 'Hoogstens 10 foto''s per melding.' using errcode = '22023';
  end if;

  insert into public.pool_car_damage_photos (report_id, drive_file_id, filename, mime_type, created_by)
  values (p_report_id, btrim(p_drive_file_id), coalesce(nullif(btrim(p_filename), ''), 'foto'), p_mime_type, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ── Status wijzigen (beheer) ────────────────────────────────────────────────
-- gemeld → in behandeling → hersteld. Hersteld heft de blokkade op.

create function public.pool_set_damage_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.poolwagen_can('poolwagens_beheren') then
    raise exception 'Alleen een beheerder kan de status van een schademelding wijzigen.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('gemeld', 'in_behandeling', 'hersteld') then
    raise exception 'Onbekende status: %', p_status using errcode = '22023';
  end if;

  update public.pool_car_damage_reports
     set status                 = p_status,
         status_changed_at      = now(),
         status_changed_by_name = public.pool_user_name(auth.uid())
   where id = p_id;
  if not found then
    raise exception 'Melding niet gevonden.' using errcode = 'P0002';
  end if;
end $$;

-- ── Blokkade opheffen (beheer) ──────────────────────────────────────────────
-- Voor een ernstige melding die nog niet hersteld is: de wagen mag weer
-- gereserveerd worden, de melding blijft open.

create function public.pool_lift_damage_block(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.pool_car_damage_reports;
begin
  if not public.poolwagen_can('poolwagens_beheren') then
    raise exception 'Alleen een beheerder kan een blokkade opheffen.' using errcode = '42501';
  end if;
  select * into d from public.pool_car_damage_reports where id = p_id for update;
  if d.id is null then
    raise exception 'Melding niet gevonden.' using errcode = 'P0002';
  end if;
  if d.severity <> 'ernstig' or d.status = 'hersteld' or d.block_lifted_at is not null then
    raise exception 'Deze melding blokkeert de wagen niet.' using errcode = '22023';
  end if;

  update public.pool_car_damage_reports
     set block_lifted_at      = now(),
         block_lifted_by_name = public.pool_user_name(auth.uid())
   where id = p_id;
end $$;

-- ── Mailstatus bijhouden ────────────────────────────────────────────────────
-- De server roept dit aan na een verzendpoging, met de rechten van wie
-- meldde: die mag het één keer (de eerste poging), beheer altijd (opnieuw
-- versturen).

create function public.pool_set_damage_mail_status(p_id uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.pool_car_damage_reports;
begin
  if p_status is null or p_status not in ('verstuurd', 'mislukt', 'niet_geconfigureerd', 'geen_ontvangers') then
    raise exception 'Onbekende mailstatus: %', p_status using errcode = '22023';
  end if;
  select * into d from public.pool_car_damage_reports where id = p_id for update;
  if d.id is null then
    raise exception 'Melding niet gevonden.' using errcode = 'P0002';
  end if;
  if not public.poolwagen_can('poolwagens_beheren') then
    if not public.poolwagen_can('poolwagens') or d.reported_by is distinct from auth.uid() then
      raise exception 'Geen recht op deze melding.' using errcode = '42501';
    end if;
    if d.mail_attempted_at is not null then
      raise exception 'De mail voor deze melding is al verwerkt.' using errcode = '22023';
    end if;
  end if;

  update public.pool_car_damage_reports
     set mail_status       = p_status,
         mail_error        = left(nullif(btrim(coalesce(p_error, '')), ''), 500),
         mail_attempted_at = now()
   where id = p_id;
end $$;

-- ── Ontvangers instellen (beheer) ───────────────────────────────────────────
-- Geldige e-mailadressen, in kleine letters, zonder dubbels, hoogstens 20.

create function public.pool_set_mail_recipients(p_recipients text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list text[];
  v_bad  text;
begin
  if not public.poolwagen_can('poolwagens_beheren') then
    raise exception 'Alleen een beheerder kan de ontvangers instellen.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_list
    from (select lower(btrim(e)) as x from unnest(coalesce(p_recipients, '{}')) e) s
   where x <> '';

  select x into v_bad from unnest(v_list) x
   where x !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
   limit 1;
  if v_bad is not null then
    raise exception 'Geen geldig e-mailadres: %', v_bad using errcode = '22023';
  end if;
  if cardinality(v_list) > 20 then
    raise exception 'Hoogstens 20 ontvangers.' using errcode = '22023';
  end if;

  update public.pool_settings
     set damage_mail_recipients = v_list,
         updated_at             = now(),
         updated_by_name        = public.pool_user_name(auth.uid())
   where id;
  return v_list;
end $$;

revoke all on function public.pool_report_damage(uuid, uuid, text, text) from public, anon;
revoke all on function public.pool_add_damage_photo(uuid, text, text, text) from public, anon;
revoke all on function public.pool_set_damage_status(uuid, text) from public, anon;
revoke all on function public.pool_lift_damage_block(uuid) from public, anon;
revoke all on function public.pool_set_damage_mail_status(uuid, text, text) from public, anon;
revoke all on function public.pool_set_mail_recipients(text[]) from public, anon;
grant execute on function public.pool_report_damage(uuid, uuid, text, text) to authenticated;
grant execute on function public.pool_add_damage_photo(uuid, text, text, text) to authenticated;
grant execute on function public.pool_set_damage_status(uuid, text) to authenticated;
grant execute on function public.pool_lift_damage_block(uuid) to authenticated;
grant execute on function public.pool_set_damage_mail_status(uuid, text, text) to authenticated;
grant execute on function public.pool_set_mail_recipients(text[]) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.pool_car_damage_photos enable row level security;
alter table public.pool_settings          enable row level security;

create policy poolwagens_bekijken on public.pool_car_damage_photos
  for select to authenticated using (public.poolwagen_can('poolwagens'));

-- De ontvangers ziet alleen beheer; de server leest ze bij het versturen.
create policy poolwagens_beheren on public.pool_settings
  for select to authenticated using (public.poolwagen_can('poolwagens_beheren'));

commit;
