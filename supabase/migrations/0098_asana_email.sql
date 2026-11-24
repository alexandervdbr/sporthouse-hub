-- Asana-adres per persoon.
--
-- De Asana-push (Content Planner, Briefing Builder) zoekt iemand in Asana op
-- via zijn mailadres in de hub. Wie zich bij Asana met een ander adres
-- aanmeldde, werd niet gevonden en kreeg geen taak. Leeg laten betekent:
-- hetzelfde adres als in de hub. Zie src/lib/asana.ts.
--
-- Bij de persoon en niet bij het lid van één tool, zodat het één keer
-- ingesteld wordt voor alle tools die naar Asana pushen.

alter table contacts add column if not exists asana_email text;
