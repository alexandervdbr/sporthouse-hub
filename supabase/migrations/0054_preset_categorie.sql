-- Werk of afwezig: twee soorten status, en dat verschil doet werk.
--
-- "Thuis gewerkt" slaat nergens op bij Verlof, Ziek of NB, en in de kiezer
-- horen die vier niet tussen de klanten te staan. Tot nu toe was er geen
-- manier om dat te weten zonder op de naam te gokken — en namen raden is
-- precies waar deze planning eerder op stukliep.
--
-- Twee waarden volstaan. Een derde ("intern"? "opleiding"?) voeg je toe
-- wanneer er gedrag aan hangt, niet omdat het netjes oogt: een categorie die
-- nergens iets verandert is een notitie die uit de pas gaat lopen.

alter table planning_presets
  add column if not exists category text not null default 'werk';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'planning_presets_category_check'
  ) then
    alter table planning_presets add constraint planning_presets_category_check
      check (category in ('werk', 'afwezig'));
  end if;
end $$;

-- Backfill. Alles staat door de default al op 'werk'; dit zijn de vier die
-- een afwezigheid zijn. Op naam, eenmalig — daarna is het een veld dat een
-- beheerder zelf zet bij het aanmaken.
update planning_presets
   set category = 'afwezig'
 where category = 'werk'
   and upper(trim(name)) in ('VERLOF', 'ZIEK', 'RECUP', 'NB', 'FEESTDAG', 'SCHOOL');
