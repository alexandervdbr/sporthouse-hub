-- Vaste kleur-presets voor de planning (SHG, FOS, …). Eén tik zet zowel de
-- tekst als de achtergrondkleur van een cel, in plaats van los typen en dan
-- apart een kleur uit het palet kiezen.

create table if not exists planning_presets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table planning_presets enable row level security;

-- Iedereen die ingelogd is mag ze lezen om de knopjes te tonen; aanpassen
-- gebeurt via de API-route, die op beheer-rechten controleert.
drop policy if exists "Presets lezen" on planning_presets;
create policy "Presets lezen"
  on planning_presets for select to authenticated using (true);

drop policy if exists "Service role beheert presets" on planning_presets;
create policy "Service role beheert presets"
  on planning_presets for all to service_role using (true);

-- Groen en oranje die al in het bestaande kleurenpalet van de planning staan,
-- zodat SHG en FOS er meteen herkenbaar uitzien.
insert into planning_presets (name, color, sort_order) values
  ('SHG', '#16a34a', 1),
  ('FOS', '#ea580c', 2)
on conflict (name) do nothing;
