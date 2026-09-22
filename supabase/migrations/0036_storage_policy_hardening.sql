-- Post-launch audit, last Medium finding (the 4 undocumented storage
-- buckets) — expanded after a live pg_policies query turned up more than
-- expected. Read-only queries first, then this migration; nothing here was
-- guessed.

-- ============================================================
-- 1. `files` bucket: the ORIGINAL Phase-1 fix (0023) is still live but was
--    never actually closing the hole. 0023 replaced the policy named
--    "Uploader can delete their own file objects" with a correctly
--    ownership-checked version — but a SECOND, differently-named policy,
--    "Authenticated users can delete files storage" (bucket_id check only,
--    no ownership check at all), has been sitting on the same bucket the
--    whole time. Postgres OR's every matching policy together, so this
--    second policy alone has let any authenticated user delete any other
--    user's file this entire time, regardless of the 0023 fix. Confirmed
--    live via a direct pg_policies query, not assumed.
-- ============================================================
drop policy if exists "Authenticated users can delete files storage" on storage.objects;

-- ============================================================
-- 2. `chat-attachments`: a bucket that was never captured in any migration
--    at all (discovered via the same live query, not previously known
--    about). Its DELETE policy has the identical unscoped bug — and unlike
--    `files`, there is no legitimate use for it at all: confirmed by
--    grepping the whole codebase, nothing ever calls
--    `.storage.from('chat-attachments').remove(...)` — chat messages and
--    their attachments are never deleted anywhere in the app. Rather than
--    invent an ownership model for a delete path that doesn't exist,
--    remove the authenticated policy entirely — locks it to service-role,
--    matching the same pattern already used for `documents`/`posts`.
-- ============================================================
drop policy if exists "chat attachments delete" on storage.objects;

-- ============================================================
-- 3. `contact-photos`: same story — DELETE was unscoped, and grepping
--    src/components/team/TeamDirectory.tsx (the only place this bucket is
--    touched) confirms there is no `.remove()` call anywhere; deleting a
--    contact via /api/contacts never touches storage. Locked to
--    service-role, same reasoning as chat-attachments above.
--
--    INSERT (photo upload) was also unscoped to any authenticated user —
--    but here there IS a real, live upload path (TeamDirectory.tsx's
--    handlePhotoUpload), gated client-side by the 'team_toevoegen' section.
--    That gate had no server-side/database backing at all. Tightened to
--    match what the UI already promises, using the same
--    user_has_open_section() helper from 0032 (not a new pattern).
-- ============================================================
drop policy if exists "authenticated users can delete contact photos" on storage.objects;
drop policy if exists "authenticated users can upload contact photos" on storage.objects;
create policy "team_toevoegen can upload contact photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'contact-photos' and user_has_open_section('team_toevoegen'));

-- ============================================================
-- 4. `preassist`: DELETE was unscoped — and unlike chat-attachments/
--    contact-photos, this one IS actively exploitable: PreassistPage.tsx's
--    handleDelete() calls `.storage.from('preassist').remove([filePath])`
--    directly from the browser for pre-Drive-migration submissions. This
--    is the storage-object half of the exact bug 0032 already fixed on the
--    `preassist_submissions` TABLE row — 0032 never touched this policy,
--    so the file itself could still be deleted by anyone even though the
--    DB row is now protected. Same fix, same authorization model: admin/
--    preassist_verwijderen, or the original uploader.
--    (file_url on preassist_submissions stores the bucket-relative path
--    passed straight into supabase.storage.remove(), confirmed by reading
--    the call site — not a full URL, so a direct equality join is correct.)
--
--    INSERT was also unscoped; tightened to preassist_toevoegen, matching
--    the defense-in-depth already applied to the DB row insert in 0032.
-- ============================================================
drop policy if exists "Authenticated delete preassist" on storage.objects;
drop policy if exists "Authenticated upload preassist" on storage.objects;

create policy "preassist_verwijderen or owner can delete preassist files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'preassist'
    and (
      user_has_open_section('preassist_verwijderen')
      or exists (
        select 1 from preassist_submissions
        where preassist_submissions.file_url = storage.objects.name
        and preassist_submissions.submitted_by_id = (auth.uid())::text
      )
    )
  );

create policy "preassist_toevoegen can upload preassist files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'preassist' and user_has_open_section('preassist_toevoegen'));

-- ============================================================
-- `freelancer-assignments` and `sporthouse-internal`: confirmed via the
-- full unfiltered pg_policies query (not just a bucket_id-filtered one,
-- which would have missed a blanket/global policy) that neither has ANY
-- policy at all, scoped or not — genuinely service-role-only already,
-- matching the app's own access pattern (every route touching these uses
-- the admin/service-role client with its own hasClientAccess/
-- canManageSection check). No change needed.
-- ============================================================
