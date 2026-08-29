-- src/app/api/drive/route.ts (native Google Docs/Sheets/Slides per client,
-- surfaced via DriveManager) reads/writes a `drive_files` table that turned
-- out not to exist in the live database at all (discovered during Phase 5's
-- schema audit) — every call to this route has been silently failing.
-- Shape matches exactly what the route already selects/inserts/updates.
create table if not exists drive_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  drive_file_id text not null,
  name text not null,
  mime_type text not null,
  created_by text,
  created_at timestamptz default now()
);

-- RLS enabled, no policies — matches the app's own access model here: the
-- route always uses the service-role/admin client and does its own
-- clientId/hasClientAccess check in TypeScript (see Phase 2), the same
-- pattern already used for file_folders, copy_types, planning_config, etc.
alter table drive_files enable row level security;
