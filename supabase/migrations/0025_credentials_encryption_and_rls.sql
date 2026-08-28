-- Phase 3 of the pre-launch security remediation: hardens the Wachtwoorden
-- (credentials) feature. Two problems fixed together:
--
-- 1. Every read/write on this table happened directly from the browser
--    (src/components/passwords/PasswordsPage.tsx) with NO server-side check
--    at all — the app's allowedIds/canAdd/canDelete restriction was purely
--    client-side JavaScript, easily bypassed via devtools. Real access
--    control is added here, enforced both by RLS (defense in depth) and,
--    as the actual intended path, by the RPC functions at the bottom of
--    this file — deny-by-default: a user with no permissions object
--    configured at all gets NOTHING, unlike the client-access convention
--    in 0023 (passwords warrant the stricter default; confirmed with the
--    platform owner).
--
-- 2. Passwords were stored in plain text. This migration adds a new
--    encrypted column and switches reads/writes onto pgcrypto via the RPC
--    functions below. The OLD plaintext `password` column is deliberately
--    NOT dropped here — see 0026, a separate migration to run only once
--    the app is confirmed working end-to-end against this one.
--
-- BEFORE running this migration, create the encryption key ONCE, directly
-- in the SQL editor — never save this command to a file, the whole point
-- is that the key material never touches git:
--   select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'credentials_encryption_key', 'Symmetric key for the Wachtwoorden/credentials table');
--
-- credentials was never captured in a migration before this (confirmed
-- during the pre-launch audit) — CREATE TABLE IF NOT EXISTS is a no-op
-- against the live table, just documenting its real shape in git for once.
create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text,
  username text not null,
  password text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 1. Access-control helpers
-- ============================================================

-- Generic "does this user have permission section X" — same convention
-- hasSection() already uses app-wide (admin bypass via 'beheer', otherwise
-- exact membership), just not previously needed as a SQL-side primitive.
create or replace function public.user_has_section(section text)
returns boolean
language sql
stable
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' -> 'permissions' -> 'sections') ? 'beheer', false)
    or coalesce((auth.jwt() -> 'app_metadata' -> 'permissions' -> 'sections') ? section, false)
$$;

-- Deny-by-default, unlike user_has_client_access (0023): a user with no
-- permissions object configured gets NO credentials, and an empty/missing
-- permissions.credentials array also means none.
create or replace function public.user_has_credential_access(target_id uuid)
returns boolean
language sql
stable
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' -> 'permissions' -> 'sections') ? 'beheer', false)
    or coalesce((auth.jwt() -> 'app_metadata' -> 'permissions' -> 'credentials') ? target_id::text, false)
$$;

-- ============================================================
-- 2. RLS — defense in depth. The RPC functions below are the actual
--    intended path (needed anyway to reach the Vault-held encryption key),
--    but this stops a direct supabase.from('credentials') call from
--    seeing/touching anything a user isn't allow-listed for, regardless.
-- ============================================================
alter table credentials enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'credentials' loop
    execute format('drop policy if exists %I on credentials', pol.policyname);
  end loop;
end $$;

create policy "Toegestane credentials"
  on credentials
  for all
  to authenticated
  using (user_has_credential_access(id))
  with check (user_has_credential_access(id));

-- ============================================================
-- 3. Encryption at rest
-- ============================================================
create extension if not exists pgcrypto;

alter table credentials add column if not exists password_encrypted bytea;

update credentials
set password_encrypted = pgp_sym_encrypt(password, (select decrypted_secret from vault.decrypted_secrets where name = 'credentials_encryption_key'))
where password_encrypted is null
  and exists (select 1 from vault.decrypted_secrets where name = 'credentials_encryption_key');

-- ============================================================
-- 4. RPC functions — the intended read/write path from here on.
--    security definer so they can read the Vault secret (the calling
--    user's own role can't), but each one explicitly re-checks
--    user_has_credential_access()/user_has_section() itself rather than
--    relying on the table's RLS, since security definer bypasses RLS.
-- ============================================================

create or replace function public.get_credentials()
returns table (id uuid, platform text, url text, username text, password text, notes text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not user_has_section('wachtwoorden_bekijken') then
    return;
  end if;

  return query
  select
    c.id, c.platform, c.url, c.username,
    pgp_sym_decrypt(c.password_encrypted, (select decrypted_secret from vault.decrypted_secrets where name = 'credentials_encryption_key')),
    c.notes, c.created_at
  from credentials c
  where user_has_credential_access(c.id);
end;
$$;

create or replace function public.upsert_credential(
  p_id uuid, p_platform text, p_url text, p_username text, p_password text, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_id uuid;
begin
  if not user_has_section('wachtwoorden_toevoegen') then
    raise exception 'Geen toegang.';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credentials_encryption_key';
  if v_key is null then
    raise exception 'credentials_encryption_key is niet ingesteld.';
  end if;

  if p_id is not null then
    if not user_has_credential_access(p_id) then
      raise exception 'Geen toegang.';
    end if;
    update credentials set
      platform = p_platform,
      url = p_url,
      username = p_username,
      password = '(versleuteld)',
      password_encrypted = pgp_sym_encrypt(p_password, v_key),
      notes = p_notes
    where id = p_id
    returning id into v_id;
  else
    insert into credentials (platform, url, username, password, password_encrypted, notes)
    values (p_platform, p_url, p_username, '(versleuteld)', pgp_sym_encrypt(p_password, v_key), p_notes)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.delete_credential(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not user_has_section('wachtwoorden_verwijderen') then
    raise exception 'Geen toegang.';
  end if;
  if not user_has_credential_access(p_id) then
    raise exception 'Geen toegang.';
  end if;
  delete from credentials where id = p_id;
end;
$$;

grant execute on function public.get_credentials() to authenticated;
grant execute on function public.upsert_credential(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.delete_credential(uuid) to authenticated;
