-- Inspiratie gaat over links, niet over bestanden.
--
-- Wat mensen delen als inspiratie is bijna altijd een Instagram-post. Dat via
-- een bestandsupload laten lopen betekent: screenshot maken, terugvinden,
-- uploaden — drie stappen voor iets wat één geplakte link is. Het gevolg laat
-- zich raden: dan wordt het niet gebruikt.
--
-- Een inzending kan vanaf hier dus twee dingen zijn, in dezelfde tabel:
--
--   kind = 'file'  — zoals het was, een bestand in Drive
--   kind = 'link'  — een URL, met wat we eromheen kunnen ophalen
--
-- Eén tabel en niet twee, zodat de editiekoppeling, de permissies
-- (preassist_toevoegen / preassist_verwijderen), het groeperen per klant, het
-- verwijderen en de RLS uit 0032 allemaal blijven werken zoals ze werken. Een
-- aparte tabel zou dat allemaal een tweede keer vragen.
--
-- file_name en file_type stonden op not null. Dat klopte zolang elke rij een
-- bestand was; een link heeft ze niet. Ze worden optioneel, en een
-- check-constraint bewaakt wat voorheen de kolomdefinitie deed: een bestand
-- heeft een bestandsnaam, een link heeft een url.

begin;

alter table preassist_submissions
  add column if not exists kind text not null default 'file',
  add column if not exists url text,
  add column if not exists link_author text,
  add column if not exists link_caption text,
  add column if not exists thumbnail_drive_id text,
  -- 'pending' zolang we de titel, auteur en thumbnail nog aan het ophalen
  -- zijn. Het kaartje verschijnt meteen na het plakken en vult zich daarna
  -- aan — dezelfde opzet als reel_inspiration.status (0014), om dezelfde
  -- reden: metadata ophalen bij Instagram duurt te lang om op te wachten.
  add column if not exists link_status text;

alter table preassist_submissions
  alter column file_name drop not null,
  alter column file_type drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'preassist_submissions_kind_check'
  ) then
    alter table preassist_submissions
      add constraint preassist_submissions_kind_check check (kind in ('file', 'link'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'preassist_submissions_shape_check'
  ) then
    alter table preassist_submissions
      add constraint preassist_submissions_shape_check check (
        (kind = 'file' and file_name is not null and file_type is not null)
        or (kind = 'link' and url is not null)
      );
  end if;
end $$;

-- Dezelfde link twee keer insturen in dezelfde editie levert geen tweede
-- kaartje op. Op de genormaliseerde url (zonder Instagram's ?igsh=
-- trackingparameter), want anders is dezelfde post twee keer delen twee
-- verschillende rijen — zie normalizeInstagramUrl in lib/instagram-oembed,
-- waar save-reel al tegen dit probleem aanliep.
create unique index if not exists preassist_submissions_edition_url_idx
  on preassist_submissions (edition_id, url)
  where url is not null;

commit;
