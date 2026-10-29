-- Materiaalplanning v2: alles wat tot nu toe in code vastlag, wordt
-- instelbaar vanuit Beheer.
--
-- Alleen toevoegingen. De productieversie (main) draait op dezelfde database
-- als de preview en blijft gewoon werken: equipment.category blijft een
-- tekstveld, de nieuwe tabel hangt er via de naam aan.

-- ── 1. Categorieën ──────────────────────────────────────────────────────────
-- Stonden als vaste lijst in EquipmentPlanner.tsx (namen, kleuren, volgorde).
-- Hernoemen in Beheer past ook equipment.category aan, zodat de koppeling op
-- naam klopt.
create table if not exists equipment_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#3A913F',
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists equipment_categories_name_lower_idx
  on equipment_categories (lower(name));

alter table equipment_categories enable row level security;

drop policy if exists "Categorieën lezen" on equipment_categories;
create policy "Categorieën lezen"
  on equipment_categories for select to authenticated using (true);

drop policy if exists "Service role beheert categorieën" on equipment_categories;
create policy "Service role beheert categorieën"
  on equipment_categories for all to service_role using (true);

insert into equipment_categories (name, color, sort_order) values
  ('SET 1 VIDEO',                '#3A913F', 1),
  ('SET 2 VIDEO',                '#34a33a', 2),
  ('SET 3 VIDEO',                '#2eb535', 3),
  ('SET 4 VIDEO',                '#28c730', 4),
  ('SET 5 VIDEO',                '#22d92b', 5),
  ('FOTO',                       '#facc15', 6),
  ('EXTRA LENZEN',               '#0ea5e9', 7),
  ('Tentacle',                   '#a855f7', 8),
  ('Sennheiser',                 '#c084fc', 9),
  ('LICHT',                      '#f59e0b', 10),
  ('GoPro',                      '#22d3ee', 11),
  ('Drone',                      '#38bdf8', 12),
  ('Statieven',                  '#64748b', 13),
  ('Extra',                      '#71717a', 14),
  ('Ballieman + mobiele studio', '#ec4899', 15)
on conflict do nothing;

-- ── 2. Materiaal: volgorde en verantwoordelijke ─────────────────────────────
-- owner: materiaal dat vast bij iemand of een project hoort (bv. De Spor).
-- Anderen kunnen het nog reserveren, maar zien dat het in samenspraak met de
-- verantwoordelijke moet. owner_note vervangt die standaardzin als ingevuld.
alter table equipment
  add column if not exists sort_order int not null default 0,
  add column if not exists owner      text,
  add column if not exists owner_note text;

-- ── 3. Reserveren voor iemand anders ────────────────────────────────────────
-- reserved_by blijft voor wie het is; created_by is wie het ingaf.
alter table equipment_reservations
  add column if not exists created_by text;

-- ── 4. Nooit twee keer hetzelfde stuk op dezelfde dag ───────────────────────
-- De API controleerde dit al, maar twee gelijktijdige klikken konden er
-- allebei doorheen. De tabel is leeg sinds de herstart, dus dit kan zonder
-- opruimen.
create unique index if not exists equipment_reservations_equipment_date_key
  on equipment_reservations (equipment_id, date);
