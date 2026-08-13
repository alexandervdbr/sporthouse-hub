-- Echte mappen voor Sporthouse Intern-documenten, zodat de Financiën- en
-- Administratie-tabs exact hetzelfde werken als de klantbestanden.
-- Spiegelt file_folders, met één verschil: klantbestanden zijn gegroepeerd per
-- client_id, deze per section ('finance' | 'administration'), want dat is hier
-- de bovenste laag in Drive (Sporthouse Intern / finance | administration).
--
-- drive_folder_id wordt lui gevuld bij de eerste upload in een map — zie
-- resolveSporthouseDriveFolderId in src/lib/sporthouse-docs-drive.ts.

create table if not exists sporthouse_document_folders (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('finance', 'administration')),
  name text not null,
  parent_id uuid references sporthouse_document_folders(id) on delete cascade,
  drive_folder_id text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists sporthouse_document_folders_section_parent_idx
  on sporthouse_document_folders (section, parent_id);

alter table sporthouse_document_folders enable row level security;

-- Alle toegang loopt via permissie-gecontroleerde API-routes met de service
-- role; net als drive_folders krijgt niemand anders rechtstreeks toegang.
drop policy if exists "Service role full access sporthouse_document_folders" on sporthouse_document_folders;
create policy "Service role full access sporthouse_document_folders"
  on sporthouse_document_folders for all to service_role using (true);

alter table sporthouse_documents
  add column if not exists folder_id uuid references sporthouse_document_folders(id) on delete set null;

create index if not exists sporthouse_documents_folder_id_idx
  on sporthouse_documents (folder_id);
