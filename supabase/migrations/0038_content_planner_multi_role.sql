-- Content Planner: a person could only ever be PM OR Designer, never both
-- (role text CHECK (role IN ('pm','designer')), plus UNIQUE(client_id,
-- contact_email) blocked adding the same person a second time under the
-- other role). One of the new hires can do both jobs, so this replaces the
-- single role with a roles array — same UNIQUE(client_id, contact_email)
-- now means exactly what it should: one row per person, holding whichever
-- role(s) apply.
alter table content_planner_members add column if not exists roles text[];

update content_planner_members set roles = array[role] where roles is null;

alter table content_planner_members alter column roles set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.content_planner_members'::regclass and conname = 'content_planner_members_roles_check'
  ) then
    alter table content_planner_members
      add constraint content_planner_members_roles_check
      check (roles <@ array['pm', 'designer']::text[] and array_length(roles, 1) > 0);
  end if;
end $$;

alter table content_planner_members drop constraint if exists content_planner_members_role_check;
alter table content_planner_members drop column if exists role;
