-- Eigen secties in de kennisbank, naast de vaste vragenlijst.
--
-- Sommige klanten hebben afspraken die geen antwoord zijn op een vraag: de
-- embargoregels van Pro League, een liveshift-workflow, welke content naar welk
-- kanaal gaat. Die krijgen een eigen titel in plaats van samengeperst te worden
-- in één vrij tekstveld.
--
-- Zelfde tabel als de antwoorden: een eigen sectie is een rij met een
-- question_key die begint met 'custom:' en een ingevulde titel. Zo blijft er
-- één plek waar de kennis van een klant staat.

alter table client_knowledge
  add column if not exists title      text,
  add column if not exists sort_order int not null default 0;
