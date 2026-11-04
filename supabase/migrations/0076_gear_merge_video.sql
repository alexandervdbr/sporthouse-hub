-- Materiaalplanner: SET 1–5 VIDEO samengevoegd tot één categorie "Video" (live uitgevoerd).
-- Eenmalig; de eerste controle weigert als de categorieën niet meer zo zijn.

-- Materiaalplanner: SET 1–5 VIDEO samenvoegen tot één categorie "Video".
-- Gegevens, alleen gear_categories, gear_kits en gear_items. Klopt een controle niet,
-- dan breekt alles af en verandert er niets.
begin;

-- ── Voorwaarden ─────────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from public.gear_categories) <> 21
     or (select count(*) from public.gear_categories where id in ('4808d2b6-8b85-4ea1-97df-8384356f5e45', '657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0') and name like 'SET _ VIDEO') <> 5 then
    raise exception 'Afgebroken: de categorieën SET 1–5 VIDEO zijn niet (meer) zoals verwacht.';
  end if;
  if (select count(*) from public.gear_items) <> 197 or (select count(*) from public.gear_kits) <> 23 then
    raise exception 'Afgebroken: het aantal items of kits wijkt af van wat verwacht werd.';
  end if;
end $$;

-- Stand van alles buiten de vijf SET-categorieën, om na afloop te vergelijken.
create temp table _voor on commit drop as
select 'cat' as soort, id, name as naam, color as extra, sort_order from public.gear_categories where id not in ('4808d2b6-8b85-4ea1-97df-8384356f5e45', '657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0')
union all
select 'kit', id, name, category_id::text, sort_order from public.gear_kits where category_id not in ('4808d2b6-8b85-4ea1-97df-8384356f5e45', '657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0')
union all
select 'item', id, name, category_id::text, sort_order from public.gear_items where category_id not in ('4808d2b6-8b85-4ea1-97df-8384356f5e45', '657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0');
create temp table _tellers on commit drop as
select (select count(*) from public.gear_kit_members where removed_at is null) as leden,
       (select count(*) from public.gear_bookings) as boekingen,
       (select count(*) from public.gear_booking_items) as regels,
       (select count(*) from public.gear_status_log) as logregels;

-- ── 1. SET 1 VIDEO wordt "Video" (zelfde id, kleur en plaats) ───────────────
update public.gear_categories set name = 'Video' where id = '4808d2b6-8b85-4ea1-97df-8384356f5e45';

-- ── 2. Kits en items van SET 1–5 in "Video", volgorde behouden ──────────────
-- Volgorde: eerst die van de oude categorie (SET 1 … SET 5), daarbinnen de
-- bestaande volgorde. Kits: FX3 A, FX3 B, FX3 C, A7S III. Items: de bodies en
-- de losse FS7.
with nieuw as (
  select k.id, row_number() over (order by c.sort_order, k.sort_order, k.name) as pos
    from public.gear_kits k join public.gear_categories c on c.id = k.category_id
   where k.category_id in ('4808d2b6-8b85-4ea1-97df-8384356f5e45', '657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0')
)
update public.gear_kits k set category_id = '4808d2b6-8b85-4ea1-97df-8384356f5e45', sort_order = nieuw.pos from nieuw where k.id = nieuw.id;

with nieuw as (
  select i.id, row_number() over (order by c.sort_order, i.sort_order, i.name) as pos
    from public.gear_items i join public.gear_categories c on c.id = i.category_id
   where i.category_id in ('4808d2b6-8b85-4ea1-97df-8384356f5e45', '657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0')
)
update public.gear_items i set category_id = '4808d2b6-8b85-4ea1-97df-8384356f5e45', sort_order = nieuw.pos from nieuw where i.id = nieuw.id;

-- ── 3. SET 2–5 zijn nu leeg: weg ────────────────────────────────────────────
delete from public.gear_categories where id in ('657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0');

