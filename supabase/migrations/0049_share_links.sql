-- Korte deellinks: /s/<code> in plaats van een URL met twee ids erin.
--
-- De code wordt in de browser gemaakt en hier geregistreerd, zodat het
-- kopiëren naar het klembord binnen het klikgebaar blijft — Safari weigert
-- een klembordactie die achter een serververzoek aan komt.
--
-- Een code is een wegwijzer, geen sleutel: wie hem heeft maar geen toegang
-- tot de klant of de sectie ziet nog steeds niets. De controle gebeurt bij
-- het openen, niet bij het aanmaken van de link.
create table if not exists share_links (
  code        text primary key,
  client_id   uuid not null references clients(id) on delete cascade,
  -- 'files', 'finance' of 'administration' — het tabblad waar de link heen
  -- wijst, en tegelijk welke tabellen de namen leveren.
  tab         text not null,
  folder_id   uuid,
  file_id     uuid,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- Opzoeken gebeurt altijd op de code; dat is de primary key.
-- Deze index is voor het omgekeerde: bestaat er al een code voor dit doel.
create index if not exists share_links_target_idx
  on share_links (client_id, tab, folder_id, file_id);

alter table share_links enable row level security;
-- Bewust geen policy voor `authenticated`: alleen de service-role-client
-- leest en schrijft hier, net als bij drive_id_deletion_log. De routes doen
-- de toegangscontrole, niet de database.
