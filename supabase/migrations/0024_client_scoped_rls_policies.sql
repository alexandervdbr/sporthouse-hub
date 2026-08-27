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
-- Every block below is guarded by an existence check: schema.sql is a
-- stale, partially-applied baseline dump (confirmed live — biocartis_documents
-- is in schema.sql but doesn't actually exist in production), so this can't
-- assume every table it describes is real. A guarded block simply does
-- nothing for a table that isn't there, instead of erroring the whole
-- migration out partway through.
--
-- Recommended rollout: run this against one table manually first (e.g. just
-- the "documents" block below), log in as a client-restricted test account,
-- confirm it still sees exactly what it should, THEN run the rest.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients') then
    execute 'drop policy if exists "Authenticated users can read clients" on clients';
    execute 'create policy "Authenticated users can read clients" on clients for select to authenticated using (user_has_client_access(id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'documents') then
    execute 'drop policy if exists "Authenticated users can read documents" on documents';
    execute 'create policy "Authenticated users can read documents" on documents for select to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'files') then
    execute 'drop policy if exists "Authenticated users can read files" on files';
    execute 'create policy "Authenticated users can read files" on files for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert files" on files';
    execute 'create policy "Authenticated users can insert files" on files for insert to authenticated with check (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meetings') then
    execute 'drop policy if exists "Authenticated users can read meetings" on meetings';
    execute 'create policy "Authenticated users can read meetings" on meetings for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert meetings" on meetings';
    execute 'create policy "Authenticated users can insert meetings" on meetings for insert to authenticated with check (user_has_client_access(client_id))';
  end if;

  -- projects: client_id is nullable — internal, non-client projects stay
  -- visible to everyone.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'projects') then
    execute 'drop policy if exists "Authenticated users can read projects" on projects';
    execute 'create policy "Authenticated users can read projects" on projects for select to authenticated using (client_id is null or user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert projects" on projects';
    execute 'create policy "Authenticated users can insert projects" on projects for insert to authenticated with check (client_id is null or user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can update projects" on projects';
    execute 'create policy "Authenticated users can update projects" on projects for update to authenticated using (client_id is null or user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can delete projects" on projects';
    execute 'create policy "Authenticated users can delete projects" on projects for delete to authenticated using (client_id is null or user_has_client_access(client_id))';
  end if;

  -- project_members: no client_id column — join through projects.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'project_members') then
    execute 'drop policy if exists "Authenticated users can read project_members" on project_members';
    execute $q$create policy "Authenticated users can read project_members" on project_members for select to authenticated using (exists (select 1 from projects p where p.id = project_members.project_id and (p.client_id is null or user_has_client_access(p.client_id))))$q$;
    execute 'drop policy if exists "Authenticated users can insert project_members" on project_members';
    execute $q$create policy "Authenticated users can insert project_members" on project_members for insert to authenticated with check (exists (select 1 from projects p where p.id = project_members.project_id and (p.client_id is null or user_has_client_access(p.client_id))))$q$;
    execute 'drop policy if exists "Authenticated users can delete project_members" on project_members';
    execute $q$create policy "Authenticated users can delete project_members" on project_members for delete to authenticated using (exists (select 1 from projects p where p.id = project_members.project_id and (p.client_id is null or user_has_client_access(p.client_id))))$q$;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'expert_documents') then
    execute 'drop policy if exists "Authenticated users can read expert_documents" on expert_documents';
    execute 'create policy "Authenticated users can read expert_documents" on expert_documents for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert expert_documents" on expert_documents';
    execute 'create policy "Authenticated users can insert expert_documents" on expert_documents for insert to authenticated with check (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can delete expert_documents" on expert_documents';
    execute 'create policy "Authenticated users can delete expert_documents" on expert_documents for delete to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'expert_messages') then
    execute 'drop policy if exists "Authenticated users can read expert_messages" on expert_messages';
    execute 'create policy "Authenticated users can read expert_messages" on expert_messages for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert expert_messages" on expert_messages';
    execute 'create policy "Authenticated users can insert expert_messages" on expert_messages for insert to authenticated with check (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'copy_examples') then
    execute 'drop policy if exists "Authenticated users can read copy_examples" on copy_examples';
    execute 'create policy "Authenticated users can read copy_examples" on copy_examples for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert copy_examples" on copy_examples';
    execute 'create policy "Authenticated users can insert copy_examples" on copy_examples for insert to authenticated with check (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can delete copy_examples" on copy_examples';
    execute 'create policy "Authenticated users can delete copy_examples" on copy_examples for delete to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'posts') then
    execute 'drop policy if exists "Authenticated users can read posts" on posts';
    execute 'create policy "Authenticated users can read posts" on posts for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert posts" on posts';
    execute 'create policy "Authenticated users can insert posts" on posts for insert to authenticated with check (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'biocartis_documents') then
    execute 'drop policy if exists "Authenticated users can read biocartis_documents" on biocartis_documents';
    execute 'create policy "Authenticated users can read biocartis_documents" on biocartis_documents for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert biocartis_documents" on biocartis_documents';
    execute 'create policy "Authenticated users can insert biocartis_documents" on biocartis_documents for insert to authenticated with check (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can delete biocartis_documents" on biocartis_documents';
    execute 'create policy "Authenticated users can delete biocartis_documents" on biocartis_documents for delete to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'giveaways') then
    execute 'drop policy if exists "Authenticated users can read giveaways" on giveaways';
    execute 'create policy "Authenticated users can read giveaways" on giveaways for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert giveaways" on giveaways';
    execute 'create policy "Authenticated users can insert giveaways" on giveaways for insert to authenticated with check (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can delete giveaways" on giveaways';
    execute 'create policy "Authenticated users can delete giveaways" on giveaways for delete to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contacts') then
    execute 'drop policy if exists "Authenticated users can read contacts" on contacts';
    execute 'create policy "Authenticated users can read contacts" on contacts for select to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can insert contacts" on contacts';
    execute 'create policy "Authenticated users can insert contacts" on contacts for insert to authenticated with check (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can update contacts" on contacts';
    execute 'create policy "Authenticated users can update contacts" on contacts for update to authenticated using (user_has_client_access(client_id))';
    execute 'drop policy if exists "Authenticated users can delete contacts" on contacts';
    execute 'create policy "Authenticated users can delete contacts" on contacts for delete to authenticated using (user_has_client_access(client_id))';
  end if;

  -- content_planner_config / content_planner_members: writes already go
  -- through the service-role client only, so just the read side needs it.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'content_planner_config') then
    execute 'drop policy if exists "Authenticated users can read content_planner_config" on content_planner_config';
    execute 'create policy "Authenticated users can read content_planner_config" on content_planner_config for select to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'content_planner_members') then
    execute 'drop policy if exists "Authenticated users can read content_planner_members" on content_planner_members';
    execute 'create policy "Authenticated users can read content_planner_members" on content_planner_members for select to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'club_lookup_clubs') then
    execute 'drop policy if exists "Authenticated users can read club_lookup_clubs" on club_lookup_clubs';
    execute 'create policy "Authenticated users can read club_lookup_clubs" on club_lookup_clubs for select to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'club_lookup_competitions') then
    execute 'drop policy if exists "Authenticated users can read club_lookup_competitions" on club_lookup_competitions';
    execute 'create policy "Authenticated users can read club_lookup_competitions" on club_lookup_competitions for select to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'briefing_builder_config') then
    execute 'drop policy if exists "Authenticated users can read briefing_builder_config" on briefing_builder_config';
    execute 'create policy "Authenticated users can read briefing_builder_config" on briefing_builder_config for select to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'briefing_builder_members') then
    execute 'drop policy if exists "Authenticated users can read briefing_builder_members" on briefing_builder_members';
    execute 'create policy "Authenticated users can read briefing_builder_members" on briefing_builder_members for select to authenticated using (user_has_client_access(client_id))';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'content_planner_push_log') then
    execute 'drop policy if exists "Authenticated users can read content_planner_push_log" on content_planner_push_log';
    execute 'create policy "Authenticated users can read content_planner_push_log" on content_planner_push_log for select to authenticated using (user_has_client_access(client_id))';
  end if;
end $$;

-- After running, check which of the tables above were actually skipped
-- (i.e. don't really exist), so we know what schema.sql is wrong about
-- beyond biocartis_documents:
--   select t.tbl, exists (select 1 from information_schema.tables where table_schema='public' and table_name=t.tbl) as exists
--   from unnest(array['clients','documents','files','meetings','projects','project_members','expert_documents','expert_messages','copy_examples','posts','biocartis_documents','giveaways','contacts','content_planner_config','content_planner_members','club_lookup_clubs','club_lookup_competitions','briefing_builder_config','briefing_builder_members','content_planner_push_log']) as t(tbl);