-- ── Controle: anders afbreken ──
do $$
declare r text := ''; fails int := 0;
begin
  if (select count(*) from public.gear_categories) = 17 then r := r || 'PASS: ' || '17 categorieën' || E'\n'; else r := r || 'FAIL: ' || '17 categorieën' || E'\n'; fails := fails + 1; end if;
  if (select name from public.gear_categories where id = '4808d2b6-8b85-4ea1-97df-8384356f5e45') = 'Video' and (select sort_order from public.gear_categories where id = '4808d2b6-8b85-4ea1-97df-8384356f5e45') = 1 then r := r || 'PASS: ' || 'SET 1 VIDEO heet nu Video, zelfde id, bovenaan' || E'\n'; else r := r || 'FAIL: ' || 'SET 1 VIDEO heet nu Video, zelfde id, bovenaan' || E'\n'; fails := fails + 1; end if;
  if not exists (select 1 from public.gear_categories where name like 'SET _ VIDEO') then r := r || 'PASS: ' || 'geen SET-categorieën meer' || E'\n'; else r := r || 'FAIL: ' || 'geen SET-categorieën meer' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kits where category_id in ('657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0')) = 0 and (select count(*) from public.gear_items where category_id in ('657b7c60-6c88-4cf1-a7e8-daa1f64d95de', '67c0f2dd-11a8-40e3-9a3c-f79f42efca22', '1951116e-b155-4300-a9e9-9004899166a3', 'dc5d60b8-8195-4a4b-b656-ffcd870e00d0')) = 0 then r := r || 'PASS: ' || 'geen kit of item meer in de oude categorieën' || E'\n'; else r := r || 'FAIL: ' || 'geen kit of item meer in de oude categorieën' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_items) = 197 and (select count(*) from public.gear_kits) = 23 then r := r || 'PASS: ' || '197 items en 23 kits, ongewijzigd' || E'\n'; else r := r || 'FAIL: ' || '197 items en 23 kits, ongewijzigd' || E'\n'; fails := fails + 1; end if;
  if (select string_agg(name, ' | ' order by sort_order) from public.gear_kits where category_id = '4808d2b6-8b85-4ea1-97df-8384356f5e45') = 'FX3 A (groene labels) | FX3 B (wit label) | FX3 C (zwart label) | Sony A7S III' then r := r || 'PASS: ' || 'kits in Video: FX3 A, FX3 B, FX3 C, A7S III' || E'\n'; else r := r || 'FAIL: ' || 'kits in Video: FX3 A, FX3 B, FX3 C, A7S III' || E'\n'; fails := fails + 1; end if;
  if (select string_agg(name, ' | ' order by sort_order) from public.gear_items where category_id = '4808d2b6-8b85-4ea1-97df-8384356f5e45') = 'Sony FX3 A | Sony FX3 B | Sony FX3 C | Sony A7S III body | Sony FS7' then r := r || 'PASS: ' || 'items in Video: de vier bodies en de losse FS7, in volgorde' || E'\n'; else r := r || 'FAIL: ' || 'items in Video: de vier bodies en de losse FS7, in volgorde' || E'\n'; fails := fails + 1; end if;
  if not exists ((select soort, id, naam, extra, sort_order from _voor) except (select 'cat', id, name, color, sort_order from public.gear_categories union all select 'kit', id, name, category_id::text, sort_order from public.gear_kits union all select 'item', id, name, category_id::text, sort_order from public.gear_items)) then r := r || 'PASS: ' || 'alle andere categorieën, kits en items onaangeroerd' || E'\n'; else r := r || 'FAIL: ' || 'alle andere categorieën, kits en items onaangeroerd' || E'\n'; fails := fails + 1; end if;
  if (select leden from _tellers) = (select count(*) from public.gear_kit_members where removed_at is null) and (select boekingen from _tellers) = (select count(*) from public.gear_bookings) and (select regels from _tellers) = (select count(*) from public.gear_booking_items) and (select logregels from _tellers) = (select count(*) from public.gear_status_log) then r := r || 'PASS: ' || 'kitlidmaatschap, boekingen en statuslogboek onaangeroerd' || E'\n'; else r := r || 'FAIL: ' || 'kitlidmaatschap, boekingen en statuslogboek onaangeroerd' || E'\n'; fails := fails + 1; end if;
  if fails > 0 then raise exception E'Afgebroken, niets opgeslagen:\n%', r; end if;
  raise notice '%', r;
end $$;

commit;
