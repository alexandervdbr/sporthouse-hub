-- De tijdstempel op planning_entries werd door de browser gezet, met
-- `new Date().toISOString()` bij het opslaan. Dat is de klok van wie
-- toevallig bewerkt, niet die van de database.
--
-- Dat maakt uit, want er wordt op gezocht: de planning haalt alleen op wat
-- nieuwer is dan wat ze al heeft. Loopt iemands laptop vijf minuten achter,
-- dan krijgen zijn wijzigingen een tijdstempel in het verleden en slaat die
-- vraag ze over — de wijziging is opgeslagen maar verschijnt bij niemand.
-- Het aantal rijen verandert niet, dus ook de controle daarop merkt het niet.
--
-- Vanaf nu zet de database hem, bij elke insert en elke update. Eén klok,
-- die van Postgres, en de browser kan er niet meer naast zitten.
create or replace function public.set_planning_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_planning_updated_at on planning_entries;
create trigger set_planning_updated_at
  before insert or update on planning_entries
  for each row execute function public.set_planning_updated_at();
