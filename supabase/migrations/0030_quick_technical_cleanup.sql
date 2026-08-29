-- Quick technical cleanup from the pre-launch audit's Medium findings —
-- no behavior change, no data change, purely indexes and constraint fixes.

-- ============================================================
-- 1. Missing indexes on columns filtered on every relevant page load
-- ============================================================
create index if not exists documents_client_id_idx on documents (client_id);
create index if not exists files_client_id_idx on files (client_id);
-- The reel gallery loads the whole table unpaginated, sorted by this column.
create index if not exists reel_inspiration_saved_at_idx on reel_inspiration (saved_at);

-- ============================================================
-- 2. equipment_projects.name: same case-sensitive uniqueness gap already
--    fixed for reel_media_types in 0020 — "FoS" and "fos" could otherwise
--    both exist as separate projects.
-- ============================================================
alter table equipment_projects drop constraint if exists equipment_projects_name_key;
create unique index if not exists equipment_projects_name_lower_idx on equipment_projects (lower(name));

-- ============================================================
-- 3. reel_media_types.created_by has no ON DELETE clause, so offboarding
--    anyone who ever added a reel type blocks deleting their auth account.
--    Same fix already applied to reel_inspiration.user_id in 0023.
-- ============================================================
alter table reel_media_types drop constraint if exists reel_media_types_created_by_fkey;
alter table reel_media_types add constraint reel_media_types_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
