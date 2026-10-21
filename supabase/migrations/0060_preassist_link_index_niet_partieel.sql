-- De index uit 0059 was partieel, en daar liep het insturen van een link op
-- stuk:
--
--   Fout bij opslaan: there is no unique or exclusion constraint matching
--   the ON CONFLICT specification
--
-- Postgres leidt bij ON CONFLICT (edition_id, url) af wélke index bedoeld is,
-- en een partiële index telt daarvoor alleen mee als je het predicaat
-- meestuurt — ON CONFLICT (edition_id, url) WHERE url IS NOT NULL. De
-- upsert van supabase-js kent alleen kolomnamen, dus dat kan daar niet.
--
-- De voorwaarde was ook nergens voor nodig. In een unieke index zijn NULL's
-- standaard onderling verschillend (nulls distinct), dus de duizenden
-- bestandsrijen met url = null botsen sowieso niet met elkaar. Alleen twee
-- rijen met dezelfde editie én dezelfde url botsen, en dat is precies wat we
-- willen tegenhouden.

begin;

drop index if exists preassist_submissions_edition_url_idx;

create unique index if not exists preassist_submissions_edition_url_idx
  on preassist_submissions (edition_id, url);

commit;
