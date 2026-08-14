-- Twee dingen die tot nu toe in het naamveld van een reservatie zaten en daar
-- niet horen: het project waarvoor materiaal buiten is, en of een stuk stuk is.

-- ── 1. Defect materiaal ─────────────────────────────────────────────────────
-- Stond tot nu toe als reservatie op naam van "KAPOT", elke dag opnieuw. Het is
-- geen reservatie maar een toestand van het materiaal zelf.
alter table equipment
  add column if not exists is_broken   boolean not null default false,
  add column if not exists broken_note text;

-- ── 2. Vaste projecten ──────────────────────────────────────────────────────
-- Keuzes in het projectveld van een reservatie. show_in_planner bepaalt of het
-- raster het project toont in plaats van de persoon: zo blijven FoS- en
-- De Spor-blokken herkenbaar, terwijl er wél een echte naam onder zit.
create table if not exists equipment_projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  color           text not null default '#3A913F',
  show_in_planner boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

alter table equipment_projects enable row level security;

-- Iedereen die ingelogd is mag de lijst lezen (nodig om te reserveren);
-- aanpassen gebeurt via de API-route, die op beheerdersrechten controleert.
drop policy if exists "Projecten lezen" on equipment_projects;
create policy "Projecten lezen"
  on equipment_projects for select to authenticated using (true);

drop policy if exists "Service role beheert projecten" on equipment_projects;
create policy "Service role beheert projecten"
  on equipment_projects for all to service_role using (true);

insert into equipment_projects (name, color, sort_order) values
  ('FoS',     '#c2410c', 1),
  ('De Spor', '#6d28d9', 2)
on conflict (name) do nothing;
