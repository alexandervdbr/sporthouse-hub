-- Post-launch audit, Critical #2: preassist_editions/preassist_submissions
-- (added in 0028 to document their real shape) only ever got a blanket
-- "for all using (auth.role() = 'authenticated')" policy — i.e. logged in
-- at all, no other check. That's fine for reading (confirmed intentional:
-- src/app/preassist/page.tsx never gates viewing behind a section — any
-- authenticated user is meant to see every submission across every client,
-- same as the rest of this internal tool), but it's wide open for writes
-- too. The app's own permission model (canManageEditions/canAdd/
-- canDeleteAll, all section-gated) is currently enforced ONLY in React
-- props and in the server-side /api/preassist/upload DELETE handler — the
-- direct-from-browser delete branch in PreassistPage.tsx's handleDelete()
-- (still used for pre-Drive-migration submissions stored in Supabase
-- Storage) bypasses that entirely: any authenticated user can delete ANY
-- submission via devtools, not just their own.
--
-- Fix: keep SELECT open (matches the confirmed page design), but make
-- INSERT/UPDATE/DELETE actually enforce the same "admin, or the specific
-- section, or no permissions object configured at all" rule the app itself
-- already applies client-side — same convention as user_has_client_access()
-- (0023), just parameterized by section name instead of by client. This is
-- deliberately NOT user_has_section() from 0025 — that helper is
-- deny-by-default (correct for Wachtwoorden, a stricter feature by design)
-- and would silently lock out any staff member who has a permissions
-- object configured but happens not to list these preassist sections,
-- which the app today treats as "no restriction configured, allow."

create or replace function public.user_has_open_section(section text)
returns boolean
language sql
stable
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' -> 'permissions' -> 'sections') ? 'beheer', false)
    or (auth.jwt() -> 'app_metadata' -> 'permissions') is null
    or coalesce((auth.jwt() -> 'app_metadata' -> 'permissions' -> 'sections') ? section, false)
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'preassist_editions') then
    drop policy if exists "Authenticated" on preassist_editions;

    create policy "Anyone authenticated can read editions"
      on preassist_editions for select to authenticated
      using (true);

    create policy "preassist_beheer can manage editions"
      on preassist_editions for insert to authenticated
      with check (user_has_open_section('preassist_beheer'));

    create policy "preassist_beheer can update editions"
      on preassist_editions for update to authenticated
      using (user_has_open_section('preassist_beheer'))
      with check (user_has_open_section('preassist_beheer'));

    create policy "preassist_beheer can delete editions"
      on preassist_editions for delete to authenticated
      using (user_has_open_section('preassist_beheer'));
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'preassist_submissions') then
    drop policy if exists "Authenticated" on preassist_submissions;

    create policy "Anyone authenticated can read submissions"
      on preassist_submissions for select to authenticated
      using (true);

    -- Real inserts today go through /api/preassist/upload's service-role
    -- client (bypasses RLS entirely) — this is defense in depth for any
    -- future direct-from-browser insert path.
    create policy "preassist_toevoegen can insert submissions"
      on preassist_submissions for insert to authenticated
      with check (user_has_open_section('preassist_toevoegen'));

    -- Matches /api/preassist/upload's own DELETE check exactly: admin,
    -- preassist_verwijderen, or the submitter deleting their own upload.
    create policy "preassist_verwijderen or owner can delete submissions"
      on preassist_submissions for delete to authenticated
      using (
        user_has_open_section('preassist_verwijderen')
        or submitted_by_id = auth.uid()::text
      );

    -- No UPDATE policy: nothing in the app updates a submission row today,
    -- so this locks updates to the service-role client rather than opening
    -- a write path nobody uses.
  end if;
end $$;
