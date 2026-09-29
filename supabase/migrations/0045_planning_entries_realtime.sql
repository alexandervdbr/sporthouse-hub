-- Live sync for the planner: adds planning_entries to the realtime
-- publication so other open sessions see edits as they happen, instead of
-- only after navigating away and back.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_entries'
  ) then
    alter publication supabase_realtime add table planning_entries;
  end if;
end $$;

-- Realtime only sends the primary key for a DELETE's "old row" by default —
-- not enough to know which cell was cleared (identity here is the
-- year/month/day/department/employee combo, not a single id column). Full
-- replica identity includes every column on both UPDATE and DELETE.
alter table planning_entries replica identity full;
