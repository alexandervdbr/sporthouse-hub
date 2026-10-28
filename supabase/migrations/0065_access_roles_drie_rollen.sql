-- Drie rollen in plaats van vier, plus twee instellingen per rol.
--
-- client_scope: 'all' ziet alle klanten (tenzij per persoon beperkt),
--   'chosen' alleen de klanten die per persoon zijn aangevinkt. Bij 'chosen'
--   zet de server een onbestaand id in de lijst als er niets is aangevinkt,
--   omdat een lege lijst overal "alles" betekent (zie NO_CLIENTS in
--   src/lib/access-roles.ts). De RLS hoeft daardoor niet te veranderen.
-- requires_end_date: een account met deze rol moet een vervaldatum hebben.
--
-- Zet de niveaus van stagiair/medewerker/admin op het afgesproken voorstel
-- (28 oktober 2026). Wat al in Beheer → Rollen was aangepast, wordt dus
-- overschreven — daarna kan je het daar weer aanpassen.

alter table access_roles
  add column if not exists client_scope text not null default 'all',
  add column if not exists requires_end_date boolean not null default false;

alter table access_roles drop constraint if exists access_roles_client_scope_check;
alter table access_roles add constraint access_roles_client_scope_check
  check (client_scope in ('all', 'chosen'));

insert into access_roles (id, label, color, sort_order, client_scope, requires_end_date, levels) values
  ('stagiair', 'Stagiair', '#f59e0b', 10, 'chosen', true, '{
    "dashboard": "aan", "projecten": "aan", "chat": "aan", "welkom_stagiair": "aan", "googlephotos": "aan",
    "team": "bekijken", "planning": "bewerken", "contentkalender": "toevoegen",
    "klanten": "gebruiken", "materiaal": "reserveren", "preassist": "bijdragen", "mijn-gedacht": "gebruiken"
  }'),
  ('medewerker', 'Medewerker', '#06b6d4', 20, 'all', false, '{
    "dashboard": "aan", "projecten": "aan", "chat": "aan", "vergaderingen": "aan", "googlephotos": "aan",
    "team": "bekijken", "freelancers": "beheren", "planning": "bewerken", "contentkalender": "toevoegen",
    "klanten": "bewerken", "materiaal": "reserveren", "preassist": "bijdragen", "mijn-gedacht": "beheren",
    "wachtwoorden": "beheren"
  }'),
  ('admin', 'Admin', '#22c55e', 30, 'all', false, '{
    "dashboard": "aan", "projecten": "aan", "chat": "aan", "vergaderingen": "aan", "welkom_stagiair": "aan", "googlephotos": "aan",
    "team": "beheren", "freelancers": "beheren", "planning": "statistieken", "projectkalender": "beheren",
    "contentkalender": "beheren", "klanten": "beheren", "materiaal": "beheren", "preassist": "beheren",
    "mijn-gedacht": "beheren", "wachtwoorden": "beheren", "financien": "beheren", "administratie": "beheren",
    "beheer": "aan"
  }')
on conflict (id) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order,
  client_scope = excluded.client_scope,
  requires_end_date = excluded.requires_end_date,
  levels = excluded.levels,
  updated_at = now();

-- Creator verdwijnt, maar alleen als niemand hem nog heeft. Heeft iemand hem
-- wel, dan blijft hij staan en geef je die mensen eerst een andere rol.
delete from access_roles
where id = 'creator'
  and not exists (select 1 from auth.users where raw_app_meta_data ->> 'role' = 'creator');
