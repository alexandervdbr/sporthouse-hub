-- Freelancers: samenwerkingen weer beschrijfbaar (docs/freelancers-overzicht.md, B1 en B7).
--
-- 0093 haalde de insert-policy op freelancer_projects weg, want toen werd een
-- project een opdracht. Dat plan is verlaten: freelancer_projects is weer de
-- lijst "samenwerkingen", en die moet je kunnen toevoegen, bewerken en
-- verwijderen met het niveau Beheren.
--
--   lezen    user_can_view_freelancers()          (0092, ongewijzigd)
--   toevoegen, wijzigen, verwijderen  user_has_section('freelancers')
--
-- B7: een freelancer hard verwijderen neemt zijn samenwerkingen mee. Daarvoor
-- wordt de verwijzing freelancer_projects.freelancer_id → freelancers(id)
-- "on delete cascade". Zonder dat zou de route eerst de samenwerkingen en dan
-- de freelancer moeten wissen, in twee stappen.
--
-- Alleen toevoegen en een verwijzing vervangen: er verdwijnt geen tabel,
-- kolom of rij. Herhaalbaar.

-- ── Policies ────────────────────────────────────────────────────────────────

drop policy if exists "freelancers section can insert freelancer_projects" on public.freelancer_projects;
drop policy if exists "freelancers section can update freelancer_projects" on public.freelancer_projects;

create policy "freelancers section can insert freelancer_projects" on public.freelancer_projects
  for insert to authenticated
  with check (public.user_has_section('freelancers'));

create policy "freelancers section can update freelancer_projects" on public.freelancer_projects
  for update to authenticated
  using (public.user_has_section('freelancers'))
  with check (public.user_has_section('freelancers'));

-- select ("freelancers can view freelancer_projects") en delete ("freelancers
-- section can delete freelancer_projects") blijven zoals 0092 ze zette.

-- ── Verwijzing naar de freelancer: on delete cascade ────────────────────────

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.freelancer_projects'::regclass
       and contype = 'f'
       and confrelid = 'public.freelancers'::regclass
  loop
    execute format('alter table public.freelancer_projects drop constraint %I', c);
  end loop;
end $$;

alter table public.freelancer_projects
  add constraint freelancer_projects_freelancer_id_fkey
  foreign key (freelancer_id) references public.freelancers(id) on delete cascade;
