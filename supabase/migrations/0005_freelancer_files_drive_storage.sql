-- Drive-opslag voor freelancer-opdrachtbestanden (freelancer_assignment_files),
-- zelfde additive patroon als files/preassist_submissions: bestaande rijen
-- blijven storage_provider = 'supabase' en laden via de oude signed-URL-weg.
alter table freelancer_assignment_files
  add column if not exists storage_provider text default 'supabase',
  add column if not exists drive_file_id text,
  add column if not exists web_view_link text,
  add column if not exists web_content_link text,
  add column if not exists thumbnail_link text;

-- file_url werd altijd ingevuld toen alleen Supabase Storage bestond —
-- Drive-rijen hebben geen storage-pad, dus die kolom moet nullable zijn.
-- Idempotent: no-op als hij al nullable is.
alter table freelancer_assignment_files
  alter column file_url drop not null;
