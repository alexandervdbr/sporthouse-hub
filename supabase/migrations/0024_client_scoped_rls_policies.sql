-- Phase 1, part 2: replace every USING(true)/WITH CHECK(true) policy on a
-- genuinely client-scoped table with a real check against
-- user_has_client_access() (see 0023). This is the actual behavior change —
-- apply 0023 first and confirm it's working before running this one.
--
-- Deliberately NOT included: planning_entries (no client_id column at all —
-- it's shared internal scheduling, not client data, so its USING(true) is
-- correct as-is). project_members has no client_id directly either — it's
-- scoped by joining through projects below.
--
-- Recommended rollout: run this against one table manually first (e.g. just
-- the "documents" block below), log in as a client-restricted test account,
-- confirm it still sees exactly what it should, THEN run the rest.

-- ---------- clients (the root entity itself) ----------
drop policy if exists "Authenticated users can read clients" on clients;
create policy "Authenticated users can read clients"
  on clients for select to authenticated
  using (user_has_client_access(id));

-- ---------- documents ----------
drop policy if exists "Authenticated users can read documents" on documents;
create policy "Authenticated users can read documents"
  on documents for select to authenticated
  using (user_has_client_access(client_id));

-- ---------- files ----------
drop policy if exists "Authenticated users can read files" on files;
create policy "Authenticated users can read files"
  on files for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert files" on files;
create policy "Authenticated users can insert files"
  on files for insert to authenticated
  with check (user_has_client_access(client_id));

-- ---------- meetings ----------
drop policy if exists "Authenticated users can read meetings" on meetings;
create policy "Authenticated users can read meetings"
  on meetings for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert meetings" on meetings;
create policy "Authenticated users can insert meetings"
  on meetings for insert to authenticated
  with check (user_has_client_access(client_id));

