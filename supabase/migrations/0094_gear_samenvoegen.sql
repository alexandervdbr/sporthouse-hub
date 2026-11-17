-- Materiaalplanner: boekingen samenvoegen, en een wijzigingsmail.
--
-- 1. Samenvoegen (gear_merge_bookings): twee of meer boekingen van dezelfde
--    persoon met exact dezelfde periode (data én uren) worden één boeking met
--    al het materiaal. Atomair: alles of niets. De regels van boeken blijven:
--    dezelfde periode betekent dat er niets nieuws kan botsen (de regels
--    verhuizen met hun bezetting en hun kit), en de botsingscontrole draait
--    toch nog eens voor de zekerheid. Wat wegvalt, verdwijnt uit alle lijsten
--    (cancelled_at + merged_into_id), maar telt nergens als "geannuleerd":
--    het heeft geen regels meer, en merged_into_id zegt waar ze naartoe gingen.
--
-- 2. Ongedaan maken (gear_unmerge_bookings): zet de boekingen terug zoals ze
--    waren, met hun eigen regels, klant, project en notitie. Kan zolang de
--    samengevoegde boeking intussen niet gewijzigd is.
--
-- 3. Boeken en meteen toevoegen aan een bestaande boeking
--    (gear_create_booking_into): gear_create_booking en gear_merge_bookings
--    in één transactie, met de bestaande boeking als doel.
--
-- 4. Mail-logboek: soort 'wijziging' (de bevestiging en de annuleringsmail
--    verdwijnen; hun oude rijen blijven staan).
--
-- Additief: één kolom, één tabel, functies. Geen bestaande gegevens gewijzigd.

-- ── 1. Kolom en logboek van samenvoegingen ──────────────────────────────────

alter table public.gear_bookings
  add column if not exists merged_into_id uuid references public.gear_bookings(id) on delete set null;

create table if not exists public.gear_booking_merges (
  id           uuid primary key default gen_random_uuid(),
  target_id    uuid not null references public.gear_bookings(id) on delete cascade,
  absorbed_ids uuid[] not null,
  -- Klant, project en notitie van het doel vóór en na het samenvoegen.
  target_before jsonb not null,
  target_after  jsonb not null,
  -- Welke regel (item) uit welke boeking kwam.
  lines        jsonb not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  undone_at    timestamptz
);
create index if not exists gear_booking_merges_target_idx on public.gear_booking_merges (target_id);

-- Alleen via de functies hieronder.
alter table public.gear_booking_merges enable row level security;
revoke all on public.gear_booking_merges from anon, authenticated;

-- ── 2. Voor wie: dezelfde persoon ───────────────────────────────────────────

-- Een collega, een freelancer, een externe naam (zonder hoofdletters), of —
-- zonder persoon — de klant.
create or replace function public.gear_holder_key(b public.gear_bookings)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when b.booked_for_user_id is not null then 'u:' || b.booked_for_user_id
    when b.freelancer_id      is not null then 'f:' || b.freelancer_id
    when b.external_name      is not null then 'e:' || lower(btrim(b.external_name))
    when b.client_id          is not null then 'c:' || b.client_id
    else 'n:' || coalesce(lower(btrim(b.person_name)), '')
  end
$$;
revoke all on function public.gear_holder_key(public.gear_bookings) from public, anon, authenticated;

-- ── 3. Samenvoegen ──────────────────────────────────────────────────────────

