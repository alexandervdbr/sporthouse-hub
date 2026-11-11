-- Wachtwoorden: categorieën.
--
-- Elke login hoort bij hoogstens één categorie (Social media, Design &
-- stock, ...). Categorieën maken we zelf aan; de volgorde stellen we zelf in.
--
-- Wie mag wat:
--   categorieën lezen, aanmaken, hernoemen, ordenen, verwijderen
--       iedereen die Wachtwoorden kan openen (wachtwoorden_bekijken).
--       Namen van categorieën zijn niet geheim.
--   een login in een categorie zetten (formulier, import, "Verplaats naar")
--       wie logins mag bewerken (wachtwoorden_toevoegen), en alleen voor
--       logins waar hij toegang toe heeft — net als bewerken.
--
-- Verwijder je een categorie, dan blijven de logins bestaan: hun
-- category_id wordt leeg ("Zonder categorie").
--
-- Volgorde: voer deze migratie uit VÓÓR de app-wijziging live gaat. De
-- huidige app blijft ermee werken (upsert_credential krijgt een parameter
-- met standaardwaarde, get_credentials een kolom extra). Let op: bewerken
-- via de huidige app zet de categorie van die login terug op leeg — maar
-- zolang die versie nog live is, bestaan er geen categorieën.
--
-- Versleuteling verandert niet.
--
-- Wijzigt:
--   table    public.credential_categories                                  nieuw
--   column   public.credentials.category_id                                nieuw
--   function public.get_credentials()                                       + category_id
--   function public.upsert_credential(uuid,text,text,text,text,text,text)  vervangen door
--   function public.upsert_credential(uuid,text,text,text,text,text,text,uuid)
--   function public.set_credentials_category(uuid[], uuid)                  nieuw
--
-- Alles in één transactie.

begin;

-- ============================================================
-- 1. Categorieën
-- ============================================================

create table if not exists credential_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Geen twee categorieën met dezelfde naam (hoofdletters tellen niet).
create unique index if not exists credential_categories_name_key
  on credential_categories (lower(btrim(name)));

alter table credential_categories enable row level security;

drop policy if exists "Wachtwoorden: categorieën" on credential_categories;
create policy "Wachtwoorden: categorieën"
  on credential_categories
  for all
  to authenticated
  using (user_has_section('wachtwoorden_bekijken'))
  with check (user_has_section('wachtwoorden_bekijken'));

revoke all on credential_categories from anon;
grant select, insert, update, delete on credential_categories to authenticated;

-- ============================================================
-- 2. Categorie per login
-- ============================================================

alter table credentials
  add column if not exists category_id uuid references credential_categories(id) on delete set null;

create index if not exists credentials_category_id_idx on credentials (category_id);

-- ============================================================
-- 3. get_credentials: + category_id (returntype verandert → drop)
-- ============================================================

drop function if exists public.get_credentials();

create function public.get_credentials()
returns table (id uuid, platform text, url text, username text, password text, notes text, login_method text, category_id uuid, created_at timestamptz)
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
    c.notes, c.login_method, c.category_id, c.created_at
  from credentials c
  where user_has_credential_access(c.id);
end;
$$;

-- ============================================================
-- 4. upsert_credential: + p_category_id
--    De versie met zeven parameters gaat weg; ernaast zou een aanroep
--    dubbelzinnig zijn.
-- ============================================================

drop function if exists public.upsert_credential(uuid, text, text, text, text, text, text);

create function public.upsert_credential(
  p_id uuid, p_platform text, p_url text, p_username text, p_password text, p_notes text,
  p_login_method text default 'password',
  p_category_id uuid default null
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
      login_method = coalesce(p_login_method, 'password'),
      category_id = p_category_id
    where id = p_id
    returning id into v_id;
  else
    insert into credentials (platform, url, username, password_encrypted, notes, login_method, category_id)
    values (p_platform, p_url, p_username, v_encrypted, p_notes, coalesce(p_login_method, 'password'), p_category_id)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ============================================================
-- 5. Meerdere logins tegelijk in een categorie zetten, zonder wachtwoorden
--    opnieuw door te sturen. p_category_id = null → "Zonder categorie".
-- ============================================================

create or replace function public.set_credentials_category(p_ids uuid[], p_category_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not user_has_section('wachtwoorden_toevoegen') then
    raise exception 'Geen toegang.';
  end if;

  if exists (select 1 from unnest(p_ids) as t(id) where not user_has_credential_access(t.id)) then
    raise exception 'Geen toegang.';
  end if;

  update credentials set category_id = p_category_id
  where id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.get_credentials() from public, anon;
revoke execute on function public.upsert_credential(uuid, text, text, text, text, text, text, uuid) from public, anon;
revoke execute on function public.set_credentials_category(uuid[], uuid) from public, anon;
grant execute on function public.get_credentials() to authenticated;
grant execute on function public.upsert_credential(uuid, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.set_credentials_category(uuid[], uuid) to authenticated;

commit;