-- ---------- projects (client_id is nullable — internal, non-client
--            projects should stay visible to everyone) ----------
drop policy if exists "Authenticated users can read projects" on projects;
create policy "Authenticated users can read projects"
  on projects for select to authenticated
  using (client_id is null or user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert projects" on projects;
create policy "Authenticated users can insert projects"
  on projects for insert to authenticated
  with check (client_id is null or user_has_client_access(client_id));

drop policy if exists "Authenticated users can update projects" on projects;
create policy "Authenticated users can update projects"
  on projects for update to authenticated
  using (client_id is null or user_has_client_access(client_id));

drop policy if exists "Authenticated users can delete projects" on projects;
create policy "Authenticated users can delete projects"
  on projects for delete to authenticated
  using (client_id is null or user_has_client_access(client_id));

-- ---------- project_members (no client_id column — join through projects) ----------
drop policy if exists "Authenticated users can read project_members" on project_members;
create policy "Authenticated users can read project_members"
  on project_members for select to authenticated
  using (exists (
    select 1 from projects p where p.id = project_members.project_id
    and (p.client_id is null or user_has_client_access(p.client_id))
  ));

drop policy if exists "Authenticated users can insert project_members" on project_members;
create policy "Authenticated users can insert project_members"
  on project_members for insert to authenticated
  with check (exists (
    select 1 from projects p where p.id = project_members.project_id
    and (p.client_id is null or user_has_client_access(p.client_id))
  ));

drop policy if exists "Authenticated users can delete project_members" on project_members;
create policy "Authenticated users can delete project_members"
  on project_members for delete to authenticated
  using (exists (
    select 1 from projects p where p.id = project_members.project_id
    and (p.client_id is null or user_has_client_access(p.client_id))
  ));

-- ---------- expert_documents ----------
drop policy if exists "Authenticated users can read expert_documents" on expert_documents;
create policy "Authenticated users can read expert_documents"
  on expert_documents for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert expert_documents" on expert_documents;
create policy "Authenticated users can insert expert_documents"
  on expert_documents for insert to authenticated
  with check (user_has_client_access(client_id));

drop policy if exists "Authenticated users can delete expert_documents" on expert_documents;
create policy "Authenticated users can delete expert_documents"
  on expert_documents for delete to authenticated
  using (user_has_client_access(client_id));

-- ---------- expert_messages ----------
drop policy if exists "Authenticated users can read expert_messages" on expert_messages;
create policy "Authenticated users can read expert_messages"
  on expert_messages for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert expert_messages" on expert_messages;
create policy "Authenticated users can insert expert_messages"
  on expert_messages for insert to authenticated
  with check (user_has_client_access(client_id));

-- ---------- copy_examples ----------
drop policy if exists "Authenticated users can read copy_examples" on copy_examples;
create policy "Authenticated users can read copy_examples"
  on copy_examples for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert copy_examples" on copy_examples;
create policy "Authenticated users can insert copy_examples"
  on copy_examples for insert to authenticated
  with check (user_has_client_access(client_id));

drop policy if exists "Authenticated users can delete copy_examples" on copy_examples;
create policy "Authenticated users can delete copy_examples"
  on copy_examples for delete to authenticated
  using (user_has_client_access(client_id));

-- ---------- posts ----------
drop policy if exists "Authenticated users can read posts" on posts;
create policy "Authenticated users can read posts"
  on posts for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert posts" on posts;
create policy "Authenticated users can insert posts"
  on posts for insert to authenticated
  with check (user_has_client_access(client_id));

-- ---------- biocartis_documents ----------
drop policy if exists "Authenticated users can read biocartis_documents" on biocartis_documents;
create policy "Authenticated users can read biocartis_documents"
  on biocartis_documents for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert biocartis_documents" on biocartis_documents;
create policy "Authenticated users can insert biocartis_documents"
  on biocartis_documents for insert to authenticated
  with check (user_has_client_access(client_id));

drop policy if exists "Authenticated users can delete biocartis_documents" on biocartis_documents;
create policy "Authenticated users can delete biocartis_documents"
  on biocartis_documents for delete to authenticated
  using (user_has_client_access(client_id));

-- ---------- giveaways ----------
drop policy if exists "Authenticated users can read giveaways" on giveaways;
create policy "Authenticated users can read giveaways"
  on giveaways for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert giveaways" on giveaways;
create policy "Authenticated users can insert giveaways"
  on giveaways for insert to authenticated
  with check (user_has_client_access(client_id));

drop policy if exists "Authenticated users can delete giveaways" on giveaways;
create policy "Authenticated users can delete giveaways"
  on giveaways for delete to authenticated
  using (user_has_client_access(client_id));

-- ---------- contacts ----------
drop policy if exists "Authenticated users can read contacts" on contacts;
create policy "Authenticated users can read contacts"
  on contacts for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can insert contacts" on contacts;
create policy "Authenticated users can insert contacts"
  on contacts for insert to authenticated
  with check (user_has_client_access(client_id));

drop policy if exists "Authenticated users can update contacts" on contacts;
create policy "Authenticated users can update contacts"
  on contacts for update to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can delete contacts" on contacts;
create policy "Authenticated users can delete contacts"
  on contacts for delete to authenticated
  using (user_has_client_access(client_id));

-- ---------- content_planner_config / content_planner_members ----------
-- (writes to these already go through the service-role client only —
-- authenticated has no insert/update/delete policy on either, so just the
-- read side needs the real check.)
drop policy if exists "Authenticated users can read content_planner_config" on content_planner_config;
create policy "Authenticated users can read content_planner_config"
  on content_planner_config for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can read content_planner_members" on content_planner_members;
create policy "Authenticated users can read content_planner_members"
  on content_planner_members for select to authenticated
  using (user_has_client_access(client_id));

-- ---------- club_lookup_clubs / club_lookup_competitions ----------
-- (same as content_planner above — read-only for authenticated.)
drop policy if exists "Authenticated users can read club_lookup_clubs" on club_lookup_clubs;
create policy "Authenticated users can read club_lookup_clubs"
  on club_lookup_clubs for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can read club_lookup_competitions" on club_lookup_competitions;
create policy "Authenticated users can read club_lookup_competitions"
  on club_lookup_competitions for select to authenticated
  using (user_has_client_access(client_id));

-- ---------- briefing_builder_config / briefing_builder_members ----------
-- (same — read-only for authenticated.)
drop policy if exists "Authenticated users can read briefing_builder_config" on briefing_builder_config;
create policy "Authenticated users can read briefing_builder_config"
  on briefing_builder_config for select to authenticated
  using (user_has_client_access(client_id));

drop policy if exists "Authenticated users can read briefing_builder_members" on briefing_builder_members;
create policy "Authenticated users can read briefing_builder_members"
  on briefing_builder_members for select to authenticated
  using (user_has_client_access(client_id));

-- ---------- content_planner_push_log ----------
-- (same — read-only for authenticated.)
drop policy if exists "Authenticated users can read content_planner_push_log" on content_planner_push_log;
create policy "Authenticated users can read content_planner_push_log"
  on content_planner_push_log for select to authenticated
  using (user_has_client_access(client_id));
