-- Wachtwoorden: een aanmeldmethode per login.
--
-- Sommige platformen gebruiken we niet met een eigen wachtwoord maar via
-- "Inloggen met Google". Tot nu toe kon dat alleen als vrije tekst in het
-- wachtwoordveld. Nu krijgt elke login een login_method:
--   'password'  gebruikersnaam + wachtwoord (zoals alles tot nu toe)
--   'google'    inloggen met het Google-account in username; geen wachtwoord
-- Een nieuwe methode later (Apple, Microsoft, ...) = de check uitbreiden.
--
-- Versleuteling verandert niet: wachtwoorden gaan nog altijd via
-- pgp_sym_encrypt met de sleutel uit Vault. Een Google-login heeft gewoon
-- geen wachtwoord (password_encrypted = null).
--
-- Volgorde: voer deze migratie uit VÓÓR de app-wijziging live gaat. De
-- huidige app blijft ermee werken: upsert_credential krijgt er een
-- parameter bij met een standaardwaarde, en get_credentials geeft een kolom
-- extra terug.
--
-- Wijzigt:
--   column   public.credentials.login_method                         nieuw
--   function public.get_credentials()                                 + login_method
--   function public.upsert_credential(uuid,text,text,text,text,text)  vervangen door
--   function public.upsert_credential(uuid,text,text,text,text,text,text)
--
-- Alles in één transactie.

begin;

alter table credentials
  add column if not exists login_method text not null default 'password';

alter table credentials drop constraint if exists credentials_login_method_check;
alter table credentials
  add constraint credentials_login_method_check check (login_method in ('password', 'google'));

-- Het returntype verandert, dus create or replace volstaat niet.
drop function if exists public.get_credentials();

create function public.get_credentials()
returns table (id uuid, platform text, url text, username text, password text, notes text, login_method text, created_at timestamptz)
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
    case when c.password_encrypted is null then null
         else pgp_sym_decrypt(c.password_encrypted, (select decrypted_secret from vault.decrypted_secrets where name = 'credentials_encryption_key'))
    end,
    c.notes, c.login_method, c.created_at
  from credentials c
  where user_has_credential_access(c.id);
end;
$$;

-- De oude versie met zes parameters gaat weg: naast een versie met zeven
-- (waarvan één met standaardwaarde) zou een aanroep met zes argumenten
-- dubbelzinnig zijn.
drop function if exists public.upsert_credential(uuid, text, text, text, text, text);

create function public.upsert_credential(
  p_id uuid, p_platform text, p_url text, p_username text, p_password text, p_notes text,
  p_login_method text default 'password'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_id uuid;
  v_encrypted bytea;
begin
  if not user_has_section('wachtwoorden_toevoegen') then
    raise exception 'Geen toegang.';
  end if;

  if coalesce(p_login_method, 'password') not in ('password', 'google') then
    raise exception 'Onbekende aanmeldmethode.';
  end if;

  if coalesce(p_login_method, 'password') = 'password' then
    if coalesce(p_password, '') = '' then
      raise exception 'Wachtwoord ontbreekt.';
    end if;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credentials_encryption_key';
    if v_key is null then
      raise exception 'credentials_encryption_key is niet ingesteld.';
    end if;
    v_encrypted := pgp_sym_encrypt(p_password, v_key);
  else
    -- Google-login: geen wachtwoord bewaren, ook niet als er een meekwam.
    v_encrypted := null;
  end if;

  if p_id is not null then
    if not user_has_credential_access(p_id) then
      raise exception 'Geen toegang.';
    end if;
    update credentials set
      platform = p_platform,
      url = p_url,
      username = p_username,
      password_encrypted = v_encrypted,
      notes = p_notes,
      login_method = coalesce(p_login_method, 'password')
    where id = p_id
    returning id into v_id;
  else
    insert into credentials (platform, url, username, password_encrypted, notes, login_method)
    values (p_platform, p_url, p_username, v_encrypted, p_notes, coalesce(p_login_method, 'password'))
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.get_credentials() from public, anon;
revoke execute on function public.upsert_credential(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.get_credentials() to authenticated;
grant execute on function public.upsert_credential(uuid, text, text, text, text, text, text) to authenticated;

commit;
