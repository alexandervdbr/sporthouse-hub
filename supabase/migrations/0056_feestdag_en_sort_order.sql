-- Feestdag terug, sort_order weg.

-- Een feestdag is een dag die niemand werkt, en die hoort dus wél in de
-- cijfers: het is het verschil tussen "deze maand had 20 werkdagen" en
-- "deze maand had er 22". Anders dan NB, dat een roosterafspraak is.
--
-- do update en niet do nothing: bestaat hij al — gearchiveerd, of als
-- werkstatus — dan is dit uitdrukkelijk de opdracht om hem terug te zetten.
insert into planning_presets (name, color, category, in_stats)
values ('Feestdag', '#52525b', 'afwezig', true)
on conflict (name) do update
   set category = 'afwezig',
       in_stats = true,
       archived_at = null;

-- sort_order deed al een tijd niets.
--
-- De route sorteerde erop en accepteerde hem in een PATCH, maar niets zette
-- hem ooit: de beheer-tab sorteert alfabetisch, de statuskiezer ook, en de
-- statistieken zetten verlof en recup vooraan op naam. Drie plekken die
-- beweerden dat je een volgorde kon instellen terwijl dat nergens kon.
--
-- Dit is de enige stap in deze migratie die je niet terugdraait. Wat je
-- kwijtraakt zijn de getallen 1 tot 9 uit de seeds van 0013 en 0044, die
-- nooit ergens zichtbaar zijn geweest.
alter table planning_presets drop column if exists sort_order;
