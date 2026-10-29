-- Kolommen die de app gebruikt maar die nooit in een migratie stonden.
--
-- In de oude database waren ze ooit met de hand toegevoegd. Na het verlies op
-- 28 oktober 2026 werd de database opnieuw opgebouwd uit deze map, en toen
-- ontbraken ze. Gevonden door de kolommen die de code leest en schrijft te
-- vergelijken met wat de database echt heeft. Alleen toevoegen: bestaande
-- data blijft staan, en opnieuw draaien kan geen kwaad.

-- Klantbestanden in een map. Zonder deze kolom faalt elke upload en elke
-- mapweergave bij klantbestanden (/api/files). Een verwijderde map laat zijn
-- bestanden niet verdwijnen: /api/folders verplaatst ze eerst naar de
-- bovenliggende map, en mocht dat ooit overgeslagen worden, dan vallen ze
-- terug naar de hoofdmap van de klant in plaats van mee te gaan.
alter table files
  add column if not exists folder_id uuid references file_folders(id) on delete set null;
create index if not exists files_folder_id_idx on files (folder_id);

-- Submappen gaan mee met hun bovenliggende map. /api/folders rekent daarop
-- ("subfolder rows cascade") — zonder cascade weigert de database een map met
-- submappen te verwijderen.
alter table file_folders drop constraint if exists file_folders_parent_id_fkey;
alter table file_folders
  add constraint file_folders_parent_id_fkey
  foreign key (parent_id) references file_folders(id) on delete cascade;

-- Teamfoto's (Team, Projecten, Chat, gebruikersbeheer).
alter table contacts add column if not exists photo_url text;

-- Extra Asana-projecten voor de Content Planner, zelfde vorm als bij de
-- Briefing Builder: een lijst van { gid, … }.
alter table content_planner_config
  add column if not exists asana_extra_project_gids jsonb default '[]'::jsonb;

-- Stijlvoorbeelden per copy-type in de Copy Generator; null = algemeen.
alter table copy_examples add column if not exists copy_type_name text;
