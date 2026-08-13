-- Soft-delete voor sporthouse_documents (Financiën/Administratie), identiek aan
-- de aanpak voor client-bestanden in 0004_files_trash.sql: verwijderen zet het
-- bestand in de prullenbak van Drive (files.update({trashed:true})) en markeert
-- de rij hier, in plaats van beide meteen weg te gooien.
-- De dagelijkse cron (src/app/api/cron/purge-trash/route.ts) ruimt na 30 dagen
-- definitief op, gelijk aan Google Drive's eigen bewaartermijn.

alter table sporthouse_documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

create index if not exists sporthouse_documents_deleted_at_idx
  on sporthouse_documents (deleted_at);
