-- Persoonlijke planningslinks voor weekendstudenten.
--
-- Zij hebben geen account en krijgen er ook geen. Dat is een bewuste keuze:
-- een account betekent hier een Supabase-sessie, en planning_entries staat
-- open voor elke ingelogde gebruiker (zie 0024 — terecht, want tot nu toe was
-- iedereen met een login een collega). Vijftien studenten een account geven
-- zou die aanname breken, en dan zou eerst het rechtenmodel om moeten.
--
-- Een link in plaats van een login lost dat op: er is geen sessie, dus er valt
-- niets te omzeilen. De server leest uit de token wie het is en geeft precies
-- die ene rij terug.
--
-- Let op het verschil met share_links. Die code is een wegwijzer: wie hem
-- heeft moet nog steeds inloggen en toegang hebben. Dit token is wél de
-- sleutel — wie hem heeft ziet die planning. Daarom wordt hij op de server
-- gemaakt uit 24 willekeurige bytes, en niet in de browser zoals daar.
--
-- Het token staat onversleuteld in deze tabel, zodat een beheerder de link
-- opnieuw kan doorsturen zonder een nieuwe te moeten maken. Dat is een bewuste
-- ruil: wat erachter zit is het werkrooster van één persoon, en een link die
-- je niet kan terugvinden wordt in de praktijk een tweede link.

create table if not exists planning_links (
  token        text primary key,
  -- Dezelfde sleutel als planning_entries: (afdeling, naam). Geen verwijzing
  -- naar contacts, want een weekendstudent hoeft daar niet per se in te staan.
  department   text not null,
  employee     text not null,
  created_by   text,
  created_at   timestamptz not null default now(),
  -- Ingetrokken links blijven staan in plaats van verwijderd te worden: zo
  -- weet je achteraf nog dat er een link was en wie hem maakte.
  revoked_at   timestamptz,
  last_seen_at timestamptz
);

-- Opzoeken gebeurt op de token (primary key). Deze index is voor de
-- beheerlijst: welke links bestaan er voor deze persoon.
create index if not exists planning_links_person_idx
  on planning_links (department, employee);

alter table planning_links enable row level security;
-- Bewust geen policy voor `authenticated`. Alleen de service-role-client raakt
-- deze tabel aan; de routes doen de controle, niet de database. Een token dat
-- door een gewone ingelogde gebruiker uitleesbaar zou zijn is geen geheim.
