-- De planning afschermen in de database, niet alleen in het scherm.
--
-- Tot hier mocht elk ingelogd account elke rij in planning_entries lezen,
-- schrijven en wissen (USING (true), zie schema.sql). Dat gold ook voor
-- freelancer-accounts: de proxy houdt hen weg van /api, maar supabase-js
-- praat rechtstreeks met de database. En de planningkolom per persoon was
-- alleen een beperking van wat het scherm aanbood.
--
-- Vanaf hier:
--   lezen     — wie de planning mag zien (sectie 'planning', open zoals
--               overal: geen permissies ingesteld = toegang), nooit een
--               freelancer;
--   schrijven — wie de planning mag zien én deze rij mag bewerken, volgens
--               dezelfde regels als src/lib/planning-access.ts:
--                 planning_volledig (of beheer)       → elke rij
--                 kolom '__none__'                    → geen enkele
--                 kolom = contact-id                  → alleen die rij
--                 kolom = oude naam / afdeling|naam   → die rij, op naam
--                 geen kolom                          → je eigen rij: het
--                                                       Team-contact met
--                                                       jouw login-e-mail
--
-- Let op: de twee admins in ADMIN_EMAILS (src/lib/auth-permissions.ts) kent
-- de database niet. Zij moeten via Beheer een rol met 'beheer' hebben, anders
-- kunnen ze na deze migratie niet meer in de planning schrijven.
--
-- Uitvoeren NA het deployen van de bijbehorende code, in de SQL-editor.
-- Terugdraaien: onderaan staat het blok dat de oude regels terugzet.

begin;

-- Freelancer-accounts dragen app_metadata.freelancer = true en verder geen
-- permissies. user_has_open_section() zou hen daardoor als "open" doorlaten.
create or replace function public.planning_is_freelancer()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'freelancer') = 'true', false)
$$;

create or replace function public.planning_can_read()
returns boolean
language sql
stable
as $$
  select not public.planning_is_freelancer()
     and public.user_has_open_section('planning')
$$;

-- security definer: hij leest contacts en clients om "je eigen rij" te
-- vinden, los van wat de RLS op die tabellen voor deze gebruiker toelaat.
create or replace function public.planning_can_write(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  kolom text := nullif(trim(coalesce(auth.jwt() -> 'app_metadata' -> 'permissions' ->> 'planning_column', '')), '');
  naam  text;
begin
  if not public.planning_can_read() then
    return false;
  end if;

  if public.user_has_open_section('planning_volledig') then
    return true;
  end if;

  if kolom = '__none__' then
    return false;
  end if;

  if kolom is not null then
    if kolom ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return kolom = target::text;
    end if;
    -- Oude toekenning op naam, eventueel als afdeling|naam.
    naam := case when position('|' in kolom) > 0
                 then substring(kolom from position('|' in kolom) + 1)
                 else kolom end;
    return exists (
      select 1 from contacts c
       where c.id = target
         and lower(trim(c.name)) = lower(trim(naam))
    );
  end if;

  return exists (
    select 1
      from contacts c
      join clients cl on cl.id = c.client_id and cl.category = 'intern'
     where c.id = target
       and c.email is not null
       and lower(trim(c.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
end
$$;

revoke all on function public.planning_can_write(uuid) from public, anon;
grant execute on function public.planning_can_write(uuid) to authenticated;

-- Alle bestaande policies weg, ongeacht hoe ze heten: schema.sql is een
-- verouderde dump, dus op de namen daarin rekenen we niet.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'planning_entries'
  loop
    execute format('drop policy %I on public.planning_entries', p.policyname);
  end loop;
end $$;

alter table public.planning_entries enable row level security;

create policy "planning lezen" on public.planning_entries
  for select to authenticated
  using (public.planning_can_read());

create policy "planning toevoegen" on public.planning_entries
  for insert to authenticated
  with check (public.planning_can_write(contact_id));

create policy "planning wijzigen" on public.planning_entries
  for update to authenticated
  using (public.planning_can_write(contact_id))
  with check (public.planning_can_write(contact_id));

create policy "planning wissen" on public.planning_entries
  for delete to authenticated
  using (public.planning_can_write(contact_id));

commit;

-- ── Terugdraaien (alleen bij problemen) ─────────────────────────────────────
-- begin;
-- drop policy if exists "planning lezen" on public.planning_entries;
-- drop policy if exists "planning toevoegen" on public.planning_entries;
-- drop policy if exists "planning wijzigen" on public.planning_entries;
-- drop policy if exists "planning wissen" on public.planning_entries;
-- create policy "Authenticated users can read planning"   on public.planning_entries for select to authenticated using (true);
-- create policy "Authenticated users can upsert planning" on public.planning_entries for insert to authenticated with check (true);
-- create policy "Authenticated users can update planning" on public.planning_entries for update to authenticated using (true);
-- create policy "Authenticated users can delete planning" on public.planning_entries for delete to authenticated using (true);
-- commit;
