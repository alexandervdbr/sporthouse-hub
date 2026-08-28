-- 0025 set `search_path = public` on get_credentials/upsert_credential, but
-- this Supabase project has pgcrypto installed in the `extensions` schema
-- (Supabase's default location for new extensions, not `public`), so
-- pgp_sym_encrypt/pgp_sym_decrypt couldn't be resolved at runtime — every
-- save/load failed with "function pgp_sym_encrypt(text, text) does not
-- exist" (42883). Widening the search_path to include `extensions` fixes it
-- regardless of which schema pgcrypto actually landed in on any given
-- environment.

create or replace function public.get_credentials()
returns table (id uuid, platform text, url text, username text, password text, notes text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
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
set search_path = public, extensions
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
