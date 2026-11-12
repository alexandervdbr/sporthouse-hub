-- De opmaakkolommen die de planningcode al lang leest en schrijft, maar die
-- nooit in een migratie stonden: bold, text_color en bg_color.
--
-- Zonder deze kolommen faalt elke select (SELECT_COLS in planning-cache.ts) en
-- elke upsert met "column planning_entries.bold does not exist". Het raster
-- toonde daardoor alleen wat in de browsercache stond, opslaan mislukte stil,
-- en de persoonlijke link /p/[token] gaf "Kon je planning niet laden".
--
-- Leeg = de standaard die de code al aanneemt: vet, witte tekst, geen
-- achtergrond. Mag meermaals uitgevoerd worden.

alter table public.planning_entries
  add column if not exists bold       boolean,
  add column if not exists text_color text,
  add column if not exists bg_color   text;

-- PostgREST zijn schemacache verversen, anders blijft de API de kolommen nog
-- even niet kennen.
notify pgrst, 'reload schema';
