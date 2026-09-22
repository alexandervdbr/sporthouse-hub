-- Post-launch audit, High findings: two independent fixes for the tables
-- 0028 documented but never fully brought in line with the rest of the
-- client-scoped data model.
--
-- ============================================================
-- 1. Client delete cascade
-- ============================================================
-- src/app/api/admin/clients/[id]/route.ts's DELETE handler has claimed
-- "cascades through 15+ tables, no undo" since it was written — true for
-- the original schema, but seven tables added later reference clients(id)
-- with no ON DELETE clause (defaults to blocking the delete instead).
-- Confirmed by the platform owner: bring these in line with how every
-- other client-scoped table already behaves, rather than leaving them as
-- a silent exception that 500s the admin's delete request.
--
-- Constraint names are looked up dynamically (not hardcoded) since 0028
-- created these inline without naming them — safer than guessing
-- Postgres's default "<table>_<column>_fkey" naming and getting it wrong.
do $$
declare
  r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.clients'::regclass
      and conrelid::regclass::text in (
        'project_events', 'content_posts', 'copy_types', 'file_folders',
        'liveshift_embargo_docs', 'preassist_submissions', 'drive_files'
      )
      and confdeltype != 'c' -- skip if already cascade (idempotent re-run)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (client_id) references clients(id) on delete cascade',
      r.tbl, r.conname
    );
  end loop;
end $$;

-- Same gap, same fix, for freelancer_assignment_files.assignment_id ->
-- freelancer_assignments(id) — see src/app/api/freelancers/[id]/
-- assignments/[assignmentId]/route.ts: the DELETE handler already trashes
-- the assignment's Drive/Storage files first, then deletes the assignment
-- row itself, which currently fails (silently — see the paired code fix)
-- whenever the assignment has file rows.
do $$
declare
  r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.freelancer_assignments'::regclass
      and conrelid::regclass::text = 'freelancer_assignment_files'
      and confdeltype != 'c'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (assignment_id) references freelancer_assignments(id) on delete cascade',
      r.tbl, r.conname
    );
  end loop;
end $$;

-- ============================================================
-- 2. Drive-ID audit trail
-- ============================================================
-- The cascade above only ever deletes DATABASE ROWS — nothing in this repo
-- calls the Google Drive API from the client-delete path, so the real files
-- sitting in Drive are never touched or removed by deleting a client. But
-- once the row referencing a drive_file_id/drive_folder_id is gone, the app
-- has no way left to tell you which Drive object it used to point at.
-- Confirmed with the platform owner: keep the real files as an implicit
-- backup, but log the Drive IDs before the row disappears so they can
-- still be found by hand in Drive afterwards.
--
-- A trigger (not app code) so this is a genuine safety net regardless of
-- HOW a row disappears — cascaded from a client delete, a normal delete
-- through the app, the nightly purge-trash cron, or a manual SQL Editor
-- cleanup — not just the one path this fix was requested for.
create table if not exists drive_id_deletion_log (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  record_id uuid not null,
  client_id uuid,
  drive_id text not null,
  kind text not null, -- 'file' | 'folder'
  name text,
  web_view_link text,
  deleted_at timestamptz not null default now()
);
create index if not exists drive_id_deletion_log_client_id_idx on drive_id_deletion_log (client_id);
alter table drive_id_deletion_log enable row level security;
-- Deliberately no policy for `authenticated` — this is an internal recovery
-- log, not a user-facing feature; only the service-role client (or you, in
-- the SQL editor) ever needs to read it:
--   select * from drive_id_deletion_log where client_id = '<id>' order by deleted_at desc;

