-- Tijdelijke medewerkers: stagiairs en weekendstudenten.
--
-- Het platform wist al wanneer een stagiair vertrekt — elk account heeft een
-- `expires_at` en een dagelijkse cron verwijdert het op die datum. Maar die
-- datum zit op het account, en het account is niet de persoon: de contactrij
-- en de plek in het planningsrooster overleven hem. Daardoor verdween in
-- oktober 2026 de login van een dozijn oud-stagiairs netjes op tijd, terwijl
-- ze zelf in Team én in de planning bleven staan.
--
-- De einddatum hoort dus bij de persoon, niet bij zijn login. Dat lost meteen
-- het tweede geval op: een weekendstudent heeft vaak helemaal geen account,
-- en kon daarom nergens een einde hebben.
--
-- Twee velden volstaan.
--
-- `employment_type` is de contractvorm, niet de functie. `role` blijft waar
-- het voor bedoeld is ("Content Creator", "Account Manager"); daar stond
-- "Stagiair" tussen, en zulke velden worden onbruikbaar als je er twee dingen
-- in propt.
--
-- `active_until` leeg betekent onbepaald. Gevuld betekent: vanaf die dag telt
-- deze persoon als inactief. Eén veld voor twee werkwijzen, omdat de schermen
-- erop verschillen en het veld niet:
--
--   * stagiair — een datum, ingevuld bij het aannemen, die zichzelf regelt
--   * student  — een schakelaar "actief", die de datum op vandaag zet of wist
--
-- Bewust géén tabel met periodegeschiedenis. Wie wanneer gewerkt heeft staat
-- al veel preciezer in planning_entries, per dag. Een tweede administratie
-- daarnaast zou alleen maar kunnen gaan afwijken.

alter table contacts add column if not exists employment_type text not null default 'vast';
alter table contacts add column if not exists active_until date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_employment_type_check'
  ) then
    alter table contacts add constraint contacts_employment_type_check
      check (employment_type in ('vast', 'stagiair', 'student'));
  end if;
end $$;

-- Backfill. Iedereen staat door de default al op 'vast'; alleen wie in zijn
-- functietitel "stagiair" heeft staan wordt verzet. Dat is op dit moment één
-- persoon, en zijn einddatum laten we leeg — die weet alleen een mens.
update contacts
   set employment_type = 'stagiair'
 where employment_type = 'vast'
   and role is not null
   and lower(trim(role)) = 'stagiair';
