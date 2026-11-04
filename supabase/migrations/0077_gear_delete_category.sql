-- Materiaalplanner: categorieën verwijderen (inhoud naar een andere categorie) en terugzetten.
-- Alleen twee functies; geen tabellen of gegevens gewijzigd.
begin;
-- Een categorie verwijderen: alles wat erin zit gaat naar een andere categorie
-- (p_into_id): de kits (ook opgeheven kits), de losse items en de onderdelen
-- die in een kit van een andere categorie zitten maar deze als eigen
-- categorie hebben. Die blijven in hun kit. Alles gaat achteraan in de
-- doelcategorie, in de volgorde die het had. Een lege categorie kan zonder
-- doel weg. Boekingen, kitlidmaatschappen en het statuslogboek verwijzen naar
-- items, niet naar categorieën, en blijven dus ongemoeid.
--
-- Geeft een momentopname terug (de categorie en wat er verhuisde, met de
-- oude volgorde); daarmee zet gear_restore_category alles terug.
create or replace function public.gear_delete_category(p_category_id uuid, p_into_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat   public.gear_categories%rowtype;
  v_kits  jsonb;
  v_items jsonb;
begin
  if not public.gear_can('materiaal_toevoegen') then
    raise exception 'Alleen wie het materiaal beheert, kan categorieën verwijderen.' using errcode = '42501';
  end if;
  -- Vastzetten: wie intussen iets in deze categorie zet, wacht en krijgt daarna een fout.
  select * into v_cat from public.gear_categories where id = p_category_id for update;
  if not found then
    raise exception 'Deze categorie bestaat niet (meer).' using errcode = 'P0002';
  end if;
  if (select count(*) from public.gear_categories) <= 1 then
    raise exception 'Er moet minstens één categorie blijven.' using errcode = 'P0001';
  end if;
  if p_into_id = p_category_id then
    raise exception 'Kies een andere categorie om de inhoud naartoe te verplaatsen.' using errcode = '22023';
  end if;
  if p_into_id is not null then
    -- Ook het doel vastzetten, zodat niemand het intussen verwijdert.
    perform 1 from public.gear_categories where id = p_into_id for share;
    if not found then
      raise exception 'De gekozen categorie bestaat niet (meer).' using errcode = 'P0002';
    end if;
  elsif exists (select 1 from public.gear_items where category_id = p_category_id)
     or exists (select 1 from public.gear_kits where category_id = p_category_id) then
    raise exception 'Kies waar de inhoud van deze categorie naartoe gaat.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sort_order', sort_order) order by sort_order, name), '[]'::jsonb)
    into v_kits from public.gear_kits where category_id = p_category_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sort_order', sort_order) order by sort_order, name), '[]'::jsonb)
    into v_items from public.gear_items where category_id = p_category_id;

  with nieuw as (
    select k.id,
           (select coalesce(max(x.sort_order), 0) from public.gear_kits x where x.category_id = p_into_id)
           + row_number() over (order by k.sort_order, k.name) as pos
      from public.gear_kits k where k.category_id = p_category_id
  )
  update public.gear_kits k set category_id = p_into_id, sort_order = nieuw.pos from nieuw where k.id = nieuw.id;

  with nieuw as (
    select i.id,
           (select coalesce(max(x.sort_order), 0) from public.gear_items x where x.category_id = p_into_id)
           + row_number() over (order by i.sort_order, i.name) as pos
      from public.gear_items i where i.category_id = p_category_id
  )
  update public.gear_items i set category_id = p_into_id, sort_order = nieuw.pos from nieuw where i.id = nieuw.id;

  delete from public.gear_categories where id = p_category_id;

  return jsonb_build_object(
    'category', jsonb_build_object('id', v_cat.id, 'name', v_cat.name, 'color', v_cat.color, 'sort_order', v_cat.sort_order),
    'into_id', p_into_id,
    'kits', v_kits,
    'items', v_items
  );
end $$;

-- Een verwijderde categorie terugzetten (ongedaan maken): zelfde id, naam,
-- kleur en plaats, en wat toen verhuisde gaat terug op zijn oude plaats —
-- tenzij het intussen al ergens anders staat dan in de doelcategorie. Dat
-- blijft staan en komt bij 'skipped'.
create or replace function public.gear_restore_category(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := (p_snapshot -> 'category' ->> 'id')::uuid;
  v_name    text := p_snapshot -> 'category' ->> 'name';
  v_into    uuid := (p_snapshot ->> 'into_id')::uuid;
  v_kits    int;
  v_items   int;
  v_skipped jsonb;
begin
  if not public.gear_can('materiaal_toevoegen') then
    raise exception 'Alleen wie het materiaal beheert, kan categorieën terugzetten.' using errcode = '42501';
  end if;
  if v_id is null or v_name is null then
    raise exception 'Er is niets om terug te zetten.' using errcode = '22023';
  end if;
  if exists (select 1 from public.gear_categories where id = v_id) then
    raise exception 'Deze categorie bestaat al weer.' using errcode = '23505';
  end if;
  if exists (select 1 from public.gear_categories where lower(btrim(name)) = lower(btrim(v_name))) then
    raise exception 'Er is intussen een andere categorie "%". Hernoem die eerst.', v_name using errcode = '23505';
  end if;

  insert into public.gear_categories (id, name, color, sort_order)
  values (v_id, v_name, p_snapshot -> 'category' ->> 'color', (p_snapshot -> 'category' ->> 'sort_order')::int);

  update public.gear_kits k set category_id = v_id, sort_order = (x ->> 'sort_order')::int
    from jsonb_array_elements(coalesce(p_snapshot -> 'kits', '[]'::jsonb)) x
   where k.id = (x ->> 'id')::uuid and k.category_id = v_into;
  get diagnostics v_kits = row_count;

  update public.gear_items i set category_id = v_id, sort_order = (x ->> 'sort_order')::int
    from jsonb_array_elements(coalesce(p_snapshot -> 'items', '[]'::jsonb)) x
   where i.id = (x ->> 'id')::uuid and i.category_id = v_into;
  get diagnostics v_items = row_count;

  select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb) into v_skipped from (
    select k.name from jsonb_array_elements(coalesce(p_snapshot -> 'kits', '[]'::jsonb)) x
      join public.gear_kits k on k.id = (x ->> 'id')::uuid where k.category_id <> v_id
    union all
    select i.name from jsonb_array_elements(coalesce(p_snapshot -> 'items', '[]'::jsonb)) x
      join public.gear_items i on i.id = (x ->> 'id')::uuid where i.category_id <> v_id
  ) s;

  return jsonb_build_object('category_id', v_id, 'kits', v_kits, 'items', v_items, 'skipped', v_skipped);
end $$;

revoke all on function public.gear_delete_category(uuid, uuid) from public, anon;
revoke all on function public.gear_restore_category(jsonb) from public, anon;
grant execute on function public.gear_delete_category(uuid, uuid) to authenticated;
grant execute on function public.gear_restore_category(jsonb) to authenticated;

-- ── Controle: anders afbreken ──
do $$
begin
  if to_regprocedure('public.gear_delete_category(uuid, uuid)') is null
     or to_regprocedure('public.gear_restore_category(jsonb)') is null then
    raise exception 'Afgebroken, niets opgeslagen: functies ontbreken.';
  end if;
  if has_function_privilege('anon', 'public.gear_delete_category(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.gear_delete_category(uuid, uuid)', 'execute') then
    raise exception 'Afgebroken, niets opgeslagen: rechten op de functies kloppen niet.';
  end if;
end $$;

commit;
