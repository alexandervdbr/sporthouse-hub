-- Materiaalplanner: drie regels uit de testronde.
--
-- 1. Onderdelen van een kit zijn alleen via hun kit te boeken. Een boekingsregel
--    zonder "via kit" voor een item dat nu in een actieve kit zit, wordt
--    geweigerd — bij boeken, bij wijzigen, en hoe de regel er ook komt. Een kit
--    boeken "zonder" een onderdeel blijft kunnen. Wat al los geboekt stond,
--    blijft staan (alleen nieuwe of omgezette regels worden gecontroleerd).
-- 2. Contactpersoon bij de verantwoordelijke: een collega (account) of, als
--    die nog geen account heeft, een naam als vrije tekst. Alleen in de
--    gear_-tabellen; de gedeelde tabel clients blijft ongemoeid.
-- 3. gear_restore_kit: een opgeheven kit terugzetten (ongedaan maken).
--
-- Additief: twee kolommen per tabel, een trigger en een functie. Geen
-- bestaande gegevens gewijzigd.

-- ── 1. Onderdelen alleen via hun kit ────────────────────────────────────────

create or replace function public.gear_booking_item_via_kit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item text;
  v_kit  text;
begin
  if new.via_kit_id is not null then
    return new;
  end if;
  -- Bij wijzigen alleen als de regel van "via kit" naar los gaat.
  if tg_op = 'UPDATE' and old.via_kit_id is null then
    return new;
  end if;
  select i.name, k.name into v_item, v_kit
    from public.gear_kit_members m
    join public.gear_kits k on k.id = m.kit_id
    join public.gear_items i on i.id = m.item_id
   where m.item_id = new.item_id and m.removed_at is null and k.dissolved_at is null;
  if v_kit is not null then
    raise exception '% zit in kit %; boek de kit (eventueel zonder andere onderdelen).', v_item, v_kit
      using errcode = '22023';
  end if;
  return new;
end $$;

revoke all on function public.gear_booking_item_via_kit() from public, anon, authenticated;

drop trigger if exists gear_booking_items_via_kit on public.gear_booking_items;
create trigger gear_booking_items_via_kit
  before insert or update of via_kit_id on public.gear_booking_items
  for each row execute function public.gear_booking_item_via_kit();

-- ── 2. Contactpersoon ───────────────────────────────────────────────────────

alter table public.gear_items
  add column if not exists contact_user_id uuid references auth.users(id) on delete set null,
  add column if not exists contact_name    text;
alter table public.gear_kits
  add column if not exists contact_user_id uuid references auth.users(id) on delete set null,
  add column if not exists contact_name    text;

-- Met een account: de naam als kopie (blijft leesbaar als het account
-- verdwijnt). Zonder account: de vrije tekst zoals ingegeven.
create or replace function public.gear_fill_contact_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.contact_name := nullif(btrim(coalesce(new.contact_name, '')), '');
  if new.contact_user_id is not null then
    if tg_op = 'INSERT' or new.contact_user_id is distinct from old.contact_user_id then
      select coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), email)
        into new.contact_name
        from auth.users where id = new.contact_user_id;
      if new.contact_name is null then
        raise exception 'Onbekende collega als contactpersoon.' using errcode = '23503';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and old.contact_user_id is not null
        and new.contact_name is not distinct from old.contact_name
        and exists (select 1 from auth.users where id = old.contact_user_id) then
    -- Zelf leeggemaakt terwijl het account bestaat: de kopie gaat mee weg.
    -- Account verwijderd (de foreign key zette het id op null): de naam blijft.
    new.contact_name := null;
  end if;
  return new;
end $$;

revoke all on function public.gear_fill_contact_name() from public, anon, authenticated;

drop trigger if exists gear_items_contact_name on public.gear_items;
create trigger gear_items_contact_name
  before insert or update of contact_user_id, contact_name on public.gear_items
  for each row execute function public.gear_fill_contact_name();

drop trigger if exists gear_kits_contact_name on public.gear_kits;
create trigger gear_kits_contact_name
  before insert or update of contact_user_id, contact_name on public.gear_kits
  for each row execute function public.gear_fill_contact_name();

-- ── 3. Opgeheven kit terugzetten ────────────────────────────────────────────
-- De onderdelen die bij het opheffen uit de kit gingen, komen terug in hun
-- oude volgorde — behalve wat intussen in een andere kit zit (die namen komen
-- terug als "skipped"). Boekingen blijven zoals ze zijn.

create or replace function public.gear_restore_kit(p_kit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kit     public.gear_kits%rowtype;
  v_items   int;
  v_skipped jsonb;
begin
  if not public.gear_can('materiaal_toevoegen') then
    raise exception 'Alleen wie het materiaal beheert, kan kits terugzetten.' using errcode = '42501';
  end if;
  select * into v_kit from public.gear_kits where id = p_kit_id for update;
  if v_kit.id is null then
    raise exception 'Deze kit bestaat niet.' using errcode = 'P0002';
  end if;
  if v_kit.dissolved_at is null then
    raise exception 'Deze kit is niet opgeheven.' using errcode = '22023';
  end if;
  if exists (select 1 from public.gear_kits where dissolved_at is null and lower(btrim(name)) = lower(btrim(v_kit.name))) then
    raise exception 'Er bestaat intussen al een kit "%".', v_kit.name using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(i.name order by m.sort_order), '[]'::jsonb) into v_skipped
    from public.gear_kit_members m join public.gear_items i on i.id = m.item_id
   where m.kit_id = p_kit_id and m.removed_at = v_kit.dissolved_at
     and exists (select 1 from public.gear_kit_members x where x.item_id = m.item_id and x.removed_at is null);

  update public.gear_kits
     set dissolved_at = null, dissolved_by = null, dissolved_by_name = null
   where id = p_kit_id;

  insert into public.gear_kit_members (kit_id, item_id, sort_order, added_by, added_by_name)
  select p_kit_id, m.item_id, m.sort_order, auth.uid(), public.gear_actor_name()
    from public.gear_kit_members m
   where m.kit_id = p_kit_id and m.removed_at = v_kit.dissolved_at
     and not exists (select 1 from public.gear_kit_members x where x.item_id = m.item_id and x.removed_at is null);
  get diagnostics v_items = row_count;

  return jsonb_build_object('kit_id', p_kit_id, 'items', v_items, 'skipped', v_skipped);
end $$;

revoke all on function public.gear_restore_kit(uuid) from public, anon;
grant execute on function public.gear_restore_kit(uuid) to authenticated;
