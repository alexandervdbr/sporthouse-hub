-- URGENT, confirmed live: 0026 (drop the plaintext `password` column) has
-- been applied — verified via a direct query
-- (select column_name from information_schema.columns where
-- table_name='credentials' and column_name='password' -> 0 rows).
-- 0027 copied 0025's upsert_credential() body verbatim while only widening
-- search_path, so it still writes to that now-nonexistent column on both
-- branches. Every password add/edit in Wachtwoorden has been failing with
-- "column \"password\" does not exist" since 0026 ran.
--
-- get_credentials() and delete_credential() never referenced `password` —
-- only upsert_credential() needs fixing.
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
      password_encrypted = pgp_sym_encrypt(p_password, v_key),
      notes = p_notes
    where id = p_id
    returning id into v_id;
  else
    insert into credentials (platform, url, username, password_encrypted, notes)
    values (p_platform, p_url, p_username, pgp_sym_encrypt(p_password, v_key), p_notes)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
