-- Rollen voor het beheerscherm.
--
-- Een rol is een naam, een kleur en per onderdeel een niveau (zie
-- src/lib/access-roles.ts voor de onderdelen en wat elk niveau toestaat).
-- De rol zelf wordt nergens gecontroleerd: bij opslaan rekent de server de
-- niveaus om naar de bestaande sleutellijst in app_metadata.permissions, en
-- alle pagina's, routes en policies lezen die lijst zoals voorheen. Deze
-- tabel is dus puur de bron voor dat scherm — vandaar dat alleen de service
-- role erbij mag, net als bij de andere beheertabellen.
--
-- Volledig additief: niets bestaands wordt aangeraakt.

create table if not exists access_roles (
  id text primary key,
  label text not null,
  color text not null default '#71717a',
  levels jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table access_roles enable row level security;

drop policy if exists "Service role full access access_roles" on access_roles;
create policy "Service role full access access_roles"
  on access_roles for all to service_role using (true);

-- Startpunt. Bewust zo gekozen dat elke rol alles van de rol ervoor heeft;
-- de oude presets liepen door elkaar (Creator mocht meer dan Medewerker).
-- Aan te passen in Beheer → Rollen.
insert into access_roles (id, label, color, sort_order, levels) values
  ('stagiair', 'Stagiair', '#f59e0b', 10, '{
    "dashboard": "aan", "chat": "aan", "welkom_stagiair": "aan",
    "team": "bekijken", "preassist": "bijdragen"
  }'),
  ('creator', 'Creator', '#3b82f6', 20, '{
    "dashboard": "aan", "projecten": "aan", "chat": "aan", "vergaderingen": "aan", "googlephotos": "aan",
    "team": "bekijken", "planning": "bekijken", "projectkalender": "toevoegen", "contentkalender": "toevoegen",
    "klanten": "bewerken", "materiaal": "reserveren", "preassist": "bijdragen", "mijn-gedacht": "beheren",
    "wachtwoorden": "toevoegen"
  }'),
  ('medewerker', 'Medewerker', '#06b6d4', 30, '{
    "dashboard": "aan", "projecten": "aan", "chat": "aan", "vergaderingen": "aan", "googlephotos": "aan",
    "team": "bekijken", "planning": "bewerken", "projectkalender": "toevoegen", "contentkalender": "toevoegen",
    "klanten": "bewerken", "materiaal": "reserveren", "preassist": "bijdragen", "mijn-gedacht": "beheren",
    "wachtwoorden": "toevoegen"
  }'),
  ('admin', 'Admin', '#22c55e', 40, '{
    "dashboard": "aan", "projecten": "aan", "chat": "aan", "vergaderingen": "aan", "welkom_stagiair": "aan", "googlephotos": "aan",
    "team": "beheren", "freelancers": "beheren", "planning": "statistieken", "projectkalender": "beheren",
    "contentkalender": "beheren", "klanten": "beheren", "materiaal": "beheren", "preassist": "beheren",
    "mijn-gedacht": "beheren", "wachtwoorden": "beheren", "financien": "beheren", "administratie": "beheren",
    "beheer": "aan"
  }')
on conflict (id) do nothing;
