-- Freelancers: de database volgt de twee niveaus van de app.
--
-- Fase 1 van het herontwerp (docs/freelancers-redesign.md). Tot hier:
--   freelancers          select/insert voor elk ingelogd account (0028);
--                        update/delete al op 'freelancers' (0039)
--   freelancer_projects  select/insert/delete voor elk ingelogd account (0028)
-- Een collega zonder freelancerrecht kon dus via PostgREST rechtstreeks de
-- contactgegevens, tarieven en notities van elke freelancer lezen, en
-- freelancers en projecten aanmaken of projecten wissen.
--
-- Vanaf hier:
--   lezen   — 'freelancers_bekijken' of 'freelancers'
--   wijzigen — 'freelancers' (= het niveau Beheren)
--
-- Achterwaarts compatibel: 'freelancers' was vóór deze wijziging het enige
-- niveau (Beheren) en blijft dat. Wie het heeft, mag dus ook lezen, ook als
-- zijn sleutellijst 'freelancers_bekijken' nog niet bevat — dezelfde regel
-- als IMPLIED_SECTIONS in src/lib/auth-permissions.ts. Er gaat bij niemand
-- een recht verloren; auth.users wordt niet aangeraakt.
--
-- user_has_section (0025) is deny-by-default: een account zonder
-- permissions-object krijgt niets. Admins ('beheer') mogen alles.
--
-- freelancer_assignments en freelancer_assignment_files: ongewijzigd. RLS
-- staat aan zonder policies, dus enkel de service-role (de API-routes, die
-- zelf controleren) komt erbij.
--
-- De materiaalplanner koos freelancers uit met de client van de gebruiker en
-- zou na deze migratie een lege lijst krijgen voor wie geen freelancerrecht
-- heeft. Daarom freelancer_picker(): alleen id en naam, voor wie de
-- materiaalplanner mag zien. Een boeking verwijst al naar freelancers(id)
-- (gear_bookings.freelancer_id, 0072) — er verandert niets aan hoe ze
-- opgeslagen wordt.

-- ── Helper ──────────────────────────────────────────────────────────────────

create or replace function public.user_can_view_freelancers()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.user_has_section('freelancers_bekijken')
      or public.user_has_section('freelancers')
$$;

-- ── freelancers ─────────────────────────────────────────────────────────────

drop policy if exists "Auth read freelancers"   on public.freelancers;
drop policy if exists "Auth insert freelancers" on public.freelancers;
drop policy if exists "freelancers can view freelancers"   on public.freelancers;
drop policy if exists "freelancers section can insert freelancers" on public.freelancers;

create policy "freelancers can view freelancers" on public.freelancers
  for select to authenticated
  using (public.user_can_view_freelancers());

create policy "freelancers section can insert freelancers" on public.freelancers
  for insert to authenticated
  with check (public.user_has_section('freelancers'));

-- update/delete: de policies uit 0039 blijven ("freelancers section can
-- update/delete freelancers", op user_has_section('freelancers')).

-- ── freelancer_projects ─────────────────────────────────────────────────────

drop policy if exists "Auth read freelancer_projects"   on public.freelancer_projects;
drop policy if exists "Auth insert freelancer_projects" on public.freelancer_projects;
drop policy if exists "Auth delete freelancer_projects" on public.freelancer_projects;
drop policy if exists "freelancers can view freelancer_projects"   on public.freelancer_projects;
drop policy if exists "freelancers section can insert freelancer_projects" on public.freelancer_projects;
drop policy if exists "freelancers section can delete freelancer_projects" on public.freelancer_projects;

create policy "freelancers can view freelancer_projects" on public.freelancer_projects
  for select to authenticated
  using (public.user_can_view_freelancers());

create policy "freelancers section can insert freelancer_projects" on public.freelancer_projects
  for insert to authenticated
  with check (public.user_has_section('freelancers'));

create policy "freelancers section can delete freelancer_projects" on public.freelancer_projects
  for delete to authenticated
  using (public.user_has_section('freelancers'));

-- ── Keuzelijst voor de materiaalplanner ─────────────────────────────────────
--
-- security definer, want de lezer heeft meestal geen freelancerrecht. Geeft
-- bewust alleen id en naam: geen e-mail, telefoon, tarief of notities.
-- gear_can('materiaal') is dezelfde poort als requireGear('view') in
-- /api/materiaal/options (0071): wie de materiaalplanner niet mag zien,
-- krijgt een lege lijst.
--
-- "Niet-gearchiveerd" bestaat nog niet (freelancers.archived_at komt in
-- 0093); die migratie vervangt deze functie met de filter erbij.

create or replace function public.freelancer_picker()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.name
  from public.freelancers f
  where public.gear_can('materiaal')
  order by f.name
$$;

revoke all on function public.freelancer_picker() from public, anon;
grant execute on function public.freelancer_picker() to authenticated;