create or replace function public.log_drive_id_before_delete()
returns trigger
language plpgsql
as $$
begin
  if TG_TABLE_NAME = 'files' and OLD.drive_file_id is not null then
    insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name, web_view_link)
    values ('files', OLD.id, OLD.client_id, OLD.drive_file_id, 'file', OLD.filename, OLD.web_view_link);
  elsif TG_TABLE_NAME = 'file_folders' and OLD.drive_folder_id is not null then
    insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name)
    values ('file_folders', OLD.id, OLD.client_id, OLD.drive_folder_id, 'folder', OLD.name);
  elsif TG_TABLE_NAME = 'drive_files' and OLD.drive_file_id is not null then
    insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name)
    values ('drive_files', OLD.id, OLD.client_id, OLD.drive_file_id, 'file', OLD.name);
  elsif TG_TABLE_NAME = 'preassist_submissions' and OLD.drive_file_id is not null then
    insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name, web_view_link)
    values ('preassist_submissions', OLD.id, OLD.client_id, OLD.drive_file_id, 'file', OLD.file_name, OLD.web_view_link);
  end if;
  return OLD;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'files') then
    drop trigger if exists log_drive_id_before_delete on files;
    create trigger log_drive_id_before_delete before delete on files for each row execute function log_drive_id_before_delete();
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'file_folders') then
    drop trigger if exists log_drive_id_before_delete on file_folders;
    create trigger log_drive_id_before_delete before delete on file_folders for each row execute function log_drive_id_before_delete();
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'drive_files') then
    drop trigger if exists log_drive_id_before_delete on drive_files;
    create trigger log_drive_id_before_delete before delete on drive_files for each row execute function log_drive_id_before_delete();
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'preassist_submissions') then
    drop trigger if exists log_drive_id_before_delete on preassist_submissions;
    create trigger log_drive_id_before_delete before delete on preassist_submissions for each row execute function log_drive_id_before_delete();
  end if;
end $$;

-- ============================================================
-- 3. RLS backstop for the three client-scoped tables still on a blanket
--    using(true)/with check(true) policy
-- ============================================================
-- NOT included here (checked individually, both deliberately locked to the
-- service-role/admin client already, per their own 0028 comments — no
-- direct browser access exists to backstop):
--   - copy_types (RLS enabled, no policies)
--   - file_folders (RLS enabled, no policies)
--   - drive_files (RLS enabled, no policies)
-- Chat (chat_messages/chat_channels) is deliberately excluded too —
-- confirmed with the platform owner this is meant to be fully open to
-- every authenticated staff member, not client-scoped at all.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'project_events') then
    drop policy if exists "Authenticated read" on project_events;
    drop policy if exists "Authenticated insert" on project_events;
    drop policy if exists "Authenticated update" on project_events;
    drop policy if exists "Authenticated delete" on project_events;

    -- client_id is nullable here (an internal, non-client event) — same
    -- convention as projects.client_id in 0024.
    execute 'create policy "Client-scoped read" on project_events for select to authenticated using (client_id is null or user_has_client_access(client_id))';
    execute 'create policy "Client-scoped insert" on project_events for insert to authenticated with check (client_id is null or user_has_client_access(client_id))';
    execute 'create policy "Client-scoped update" on project_events for update to authenticated using (client_id is null or user_has_client_access(client_id))';
    execute 'create policy "Client-scoped delete" on project_events for delete to authenticated using (client_id is null or user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'content_posts') then
    drop policy if exists "Authenticated users full access" on content_posts;

    -- client_id is not null here.
    execute 'create policy "Client-scoped read" on content_posts for select to authenticated using (user_has_client_access(client_id))';
    execute 'create policy "Client-scoped insert" on content_posts for insert to authenticated with check (user_has_client_access(client_id))';
    execute 'create policy "Client-scoped update" on content_posts for update to authenticated using (user_has_client_access(client_id))';
    execute 'create policy "Client-scoped delete" on content_posts for delete to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'liveshift_embargo_docs') then
    drop policy if exists "Authenticated users can manage embargo docs" on liveshift_embargo_docs;

    -- client_id is nullable here — same convention as project_events above.
    execute 'create policy "Client-scoped read" on liveshift_embargo_docs for select to authenticated using (client_id is null or user_has_client_access(client_id))';
    execute 'create policy "Client-scoped insert" on liveshift_embargo_docs for insert to authenticated with check (client_id is null or user_has_client_access(client_id))';
    execute 'create policy "Client-scoped update" on liveshift_embargo_docs for update to authenticated using (client_id is null or user_has_client_access(client_id))';
    execute 'create policy "Client-scoped delete" on liveshift_embargo_docs for delete to authenticated using (client_id is null or user_has_client_access(client_id))';
  end if;
end $$;