-- De kern, zonder eigen rechtencontrole: die doen de twee publieke functies.
-- p_target_id: welke boeking blijft (null = de oudste).
-- p_keep_from: van welke boeking klant en project blijven (null = het doel).
create or replace function public.gear_merge_core(p_booking_ids uuid[], p_target_id uuid, p_keep_from uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids     uuid[];
  b         public.gear_bookings;
  t         public.gear_bookings;
  k         public.gear_bookings;
  v_key     text;
  v_slot    tsrange;
  v_note    text;
  v_items   uuid[];
  v_lines   jsonb;
  v_absorb  uuid[];
  v_merge   uuid;
  v_conf    text;
begin
  select array_agg(distinct x) into v_ids from unnest(p_booking_ids) x where x is not null;
  if coalesce(array_length(v_ids, 1), 0) < 2 then
    raise exception 'Kies minstens twee boekingen om samen te voegen.' using errcode = '22023';
  end if;

  -- Vastzetten in een vaste volgorde (geen deadlock met een tweede samenvoeging).
  for b in select * from public.gear_bookings where id = any(v_ids) order by id for update loop
    perform public.gear_check_booking_access(b);
    if v_key is null then
      v_key  := public.gear_holder_key(b);
      v_slot := public.gear_slot(b.start_date, b.start_time, b.end_date, b.end_time);
    elsif public.gear_holder_key(b) <> v_key then
      raise exception 'Samenvoegen kan alleen voor boekingen van dezelfde persoon.' using errcode = '22023';
    elsif public.gear_slot(b.start_date, b.start_time, b.end_date, b.end_time) <> v_slot then
      raise exception 'Samenvoegen kan alleen bij exact dezelfde periode (data en uren).' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from public.gear_bookings where id = any(v_ids)) <> array_length(v_ids, 1) then
    raise exception 'Boeking niet gevonden.' using errcode = 'P0002';
  end if;

  if p_target_id is not null and not (p_target_id = any(v_ids)) then
    raise exception 'De boeking die blijft, hoort niet bij de selectie.' using errcode = '22023';
  end if;
  if p_keep_from is not null and not (p_keep_from = any(v_ids)) then
    raise exception 'Kies klant en project uit een van de geselecteerde boekingen.' using errcode = '22023';
  end if;

  select * into t from public.gear_bookings
   where id = coalesce(p_target_id, (select id from public.gear_bookings where id = any(v_ids) order by created_at, id limit 1));
  select * into k from public.gear_bookings where id = coalesce(p_keep_from, t.id);
  v_absorb := array_remove(v_ids, t.id);

  -- Notities samen: het doel eerst, dan de rest op volgorde van aanmaken; elk één keer.
  select string_agg(n, ' · ' order by o, c, i) into v_note from (
    select distinct on (lower(btrim(note))) btrim(note) as n,
           case when id = t.id then 0 else 1 end as o, created_at as c, id as i
      from public.gear_bookings
     where id = any(v_ids) and nullif(btrim(coalesce(note, '')), '') is not null
     order by lower(btrim(note)), case when id = t.id then 0 else 1 end, created_at, id
  ) s;

  -- Voor de zekerheid: niets van alle regels botst met een boeking buiten de selectie.
  select array_agg(item_id) into v_items from public.gear_booking_items where booking_id = any(v_ids);
  select string_agg(i.name || ' (' || coalesce(ob.person_name, 'onbekend') || ')', ', ' order by i.name) into v_conf
    from public.gear_booking_items bi
    join public.gear_items i on i.id = bi.item_id
    join public.gear_bookings ob on ob.id = bi.booking_id
   where bi.item_id = any(coalesce(v_items, '{}')) and not bi.cancelled and bi.slot && v_slot
     and not (bi.booking_id = any(v_ids));
  if v_conf is not null then
    raise exception 'Al geboekt: %', v_conf using errcode = '23P01';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('booking_id', booking_id, 'item_id', item_id)), '[]')
    into v_lines from public.gear_booking_items where booking_id = any(v_absorb);

  insert into public.gear_booking_merges (target_id, absorbed_ids, target_before, target_after, lines, created_by)
  values (
    t.id, v_absorb,
    jsonb_build_object('client_id', t.client_id, 'project_id', t.project_id, 'note', t.note),
    jsonb_build_object('client_id', k.client_id, 'project_id', k.project_id, 'note', v_note),
    v_lines, auth.uid()
  ) returning id into v_merge;

  -- De regels verhuizen naar het doel: zelfde bezetting, zelfde kit.
  update public.gear_booking_items set booking_id = t.id where booking_id = any(v_absorb);

  update public.gear_bookings
     set client_id  = k.client_id,
         project_id = k.project_id,
         note       = v_note
   where id = t.id;

  update public.gear_bookings
     set cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancelled_by_name = public.gear_actor_name(),
         merged_into_id    = t.id
   where id = any(v_absorb);

  return jsonb_build_object('target_id', t.id, 'merge_id', v_merge, 'absorbed_ids', to_jsonb(v_absorb));
end $$;
revoke all on function public.gear_merge_core(uuid[], uuid, uuid) from public, anon, authenticated;

