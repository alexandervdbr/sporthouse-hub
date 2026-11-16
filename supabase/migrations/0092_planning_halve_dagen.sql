-- Halve dagen in de planning.
--
-- Een dag blijft één rij per persoon. Staat value_pm leeg, dan geldt value
-- voor de hele dag, zoals altijd. Staat hij ingevuld, dan is value de
-- voormiddag en value_pm de namiddag, elk met hun eigen kleur.
--
-- Bewust geen rij per halve dag: raster, cache, kopiëren, ongedaan maken,
-- wissen, de link en de RLS gaan allemaal uit van één rij per dag, en twee
-- rijen zou het aantal opgehaalde rijen verdubbelen.
--
-- Alleen toevoegen, niets bestaands verandert. Mag meermaals uitgevoerd
-- worden. RLS (0090) werkt per rij en hoeft niet mee te veranderen.

alter table public.planning_entries
  add column if not exists value_pm      text,
  add column if not exists text_color_pm text,
  add column if not exists bg_color_pm   text;

notify pgrst, 'reload schema';
