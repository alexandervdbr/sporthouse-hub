-- Post-launch audit, Medium findings: an enum constraint and a batch of
-- missing indexes on tables added since the last indexing pass (0030),
-- confirmed against actual .eq()/.order()/.filter() call sites in src/.

-- ============================================================
-- 1. freelancer_assignments.status was a closed three-value enum enforced
--    only in application code, in two separate places
--    (src/app/api/portal/assignments/[id]/route.ts,
--    src/app/api/freelancers/[id]/assignments/[assignmentId]/route.ts),
--    with no CHECK backing it — matches the pattern already fixed for
--    clients.category (0023) and reel_inspiration.status (0014).
-- ============================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'freelancer_assignments') then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.freelancer_assignments'::regclass and conname = 'freelancer_assignments_status_check'
    ) then
      alter table freelancer_assignments
        add constraint freelancer_assignments_status_check
        check (status in ('nieuw', 'in_behandeling', 'afgerond'));
    end if;
  end if;
end $$;

-- ============================================================
-- 2. Missing indexes on FK/filter columns
-- ============================================================
create index if not exists chat_messages_channel_id_idx on chat_messages (channel_id);
create index if not exists content_posts_client_id_idx on content_posts (client_id);
create index if not exists file_folders_client_id_idx on file_folders (client_id);
create index if not exists freelancer_assignments_freelancer_id_idx on freelancer_assignments (freelancer_id);
create index if not exists freelancer_projects_freelancer_id_idx on freelancer_projects (freelancer_id);
create index if not exists freelancer_assignment_files_assignment_id_idx on freelancer_assignment_files (assignment_id);
create index if not exists equipment_reservations_equipment_id_idx on equipment_reservations (equipment_id);
create index if not exists equipment_reservations_date_idx on equipment_reservations (date);
create index if not exists project_events_client_id_idx on project_events (client_id);
create index if not exists copy_types_client_id_idx on copy_types (client_id);
create index if not exists liveshift_embargo_docs_client_id_idx on liveshift_embargo_docs (client_id);
create index if not exists preassist_submissions_client_id_idx on preassist_submissions (client_id);
create index if not exists preassist_submissions_edition_id_idx on preassist_submissions (edition_id);
create index if not exists drive_files_client_id_idx on drive_files (client_id);
