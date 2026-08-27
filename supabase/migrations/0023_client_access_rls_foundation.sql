-- Phase 1 of the pre-launch security remediation. Four independent,
-- individually-safe fixes — none of these change behavior for anyone with
-- normal (unrestricted) permissions. The actual USING(true) -> real-check
-- rewrite across client-scoped tables is a separate migration
-- (0024_client_scoped_rls_policies.sql), rolled out after this one is
-- confirmed working, since that's the riskier change.

-- ============================================================
-- 1. Shared helper: does the current session's user have access to this
--    client? Replicates src/lib/filter-clients.ts's exact semantics so this
--    doesn't change anyone's actual access, just enforces it at the
--    database layer too:
--      - admin (panel-granted 'beheer' section) -> full access
--      - no permissions object configured at all -> full access
--      - permissions.clients empty/missing -> full access (no restriction set)
--      - otherwise -> only clients in permissions.clients
--    Deliberately does NOT hardcode the two ADMIN_EMAILS bypass into SQL —
--    grant those accounts 'beheer' via the admin panel instead (see the
--    Phase 6 plan notes for why).
-- ============================================================
create or replace function public.user_has_client_access(target_client_id uuid)
returns boolean
language sql
stable
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' -> 'permissions' -> 'sections') ? 'beheer', false)
    or (auth.jwt() -> 'app_metadata' -> 'permissions') is null
    or coalesce(jsonb_array_length(auth.jwt() -> 'app_metadata' -> 'permissions' -> 'clients') = 0, true)
    or (auth.jwt() -> 'app_metadata' -> 'permissions' -> 'clients') ? target_client_id::text
$$;

-- To verify without a live session, simulate a restricted user's JWT in the
-- SQL editor (auth.jwt() reads this session-local setting):
--   select set_config('request.jwt.claims', '{"app_metadata":{"permissions":{"clients":["<a-real-client-id>"]}}}', true);
--   select user_has_client_access('<that-same-id>');          -- expect true
--   select user_has_client_access('<a-different-client-id>'); -- expect false
--   select set_config('request.jwt.claims', '{"app_metadata":{"permissions":{"sections":["beheer"]}}}', true);
--   select user_has_client_access('<any-client-id>');          -- expect true (admin bypass)

-- ============================================================
-- 2. The "Uploader can delete their own file objects" policy never actually
--    checked ownership — only bucket_id — so any authenticated user could
--    delete any other user's uploaded file from Storage. Matches the
--    correct pattern already used one policy above it for the `files`
--    table row itself (schema.sql:93, uploaded_by = auth.jwt() ->> 'email').
-- ============================================================
drop policy if exists "Uploader can delete their own file objects" on storage.objects;
create policy "Uploader can delete their own file objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'files'
    and exists (
      select 1 from files
      where files.storage_path = storage.objects.name
      and files.uploaded_by = (auth.jwt() ->> 'email')
    )
  );

-- ============================================================
-- 3. clients.category was only ever documented in a comment, never
--    enforced, while the whole app treats it as a closed set. Before
--    running this migration, confirm no existing row would violate it:
--      select distinct category from clients;
-- ============================================================
alter table clients drop constraint if exists clients_category_check;
alter table clients
  add constraint clients_category_check
  check (category in ('klant', 'atleet', 'podcast', 'intern'));

-- ============================================================
-- 4. A saved reel is shared team content ("Mijn gedacht!"), not a personal
--    bookmark list — it shouldn't disappear because the person who saved it
--    left the company. If the constraint name below doesn't match what's
--    actually live, find the real one first:
--      select conname from pg_constraint where conrelid = 'reel_inspiration'::regclass and contype = 'f';
-- ============================================================
alter table reel_inspiration alter column user_id drop not null;
alter table reel_inspiration drop constraint if exists reel_inspiration_user_id_fkey;
alter table reel_inspiration
  add constraint reel_inspiration_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