-- Samenvoegen vanuit "Mijn boekingen". Rechten: elke boeking moet je mogen
-- wijzigen (je eigen, niet voorbij; of Beheren voor alles).
create or replace function public.gear_merge_bookings(p_booking_ids uuid[], p_keep_from uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.gear_can('materiaal_reserveren') then
    raise exception 'Geen recht om materiaal te boeken.' using errcode = '42501';
  end if;
  return public.gear_merge_core(p_booking_ids, null, p_keep_from);
end $$;
revoke all on function public.gear_merge_bookings(uuid[], uuid) from public, anon;
grant execute on function public.gear_merge_bookings(uuid[], uuid) to authenticated;

-- ── 4. Ongedaan maken ───────────────────────────────────────────────────────

create or replace function public.gear_unmerge_bookings(p_merge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.gear_booking_merges;
  t public.gear_bookings;
  b public.gear_bookings;
  v_moved uuid[];
begin
  select * into m from public.gear_booking_merges where id = p_merge_id for update;
  if m.id is null then
    raise exception 'Samenvoeging niet gevonden.' using errcode = 'P0002';
  end if;
  if m.undone_at is not null then
    raise exception 'Deze samenvoeging is al ongedaan gemaakt.' using errcode = '22023';
  end if;
  if m.created_by is distinct from auth.uid() and not public.gear_can('reservering_verwijderen') then
    raise exception 'Alleen wie samenvoegde (of een beheerder) kan dit ongedaan maken.' using errcode = '42501';
  end if;

  select * into t from public.gear_bookings where id = m.target_id for update;
  perform public.gear_check_booking_access(t);

  -- Intussen gewijzigd? Dan niet blind terugzetten.
  select array_agg((l ->> 'item_id')::uuid) into v_moved from jsonb_array_elements(m.lines) l;
  if (select count(*) from public.gear_booking_items
       where booking_id = t.id and item_id = any(coalesce(v_moved, '{}'))) <> coalesce(array_length(v_moved, 1), 0)
     or t.client_id  is distinct from (m.target_after ->> 'client_id')::uuid
     or t.project_id is distinct from (m.target_after ->> 'project_id')::uuid
     or t.note       is distinct from (m.target_after ->> 'note') then
    raise exception 'De boeking is intussen gewijzigd; samenvoegen ongedaan maken kan niet meer.' using errcode = '22023';
  end if;
  for b in select * from public.gear_bookings where id = any(m.absorbed_ids) order by id for update loop
    if b.merged_into_id is distinct from t.id then
      raise exception 'Een van de boekingen is intussen gewijzigd; ongedaan maken kan niet meer.' using errcode = '22023';
    end if;
    if b.start_date <> t.start_date or b.end_date <> t.end_date
       or b.start_time is distinct from t.start_time or b.end_time is distinct from t.end_time then
      raise exception 'De periode is intussen gewijzigd; samenvoegen ongedaan maken kan niet meer.' using errcode = '22023';
    end if;
  end loop;

  -- Eerst de boekingen terug (nog zonder regels), dan hun regels.
  update public.gear_bookings
     set cancelled_at = null, cancelled_by = null, cancelled_by_name = null, merged_into_id = null
   where id = any(m.absorbed_ids);

  update public.gear_booking_items bi
     set booking_id = (l ->> 'booking_id')::uuid
    from jsonb_array_elements(m.lines) l
   where bi.booking_id = t.id and bi.item_id = (l ->> 'item_id')::uuid;

  update public.gear_bookings
     set client_id  = (m.target_before ->> 'client_id')::uuid,
         project_id = (m.target_before ->> 'project_id')::uuid,
         note       = m.target_before ->> 'note'
   where id = t.id;

  update public.gear_booking_merges set undone_at = now() where id = m.id;
  return jsonb_build_object('target_id', t.id, 'restored_ids', to_jsonb(m.absorbed_ids));
end $$;
revoke all on function public.gear_unmerge_bookings(uuid) from public, anon;
grant execute on function public.gear_unmerge_bookings(uuid) to authenticated;

-- ── 5. Boeken en toevoegen aan een bestaande boeking ────────────────────────

-- Dezelfde argumenten als gear_create_booking, plus de boeking waaraan het
-- toegevoegd wordt en van welke klant/project blijven ('new' of 'existing').
-- Alles in één transactie: lukt het samenvoegen niet, dan is er ook niet geboekt.
create or replace function public.gear_create_booking_into(
  p_into_booking_id   uuid,
  p_keep              text,
  p_start_date        date,
  p_end_date          date,
  p_item_ids          uuid[] default '{}',
  p_kit_ids           uuid[] default '{}',
  p_excluded_item_ids uuid[] default '{}',
  p_user_id           uuid default null,
  p_freelancer_id     uuid default null,
  p_external_name     text default null,
  p_client_id         uuid default null,
  p_project_id        uuid default null,
  p_note              text default null,
  p_start_time        time default null,
  p_end_time          time default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid;
  v_res jsonb;
begin
  if p_keep not in ('new', 'existing') then
    raise exception 'Kies welke klant en welk project blijven.' using errcode = '22023';
  end if;
  v_new := public.gear_create_booking(
    p_start_date, p_end_date, p_item_ids, p_kit_ids, p_excluded_item_ids, p_user_id, p_freelancer_id,
    p_external_name, p_client_id, p_project_id, p_note, p_start_time, p_end_time);
  v_res := public.gear_merge_core(array[p_into_booking_id, v_new], p_into_booking_id,
                                  case p_keep when 'new' then v_new else p_into_booking_id end);
  return v_res || jsonb_build_object('created_id', v_new);
end $$;
revoke all on function public.gear_create_booking_into(uuid, text, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text, time, time) from public, anon;
grant execute on function public.gear_create_booking_into(uuid, text, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text, time, time) to authenticated;

-- ── 6. Mail-logboek: wijziging ──────────────────────────────────────────────

alter table public.gear_mail_log drop constraint if exists gear_mail_log_kind_check;
alter table public.gear_mail_log add constraint gear_mail_log_kind_check
  check (kind in ('bevestiging', 'herinnering', 'annulering', 'wijziging'));
