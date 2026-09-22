-- Pre-launch final check: freelancers.UPDATE/DELETE were `using (true)` for
-- any authenticated user — but src/app/api/freelancers/[id]/route.ts's
-- PATCH/DELETE handlers gate themselves only in TypeScript, via
-- requireFreelancerAdmin() (isAdminUser(user) || sections.includes
-- ('freelancers')) — deny-by-default, no null-permissions fallback, same
-- convention as user_has_section() (0025) — and then run through the
-- REGULAR, RLS-respecting client, not the admin client. Any authenticated
-- staff member without the 'freelancers' section could bypass the app-layer
-- check entirely via a direct PostgREST call and update or delete any
-- freelancer record.
--
-- SELECT and INSERT deliberately left untouched: read access is meant to be
-- open (matches the app's own design — no read restriction anywhere), and
-- POST (create) has no permission gate in the API route either, so its
-- open policy already matches actual intent, not an oversight.
--
-- freelancer_projects/freelancer_assignments are NOT touched here — every
-- route touching those already runs through the admin/service-role client
-- after its own requireFreelancerAdmin() check, so their identically-open
-- policies are moot (RLS doesn't apply to the service role), not exploitable.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'freelancers') then
    drop policy if exists "Auth update freelancers" on freelancers;
    drop policy if exists "Auth delete freelancers" on freelancers;

    execute 'create policy "freelancers section can update freelancers" on freelancers for update to authenticated using (user_has_section(''freelancers''))';
    execute 'create policy "freelancers section can delete freelancers" on freelancers for delete to authenticated using (user_has_section(''freelancers''))';
  end if;
end $$;
