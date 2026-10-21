-- De Drive-map van een editie onthouden.
--
-- Een editie downloaden haalde elk bestand door onze eigen functie: Drive →
-- functie → browser, en daar in het geheugen tot een zip. Bij dertig mensen
-- die elk een paar video's insturen loopt dat in de gigabytes, en het is
-- precies het soort verbruik waar CLAUDE.md voor waarschuwt.
--
-- Die bestanden staan al in Drive. Google levert een hele map zelf uit —
-- server-side ingepakt, zonder dat er één byte langs ons komt, en zonder de
-- geheugengrens van een tabblad. Daarvoor is alleen de map-id nodig.
--
-- Die berekenen we bij elke upload al (getOrCreateFolderPath), we gooiden hem
-- alleen weg. Hier wordt hij bewaard, zodat de knop niet elke keer opnieuw
-- bij Drive hoeft te vragen.

begin;

alter table preassist_editions
  add column if not exists drive_folder_id text;

commit;
