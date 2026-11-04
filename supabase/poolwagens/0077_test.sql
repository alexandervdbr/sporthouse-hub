-- Test van 0077: vervangen door supabase/poolwagens/0079_test.sql.
--
-- De oorspronkelijke test vroeg een bestaand project, en die zijn er niet
-- (projecten worden in Asana gepland). Sinds 0079 hebben de reservatie-
-- functies bovendien een andere signatuur (klant in plaats van project).
-- 0079_test.sql test hetzelfde (reserveren, overlap, ritten, km, Nu
-- vertrekken, te laat terug, beheer, blokkade, rechten) plus de klant.
-- De oude versie staat in de git-geschiedenis (commit 8d96fc3).

select 'Vervangen door 0079_test.sql' as resultaat;
