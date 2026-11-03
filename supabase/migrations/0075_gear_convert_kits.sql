-- Materiaalplanner: kit-inhoud omzetten naar items en kits (0075).
-- Gegevens. Alleen gear_*; equipment* en andere tabellen blijven onaangeroerd.
-- Eenmalig: de eerste controle weigert als de catalogus niet in de stand van na 0074 is.
-- Klopt een eindcontrole niet, dan breekt alles af en verandert er niets.
begin;

-- ── Voorwaarden: precies de stand van na 0074 ───────────────────────────────
do $$
begin
  if (select count(*) from public.gear_items) <> 75 or exists (select 1 from public.gear_kits)
     or exists (select 1 from public.gear_kit_members) or (select count(*) from public.gear_unit_contents) <> 104
     or (select count(*) from public.gear_categories) <> 15 then
    raise exception 'Afgebroken: de catalogus is niet meer in de stand van na 0074.';
  end if;
  if (select count(*) from public.gear_booking_items where item_id = 'e7482eee-cd47-4d83-820c-4752248f7061') <> 2
     or (select count(*) from public.gear_status_log) <> 2 then
    raise exception 'Afgebroken: boekingen of statuslogboek wijken af van wat verwacht werd.';
  end if;
  if (select count(*) from public.clients where id in ('f54c741b-059f-49ad-854b-cf34befa631d', '7748f9c3-8fc0-42ea-8942-6f58054bea22')) <> 2 then
    raise exception 'Afgebroken: Friends of Sports of Sporting Hasselt niet gevonden.';
  end if;
end $$;

-- De statuswijzigingen hieronder zijn een verhuis, geen nieuwe meldingen.
select set_config('gear.skip_log', 'on', true);

-- ── 1. Nieuwe categorieën ───────────────────────────────────────────────────
insert into public.gear_categories (name, color, sort_order) values
  ('Monitoren', '#0891b2', 16),
  ('Batterijen & laders', '#65a30d', 17),
  ('Kaarten & lezers', '#a16207', 18),
  ('Kabels', '#78716c', 19),
  ('Audio-accessoires', '#9333ea', 20),
  ('Rigging & accessoires', '#475569', 21);

-- ── 2. Kits ─────────────────────────────────────────────────────────────────
insert into public.gear_kits (category_id, name, label_color, warning, notes, responsible_client_id, sort_order)
select c.id, v.name, v.label_color, v.warning, v.notes, v.resp, v.sort
  from (values
    ('SET 1 VIDEO', 'FX3 A (groene labels)', 'groen', null, null, null::uuid, 1),
    ('SET 2 VIDEO', 'FX3 B (wit label)', 'wit', null, null, null::uuid, 1),
    ('SET 3 VIDEO', 'FX3 C (zwart label)', 'zwart', null, null, null::uuid, 1),
    ('SET 4 VIDEO', 'Sony A7S III', null, null, null, null::uuid, 1),
    ('FOTO', 'Sony A7 IV (groen)', 'groen', null, null, null::uuid, 2),
    ('FOTO', 'Sony A7 III', null, null, 'Duo-lader blijft bij FoS', null::uuid, 3),
    ('FOTO', 'Sony A7 IV (wit)', 'wit', null, null, null::uuid, 4),
    ('FOTO', 'Sony A7R', null, null, 'Duo-lader blijft bij FoS', 'f54c741b-059f-49ad-854b-cf34befa631d'::uuid, 6),
    ('Tentacle', 'Set 2 Tentacle (groen)', 'groen', null, null, null::uuid, 4),
    ('Tentacle', 'Set 3 Tentacle (oranje)', 'oranje', null, null, null::uuid, 5),
    ('Tentacle', 'Set 4 Tentacle (blauw)', 'blauw', null, null, null::uuid, 6),
    ('Sennheiser', 'Set 1 prikkers Sennheiser', null, null, null, null::uuid, 1),
    ('Sennheiser', 'Set 2 prikkers Sennheiser', null, null, null, null::uuid, 2),
    ('Sennheiser', 'Boompole + shotgun mic', null, null, null, null::uuid, 3),
    ('Sennheiser', 'Shotgun mic Sennheiser (zwarte hoes)', null, null, null, null::uuid, 4),
    ('LICHT', 'Nanlite Tubes', null, null, null, null::uuid, 2),
    ('LICHT', 'Softbox Nanlite set A', null, null, null, null::uuid, 4),
    ('LICHT', 'Softbox Nanlite set B', null, null, null, null::uuid, 5),
    ('GoPro', 'Insta360 X4 (wit 1)', 'wit', null, null, null::uuid, 1),
    ('GoPro', 'Insta360 X4 (groen 2)', 'groen', null, null, null::uuid, 2),
    ('GoPro', 'GoPro 10', null, 'Oververhit makkelijk', null, null::uuid, 4),
    ('Studio', 'Blackmagics', null, null, null, null::uuid, 4),
    ('Studio', 'Studiostatieven', null, null, null, null::uuid, 5)
  ) as v(cat, name, label_color, warning, notes, resp, sort)
  join public.gear_categories c on c.name = v.cat;

-- ── 3. Bestaande items: nieuwe naam, model, nummer, categorie, specs ────────
update public.gear_items g
   set category_id = c.id, name = v.name, model = v.model, number = v.number, sort_order = v.sort,
       label_color = v.label_color, nd_size = v.nd, warning = v.warning, notes = v.notes,
       status = v.status, status_note = v.status_note, responsible_client_id = v.resp
  from (values
    ('e7482eee-cd47-4d83-820c-4752248f7061'::uuid, 'SET 1 VIDEO', 'Sony FX3 A', 'Sony FX3', 'A', 1, 'groen', null, null, null, 'ok', null, null::uuid),
    ('46fca052-8bf6-4d13-9c01-80fe61b7d659'::uuid, 'SET 2 VIDEO', 'Sony FX3 B', 'Sony FX3', 'B', 1, 'wit', null, null, null, 'ok', null, null::uuid),
    ('12e64dec-6ae2-4695-b87d-f5d868bc2fac'::uuid, 'SET 3 VIDEO', 'Sony FX3 C', 'Sony FX3', 'C', 1, 'zwart', null, null, null, 'ok', null, null::uuid),
    ('cba370b0-43fa-4acc-b14b-ea76cde7f308'::uuid, 'SET 4 VIDEO', 'Sony A7S III body', 'Sony A7S III', null, 1, null, null, null, null, 'ok', null, null::uuid),
    ('ae13dcd0-8ecb-4895-af42-ada833c4be3a'::uuid, 'SET 5 VIDEO', 'Sony FS7', null, null, 1, null, null, null, 'Vrij, maar CFast-reader nog uit te zoeken', 'ok', null, null::uuid),
    ('1fc57e07-4574-4c16-bc16-8bc132795168'::uuid, 'FOTO', 'Sony A7 V', null, null, 1, null, null, null, 'Ook voor video', 'ok', null, null::uuid),
    ('36760f8a-0023-4253-b596-c03df8352bd5'::uuid, 'FOTO', 'Sony A7 IV groen body', 'Sony A7 IV', 'groen', 2, 'groen', null, null, null, 'ok', null, null::uuid),
    ('5f87d6c0-e731-4e38-9c51-5004a4e9547b'::uuid, 'FOTO', 'Sony A7 III body', 'Sony A7 III', null, 3, null, null, null, null, 'ok', null, null::uuid),
    ('a5c03b42-430e-4708-9b5f-5e00f89e8d1f'::uuid, 'FOTO', 'Sony A7 IV wit body', 'Sony A7 IV', 'wit', 4, 'wit', null, null, null, 'ok', null, null::uuid),
    ('77a0bf40-3e68-4edf-9d79-938b204a4a00'::uuid, 'FOTO', 'Godox V1 flitser', null, null, 6, null, null, null, null, 'ok', null, null::uuid),
    ('73734633-0407-4904-8142-788eca9f03a8'::uuid, 'FOTO', 'Sony A7R body', 'Sony A7R', null, 7, null, null, null, null, 'ok', null, null::uuid),
    ('3649ee3f-0fa6-45eb-9ead-82f38617b77f'::uuid, 'EXTRA LENZEN', 'Sony 70-200mm 1 (zwart)', null, null, 9, 'zwart', '77', null, null, 'ok', null, null::uuid),
    ('532ce66e-1f6a-41e0-82ba-f0025c66f210'::uuid, 'EXTRA LENZEN', 'Sony 70-200mm 2 (groen)', null, null, 10, 'groen', '77', null, null, 'ok', null, null::uuid),
    ('a1416476-1b3f-4154-8536-4d85935e79bd'::uuid, 'EXTRA LENZEN', 'Sony 70-200mm 3', null, null, 11, null, null, 'Enkel MF of foto', null, 'ok', null, null::uuid),
    ('7942ee16-b42a-4ddf-ac7c-117fb56bd7f7'::uuid, 'EXTRA LENZEN', 'Sony 70-200mm 4', null, null, 12, null, null, 'Enkel MF of foto', null, 'ok', null, null::uuid),
    ('91e2f83d-d381-4b60-896f-de6d875d502f'::uuid, 'EXTRA LENZEN', 'Sigma 70-200mm', null, null, 13, null, null, null, null, 'ok', null, '7748f9c3-8fc0-42ea-8942-6f58054bea22'::uuid),
    ('aeba0e21-1cda-42fc-a496-edcb7ca3a0f8'::uuid, 'EXTRA LENZEN', 'Tamron 35-150mm F/2-2.8 #1', null, null, 14, null, '82', null, null, 'ok', null, null::uuid),
    ('c72a0b79-d7ad-4e02-b116-a20e053bbda2'::uuid, 'EXTRA LENZEN', 'Tamron 35-150mm F/2-2.8 #2', null, null, 15, null, '82', null, null, 'ok', null, null::uuid),
    ('540b18f4-2891-488b-8b36-dcc8676c564b'::uuid, 'EXTRA LENZEN', 'Tamron 28-200mm', null, null, 16, null, null, null, null, 'ok', null, null::uuid),
    ('b6dee735-a77a-4ea4-92e7-249f1c7c6cc5'::uuid, 'EXTRA LENZEN', 'Sony 16-35mm F/2.8', null, null, 17, null, '82', null, null, 'defect', 'Kapot (zo genoteerd in de planning)', null::uuid),
    ('8b85d3cf-c805-472d-9a9f-dd4b66b50ba0'::uuid, 'EXTRA LENZEN', 'Sigma 16-28mm F/2.8 #1', null, null, 18, null, '72', null, null, 'ok', null, null::uuid),
    ('328c55a6-77a3-4fef-9239-5cdf21576d40'::uuid, 'EXTRA LENZEN', 'Sigma 16-28mm F/2.8 #2', null, null, 19, null, '72', null, null, 'ok', null, null::uuid),
    ('df9c9667-5342-4fbd-af17-c0a12e112a74'::uuid, 'EXTRA LENZEN', 'Laowa 10mm F/2.8', null, null, 20, null, '77', null, null, 'ok', null, null::uuid),
    ('2a147aad-f364-4049-a1a2-d3b92a254d93'::uuid, 'EXTRA LENZEN', 'Sigma Cine 18-35mm', null, null, 21, null, null, 'Vaste MF', null, 'ok', null, null::uuid),
    ('d25a3b24-9206-434f-9514-1c6e908d0ef3'::uuid, 'EXTRA LENZEN', 'Sigma 24-70mm #2', 'Sigma 24-70mm', '#2', 22, null, null, null, null, 'ok', null, null::uuid),
    ('e79cfcd0-6f09-4f95-8b30-4c557d840488'::uuid, 'EXTRA LENZEN', 'Samyang 14mm F/2.8', null, null, 23, null, null, null, null, 'ok', null, null::uuid),
    ('62560c38-7cf9-433a-b2f7-d3db66905a00'::uuid, 'Tentacle', 'Tentacle Sync E 1', null, null, 1, null, null, null, null, 'ok', null, null::uuid),
    ('36d50463-a5aa-458e-9e54-1bd0c8ac7ff3'::uuid, 'Tentacle', 'Tentacle Sync E 2', null, null, 2, null, null, null, null, 'ok', null, null::uuid),
    ('31494eb5-95d6-4985-8792-285e5d767d2e'::uuid, 'Tentacle', 'Set 1 Tentacle (groen)', null, null, 3, 'groen', null, null, null, 'ok', null, null::uuid),
    ('d9b286dc-845d-41cd-94b2-591a9acf167c'::uuid, 'Tentacle', 'Rode stick', null, null, 8, null, null, null, null, 'ok', null, null::uuid),
    ('d41b66fa-0262-4b1e-a251-3191476351e8'::uuid, 'Tentacle', 'Rode Pro 1 (prikkers)', null, null, 9, null, null, null, null, 'ok', null, null::uuid),
    ('fe511c52-aa9c-4b73-9a9b-d7d7b0173aff'::uuid, 'Tentacle', 'Rode Pro 2 (prikkers)', null, null, 10, null, null, null, null, 'ok', null, null::uuid),
    ('f51f6ae7-8c03-46e7-b46f-ff7e0c3dfd96'::uuid, 'LICHT', '5-in-1 reflectieschermen', null, null, 4, null, null, null, null, 'ok', null, null::uuid),
    ('e11e93e8-5872-4752-bd16-433ce2f007b8'::uuid, 'LICHT', 'Nanlite FS200 LED dual kit', null, null, 7, null, null, null, null, 'ok', null, null::uuid),
    ('bc802e67-891c-4a7f-a6ff-3d875bbcdc41'::uuid, 'LICHT', 'LED paneeltje A', null, null, 16, null, null, null, null, 'ok', null, null::uuid),
    ('3b9774ff-ccf9-4a69-927b-529cbbf0822e'::uuid, 'LICHT', 'LED paneeltje B', null, null, 17, null, null, null, null, 'ok', null, 'f54c741b-059f-49ad-854b-cf34befa631d'::uuid),
    ('78025beb-344e-4ab1-bc24-3ac8925be43a'::uuid, 'GoPro', 'Powerbank voor GoPro', null, null, 3, null, null, null, null, 'ok', null, null::uuid),
    ('f4b87dab-1881-45c3-836d-531e88317577'::uuid, 'GoPro', 'GoPro 10 body', 'GoPro 10', null, 4, null, null, 'Oververhit makkelijk', null, 'ok', null, null::uuid),
    ('e688449a-e577-4cfe-86cc-2e0fa933873d'::uuid, 'GoPro', 'GoPro klem', null, null, 5, null, null, null, null, 'ok', null, null::uuid),
    ('61d87836-74e9-46d8-9ee0-b5809d4b869b'::uuid, 'GoPro', 'GoPro harnas 1', null, null, 6, null, null, null, null, 'ok', null, null::uuid),
    ('13bbeb58-90e8-4e57-ad2a-64cf7c2cca8c'::uuid, 'GoPro', 'GoPro harnas 2', null, null, 7, null, null, null, null, 'ok', null, null::uuid),
    ('14782ab3-79e9-4b2c-936a-b9f80df45805'::uuid, 'GoPro', 'GoPro armband', null, null, 8, null, null, null, null, 'ok', null, null::uuid),
    ('e63ff983-37f2-4ab7-9db6-65de27681ab2'::uuid, 'Drone', 'Drone', null, null, 1, null, null, null, null, 'ok', null, null::uuid),
    ('9ce30c18-0d08-4c9f-ae6e-899273508de4'::uuid, 'Statieven', 'Smallrig Potato Jet statief', null, null, 1, null, null, null, null, 'ok', null, null::uuid),
    ('b7e4ee5c-66a2-4b0a-b145-84c9a41eea31'::uuid, 'Statieven', 'Manfrotto videostatief', null, null, 2, null, null, null, null, 'ok', null, null::uuid),
    ('5db25ac2-fbb6-44d3-bee4-a9dc2e662e49'::uuid, 'Statieven', 'Manfrotto videostatief (Spor)', null, null, 3, null, null, null, null, 'ok', null, '7748f9c3-8fc0-42ea-8942-6f58054bea22'::uuid),
    ('47fb2e14-b1b6-449b-a6f6-34926799fb38'::uuid, 'Statieven', 'Viltrox videostatief', null, null, 4, null, null, null, null, 'ok', null, null::uuid),
    ('0d2f453c-e8d6-4935-ae96-06903f2ba025'::uuid, 'Statieven', 'Klein bruin statief #1', 'Klein bruin statief', '#1', 5, null, null, null, null, 'ok', null, null::uuid),
    ('85157618-0da9-409e-93ba-1147ca6a352c'::uuid, 'Statieven', 'Boom statief', null, null, 7, null, null, null, null, 'ok', null, null::uuid),
    ('023cc566-821e-47b1-bdd7-afc84e212b81'::uuid, 'Extra', 'Schouderstatief', null, null, 1, null, null, null, null, 'ok', null, null::uuid),
    ('9273742e-b362-4845-9618-878733b91b49'::uuid, 'Extra', 'Polarisatie filter 77mm', null, null, 2, null, null, null, null, 'ok', null, null::uuid),
    ('155ff3cf-0d3f-42cd-ab6e-1effd6b6a3b2'::uuid, 'Extra', 'Achtergrondstatieven', null, null, 3, null, null, null, null, 'ok', null, null::uuid),
    ('3d5afe91-e02c-4376-adb3-1117735aa741'::uuid, 'Extra', 'Tiltamax focus handle + battery', null, null, 4, null, null, null, null, 'ok', null, null::uuid),
    ('6733b8c4-c748-4abb-8b44-28751b109d69'::uuid, 'Extra', 'POV helm', null, null, 5, null, null, null, null, 'ok', null, null::uuid),
    ('0243de13-2fe6-427f-8694-589f4003c0bb'::uuid, 'Extra', 'DJI RS 4 Pro', null, null, 6, null, null, null, null, 'ok', null, null::uuid),
    ('265cab39-56b7-4529-9cfe-38318bdd006f'::uuid, 'Studio', 'Monitor', null, null, 1, null, null, null, null, 'ok', null, null::uuid),
    ('ba93209d-ae62-4060-9dcf-d711fcc4c3d7'::uuid, 'Studio', 'SSD opnameschijf Ballieman', null, null, 2, null, null, null, null, 'ok', null, null::uuid),
    ('6a402f41-a6e4-4abe-831d-1baf37ac5490'::uuid, 'Studio', 'ATEM mengpaneel', null, null, 3, null, null, null, null, 'ok', null, null::uuid),
    ('566b8cd2-0034-4c88-ac89-c109517446f5'::uuid, 'Studio', 'Blackmagic #1', 'Blackmagic', '#1', 4, null, null, null, null, 'ok', null, null::uuid),
    ('8bc8de33-0f42-4419-a8f3-6101069d6511'::uuid, 'Studio', 'Studiostatief #1', 'Studiostatief', '#1', 9, null, null, null, null, 'ok', null, null::uuid),
    ('088b999f-beb9-4d08-8101-3ddb17a36e3d'::uuid, 'Studio', 'MixPre 10 + SD-kaart', null, null, 14, null, null, null, null, 'ok', null, null::uuid),
    ('b5ed83a8-c1e9-4e17-91c1-36c07053fae2'::uuid, 'Studio', 'Zoom H8', null, null, 15, null, null, null, null, 'ok', null, null::uuid),
    ('41dc9454-185b-4627-b8d1-edfb193c7f8a'::uuid, 'Studio', 'Atomos + schijf', null, null, 16, null, null, null, null, 'ok', null, null::uuid)
  ) as v(id, cat, name, model, number, sort, label_color, nd, warning, notes, status, status_note, resp)
  join public.gear_categories c on c.name = v.cat
 where g.id = v.id;

-- ── 4. Nieuwe items (uit de kit-inhoud en de bundels) ───────────────────────
insert into public.gear_items
  (category_id, name, model, number, sort_order, label_color, nd_size, warning, notes, status, status_note, responsible_client_id)
select c.id, v.name, v.model, v.number, v.sort, v.label_color, v.nd, v.warning, v.notes, v.status, v.status_note, v.resp
  from (values
    ('EXTRA LENZEN', 'Sony 24-70mm #1', 'Sony 24-70mm', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaart #1', 'CF-kaart', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaart #2', 'CF-kaart', '#2', 2, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaartlezer #1', 'CF-kaartlezer', '#1', 3, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'XLR-audiohandle #1', 'XLR-audiohandle', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #1', 'Sony batterij', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Hama 77mm variabele ND #1', 'Hama 77mm variabele ND', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Rods #1', 'Rods', '#1', 2, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Fxlion V-lock #1', 'Fxlion V-lock', '#1', 2, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Lader #1', 'Lader', '#1', 3, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', 'XLR-jack kabel #1', 'XLR-jack kabel', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Sony ECM-VG1 microfoon #1', 'Sony ECM-VG1 microfoon', '#1', 2, null, null, null, null, 'ok', null, null::uuid),
    ('Monitoren', 'Monitor Shinobi', 'Monitor Shinobi', null, 1, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', 'HDMI-kabel', 'HDMI-kabel', null, 2, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Atomos batterij', 'Atomos batterij', null, 4, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Pocket LED #1', 'Pocket LED', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sony 24-70mm #2', 'Sony 24-70mm', '#2', 2, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaart #3', 'CF-kaart', '#3', 4, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaart #4', 'CF-kaart', '#4', 5, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaartlezer #2', 'CF-kaartlezer', '#2', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'XLR-audiohandle #2', 'XLR-audiohandle', '#2', 3, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #2', 'Sony batterij', '#2', 5, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Hama 77mm variabele ND #2', 'Hama 77mm variabele ND', '#2', 3, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Rods #2', 'Rods', '#2', 4, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Tilta V-mount plaat #1', 'Tilta V-mount plaat', '#1', 5, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Fxlion V-lock #2', 'Fxlion V-lock', '#2', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Lader #2', 'Lader', '#2', 7, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', 'XLR-jack kabel #2', 'XLR-jack kabel', '#2', 3, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Sony ECM-VG1 microfoon #2', 'Sony ECM-VG1 microfoon', '#2', 4, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Pocket LED #2', 'Pocket LED', '#2', 2, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Tamron 28-75mm F/2.8 #1', 'Tamron 28-75mm F/2.8', '#1', 3, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaart #5', 'CF-kaart', '#5', 7, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'CF-kaartlezer #3', 'CF-kaartlezer', '#3', 8, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'XLR-audiohandle #3', 'XLR-audiohandle', '#3', 5, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #3', 'Sony batterij', '#3', 8, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #4', 'Sony batterij', '#4', 9, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #5', 'Sony batterij', '#5', 10, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Hama 77mm variabele ND #3', 'Hama 77mm variabele ND', '#3', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Rods #3', 'Rods', '#3', 7, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Tilta V-mount plaat #2', 'Tilta V-mount plaat', '#2', 8, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Fxlion V-lock #3', 'Fxlion V-lock', '#3', 11, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Lader #3', 'Lader', '#3', 12, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Sony ECM-VG1 microfoon #3', 'Sony ECM-VG1 microfoon', '#3', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Monitoren', 'Monitor Desview R6', 'Monitor Desview R6', null, 2, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Pocket LED #3', 'Pocket LED', '#3', 3, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Tamron 28-75mm F/2.8 #2', 'Tamron 28-75mm F/2.8', '#2', 4, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #6', 'Sony batterij', '#6', 13, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #7', 'Sony batterij', '#7', 14, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #8', 'Sony batterij', '#8', 15, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sigma 24-70mm #1', 'Sigma 24-70mm', '#1', 5, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #9', 'Sony batterij', '#9', 16, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #10', 'Sony batterij', '#10', 17, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #11', 'Sony batterij', '#11', 18, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony lader', 'Sony lader', null, 19, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Tamron 28-75mm F/2.8 #3', 'Tamron 28-75mm F/2.8', '#3', 6, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sony 24-105mm', 'Sony 24-105mm', null, 7, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'ND-filter', 'ND-filter', null, 9, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #12', 'Sony batterij', '#12', 20, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #13', 'Sony batterij', '#13', 21, null, null, null, null, 'ok', null, null::uuid),
    ('FOTO', 'Godox flitser', 'Godox flitser', null, 5, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'Lexar SD-kaart #1', 'Lexar SD-kaart', '#1', 9, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'Lexar SD-kaart #2', 'Lexar SD-kaart', '#2', 10, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony BC-ZD1 lader', 'Sony BC-ZD1 lader', null, 22, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Rode VideoMicro II', 'Rode VideoMicro II', null, 7, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Lowepro Nova 200 AW II tas', 'Lowepro Nova 200 AW II tas', null, 10, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Tamron 28-75mm F/2.8 #4', 'Tamron 28-75mm F/2.8', '#4', 8, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #14', 'Sony batterij', '#14', 23, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #15', 'Sony batterij', '#15', 24, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Sony batterij #16', 'Sony batterij', '#16', 25, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Tentacle #1', 'Tentacle', '#1', 4, 'groen', null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Tentacle #2', 'Tentacle', '#2', 5, 'groen', null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Microfoon (Tentacle-set) #1', 'Microfoon (Tentacle-set)', '#1', 8, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'Micro-SD-kaart #1', 'Micro-SD-kaart', '#1', 11, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Tentacle #3', 'Tentacle', '#3', 6, 'oranje', null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Microfoon (Tentacle-set) #2', 'Microfoon (Tentacle-set)', '#2', 9, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'Micro-SD-kaart #2', 'Micro-SD-kaart', '#2', 12, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Windkap #1', 'Windkap', '#1', 10, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Tentacle #4', 'Tentacle', '#4', 7, 'blauw', null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Microfoon (Tentacle-set) #3', 'Microfoon (Tentacle-set)', '#3', 11, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'Micro-SD-kaart #3', 'Micro-SD-kaart', '#3', 13, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Windkap #2', 'Windkap', '#2', 12, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Sennheiser zender #1', 'Sennheiser zender', '#1', 1, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Sennheiser ontvanger #1', 'Sennheiser ontvanger', '#1', 2, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', '3,5mm-jackkabel #1', '3,5mm-jackkabel', '#1', 4, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Sennheiser zender #2', 'Sennheiser zender', '#2', 3, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Sennheiser ontvanger #2', 'Sennheiser ontvanger', '#2', 4, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', '3,5mm-jackkabel #2', '3,5mm-jackkabel', '#2', 5, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Boompole', 'Boompole', null, 13, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Shotgun mic #1', 'Shotgun mic', '#1', 14, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Zwarte hoes (shotgun mic)', 'Zwarte hoes (shotgun mic)', null, 15, null, null, null, null, 'ok', null, null::uuid),
    ('Audio-accessoires', 'Shotgun mic #2', 'Shotgun mic', '#2', 16, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Nanlite Tube #1', 'Nanlite Tube', '#1', 5, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Nanlite Tube #2', 'Nanlite Tube', '#2', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Ministatief #1', 'Ministatief', '#1', 11, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Ministatief #2', 'Ministatief', '#2', 12, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', 'Stroomkabel #1', 'Stroomkabel', '#1', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', 'Stroomkabel #2', 'Stroomkabel', '#2', 7, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Nanlite lamp #1', 'Nanlite lamp', '#1', 8, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Softbox #1', 'Softbox', '#1', 9, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Lichtstatief #1', 'Lichtstatief', '#1', 10, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Oranje filter #1', 'Oranje filter', '#1', 11, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Nanlite lamp #2', 'Nanlite lamp', '#2', 12, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Softbox #2', 'Softbox', '#2', 13, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Lichtstatief #2', 'Lichtstatief', '#2', 14, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Oranje filter #2', 'Oranje filter', '#2', 15, null, null, null, null, 'ok', null, null::uuid),
    ('GoPro', 'Insta360 X4 #1', 'Insta360 X4', '#1', 1, 'wit', null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Stick + statief (Insta360) #1', 'Stick + statief (Insta360)', '#1', 13, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'Micro-SD-kaart 256GB #1', 'Micro-SD-kaart 256GB', '#1', 14, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Third-person bike tail mount #1', 'Third-person bike tail mount', '#1', 14, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'GoPro accessory mount #1', 'GoPro accessory mount', '#1', 15, null, null, null, null, 'ok', null, null::uuid),
    ('GoPro', 'Insta360 X4 #2', 'Insta360 X4', '#2', 2, 'groen', null, null, null, 'beperkt', 'Kapotte vijs', null::uuid),
    ('Rigging & accessoires', 'Stick + statief (Insta360) #2', 'Stick + statief (Insta360)', '#2', 16, null, null, null, null, 'ok', null, null::uuid),
    ('Kaarten & lezers', 'Micro-SD-kaart 256GB #2', 'Micro-SD-kaart 256GB', '#2', 15, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Third-person bike tail mount #2', 'Third-person bike tail mount', '#2', 17, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'GoPro accessory mount #2', 'GoPro accessory mount', '#2', 18, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'GoPro batterij #1', 'GoPro batterij', '#1', 26, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'GoPro batterij #2', 'GoPro batterij', '#2', 27, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'GoPro batterij #3', 'GoPro batterij', '#3', 28, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'GoPro dual battery charger', 'GoPro dual battery charger', null, 29, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Curved adhesive mount', 'Curved adhesive mount', null, 19, null, null, null, null, 'ok', null, null::uuid),
    ('Rigging & accessoires', 'Buckle + thumb screw', 'Buckle + thumb screw', null, 20, null, null, null, null, 'ok', null, null::uuid),
    ('Kabels', 'USB-C kabel', 'USB-C kabel', null, 8, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Telesin laadbox', 'Telesin laadbox', null, 30, null, null, null, null, 'ok', null, null::uuid),
    ('Statieven', 'Klein bruin statief #2', 'Klein bruin statief', '#2', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Blackmagic #2', 'Blackmagic', '#2', 5, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Blackmagic #3', 'Blackmagic', '#3', 6, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Blackmagic #4', 'Blackmagic', '#4', 7, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Blackmagic #5', 'Blackmagic', '#5', 8, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Studiostatief #2', 'Studiostatief', '#2', 10, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Studiostatief #3', 'Studiostatief', '#3', 11, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Studiostatief #4', 'Studiostatief', '#4', 12, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Studiostatief #5', 'Studiostatief', '#5', 13, null, null, null, null, 'ok', null, null::uuid),
    ('Batterijen & laders', 'Duo-lader #1', 'Duo-lader', '#1', 31, null, null, null, null, 'ok', null, 'f54c741b-059f-49ad-854b-cf34befa631d'::uuid),
    ('Batterijen & laders', 'Duo-lader #2', 'Duo-lader', '#2', 32, null, null, null, null, 'ok', null, 'f54c741b-059f-49ad-854b-cf34befa631d'::uuid)
  ) as v(cat, name, model, number, sort, label_color, nd, warning, notes, status, status_note, resp)
  join public.gear_categories c on c.name = v.cat;

-- ── 5. Kits samenstellen ────────────────────────────────────────────────────
insert into public.gear_kit_members (kit_id, item_id, sort_order, added_by_name)
select k.id, i.id, v.sort, 'Migratie (0075)'
  from (values
    ('FX3 A (groene labels)', 'Sony FX3 A', 1),
    ('FX3 A (groene labels)', 'Sony 24-70mm #1', 2),
    ('FX3 A (groene labels)', 'CF-kaart #1', 3),
    ('FX3 A (groene labels)', 'CF-kaart #2', 4),
    ('FX3 A (groene labels)', 'CF-kaartlezer #1', 5),
    ('FX3 A (groene labels)', 'XLR-audiohandle #1', 6),
    ('FX3 A (groene labels)', 'Sony batterij #1', 7),
    ('FX3 A (groene labels)', 'Hama 77mm variabele ND #1', 8),
    ('FX3 A (groene labels)', 'Rods #1', 9),
    ('FX3 A (groene labels)', 'Fxlion V-lock #1', 10),
    ('FX3 A (groene labels)', 'Lader #1', 11),
    ('FX3 A (groene labels)', 'XLR-jack kabel #1', 12),
    ('FX3 A (groene labels)', 'Sony ECM-VG1 microfoon #1', 13),
    ('FX3 A (groene labels)', 'Monitor Shinobi', 14),
    ('FX3 A (groene labels)', 'HDMI-kabel', 15),
    ('FX3 A (groene labels)', 'Atomos batterij', 16),
    ('FX3 A (groene labels)', 'Pocket LED #1', 17),
    ('FX3 B (wit label)', 'Sony FX3 B', 1),
    ('FX3 B (wit label)', 'Sony 24-70mm #2', 2),
    ('FX3 B (wit label)', 'CF-kaart #3', 3),
    ('FX3 B (wit label)', 'CF-kaart #4', 4),
    ('FX3 B (wit label)', 'CF-kaartlezer #2', 5),
    ('FX3 B (wit label)', 'XLR-audiohandle #2', 6),
    ('FX3 B (wit label)', 'Sony batterij #2', 7),
    ('FX3 B (wit label)', 'Hama 77mm variabele ND #2', 8),
    ('FX3 B (wit label)', 'Rods #2', 9),
    ('FX3 B (wit label)', 'Tilta V-mount plaat #1', 10),
    ('FX3 B (wit label)', 'Fxlion V-lock #2', 11),
    ('FX3 B (wit label)', 'Lader #2', 12),
    ('FX3 B (wit label)', 'XLR-jack kabel #2', 13),
    ('FX3 B (wit label)', 'Sony ECM-VG1 microfoon #2', 14),
    ('FX3 B (wit label)', 'Pocket LED #2', 15),
    ('FX3 C (zwart label)', 'Sony FX3 C', 1),
    ('FX3 C (zwart label)', 'Tamron 28-75mm F/2.8 #1', 2),
    ('FX3 C (zwart label)', 'CF-kaart #5', 3),
    ('FX3 C (zwart label)', 'CF-kaartlezer #3', 4),
    ('FX3 C (zwart label)', 'XLR-audiohandle #3', 5),
    ('FX3 C (zwart label)', 'Sony batterij #3', 6),
    ('FX3 C (zwart label)', 'Sony batterij #4', 7),
    ('FX3 C (zwart label)', 'Sony batterij #5', 8),
    ('FX3 C (zwart label)', 'Hama 77mm variabele ND #3', 9),
    ('FX3 C (zwart label)', 'Rods #3', 10),
    ('FX3 C (zwart label)', 'Tilta V-mount plaat #2', 11),
    ('FX3 C (zwart label)', 'Fxlion V-lock #3', 12),
    ('FX3 C (zwart label)', 'Lader #3', 13),
    ('FX3 C (zwart label)', 'Sony ECM-VG1 microfoon #3', 14),
    ('FX3 C (zwart label)', 'Monitor Desview R6', 15),
    ('FX3 C (zwart label)', 'Pocket LED #3', 16),
    ('Sony A7S III', 'Sony A7S III body', 1),
    ('Sony A7S III', 'Tamron 28-75mm F/2.8 #2', 2),
    ('Sony A7S III', 'Sony batterij #6', 3),
    ('Sony A7S III', 'Sony batterij #7', 4),
    ('Sony A7S III', 'Sony batterij #8', 5),
    ('Sony A7 IV (groen)', 'Sony A7 IV groen body', 1),
    ('Sony A7 IV (groen)', 'Sigma 24-70mm #1', 2),
    ('Sony A7 IV (groen)', 'Sony batterij #9', 3),
    ('Sony A7 IV (groen)', 'Sony batterij #10', 4),
    ('Sony A7 IV (groen)', 'Sony batterij #11', 5),
    ('Sony A7 IV (groen)', 'Sony lader', 6),
    ('Sony A7 III', 'Sony A7 III body', 1),
    ('Sony A7 III', 'Tamron 28-75mm F/2.8 #3', 2),
    ('Sony A7 III', 'Sony 24-105mm', 3),
    ('Sony A7 III', 'ND-filter', 4),
    ('Sony A7 III', 'Sony batterij #12', 5),
    ('Sony A7 III', 'Sony batterij #13', 6),
    ('Sony A7 IV (wit)', 'Sony A7 IV wit body', 1),
    ('Sony A7 IV (wit)', 'Godox flitser', 2),
    ('Sony A7 IV (wit)', 'Lexar SD-kaart #1', 3),
    ('Sony A7 IV (wit)', 'Lexar SD-kaart #2', 4),
    ('Sony A7 IV (wit)', 'Sony BC-ZD1 lader', 5),
    ('Sony A7 IV (wit)', 'Rode VideoMicro II', 6),
    ('Sony A7 IV (wit)', 'Lowepro Nova 200 AW II tas', 7),
    ('Sony A7R', 'Sony A7R body', 1),
    ('Sony A7R', 'Tamron 28-75mm F/2.8 #4', 2),
    ('Sony A7R', 'Sony batterij #14', 3),
    ('Sony A7R', 'Sony batterij #15', 4),
    ('Sony A7R', 'Sony batterij #16', 5),
    ('Set 2 Tentacle (groen)', 'Tentacle #1', 1),
    ('Set 2 Tentacle (groen)', 'Tentacle #2', 2),
    ('Set 2 Tentacle (groen)', 'Microfoon (Tentacle-set) #1', 3),
    ('Set 2 Tentacle (groen)', 'Micro-SD-kaart #1', 4),
    ('Set 3 Tentacle (oranje)', 'Tentacle #3', 1),
    ('Set 3 Tentacle (oranje)', 'Microfoon (Tentacle-set) #2', 2),
    ('Set 3 Tentacle (oranje)', 'Micro-SD-kaart #2', 3),
    ('Set 3 Tentacle (oranje)', 'Windkap #1', 4),
    ('Set 4 Tentacle (blauw)', 'Tentacle #4', 1),
    ('Set 4 Tentacle (blauw)', 'Microfoon (Tentacle-set) #3', 2),
    ('Set 4 Tentacle (blauw)', 'Micro-SD-kaart #3', 3),
    ('Set 4 Tentacle (blauw)', 'Windkap #2', 4),
    ('Set 1 prikkers Sennheiser', 'Sennheiser zender #1', 1),
    ('Set 1 prikkers Sennheiser', 'Sennheiser ontvanger #1', 2),
    ('Set 1 prikkers Sennheiser', '3,5mm-jackkabel #1', 3),
    ('Set 2 prikkers Sennheiser', 'Sennheiser zender #2', 1),
    ('Set 2 prikkers Sennheiser', 'Sennheiser ontvanger #2', 2),
    ('Set 2 prikkers Sennheiser', '3,5mm-jackkabel #2', 3),
    ('Boompole + shotgun mic', 'Boompole', 1),
    ('Boompole + shotgun mic', 'Shotgun mic #1', 2),
    ('Shotgun mic Sennheiser (zwarte hoes)', 'Zwarte hoes (shotgun mic)', 1),
    ('Shotgun mic Sennheiser (zwarte hoes)', 'Shotgun mic #2', 2),
    ('Nanlite Tubes', 'Nanlite Tube #1', 1),
    ('Nanlite Tubes', 'Nanlite Tube #2', 2),
    ('Nanlite Tubes', 'Ministatief #1', 3),
    ('Nanlite Tubes', 'Ministatief #2', 4),
    ('Nanlite Tubes', 'Stroomkabel #1', 5),
    ('Nanlite Tubes', 'Stroomkabel #2', 6),
    ('Softbox Nanlite set A', 'Nanlite lamp #1', 1),
    ('Softbox Nanlite set A', 'Softbox #1', 2),
    ('Softbox Nanlite set A', 'Lichtstatief #1', 3),
    ('Softbox Nanlite set A', 'Oranje filter #1', 4),
    ('Softbox Nanlite set B', 'Nanlite lamp #2', 1),
    ('Softbox Nanlite set B', 'Softbox #2', 2),
    ('Softbox Nanlite set B', 'Lichtstatief #2', 3),
    ('Softbox Nanlite set B', 'Oranje filter #2', 4),
    ('Insta360 X4 (wit 1)', 'Insta360 X4 #1', 1),
    ('Insta360 X4 (wit 1)', 'Stick + statief (Insta360) #1', 2),
    ('Insta360 X4 (wit 1)', 'Micro-SD-kaart 256GB #1', 3),
    ('Insta360 X4 (wit 1)', 'Third-person bike tail mount #1', 4),
    ('Insta360 X4 (wit 1)', 'GoPro accessory mount #1', 5),
    ('Insta360 X4 (groen 2)', 'Insta360 X4 #2', 1),
    ('Insta360 X4 (groen 2)', 'Stick + statief (Insta360) #2', 2),
    ('Insta360 X4 (groen 2)', 'Micro-SD-kaart 256GB #2', 3),
    ('Insta360 X4 (groen 2)', 'Third-person bike tail mount #2', 4),
    ('Insta360 X4 (groen 2)', 'GoPro accessory mount #2', 5),
    ('GoPro 10', 'GoPro 10 body', 1),
    ('GoPro 10', 'GoPro batterij #1', 2),
    ('GoPro 10', 'GoPro batterij #2', 3),
    ('GoPro 10', 'GoPro batterij #3', 4),
    ('GoPro 10', 'GoPro dual battery charger', 5),
    ('GoPro 10', 'Curved adhesive mount', 6),
    ('GoPro 10', 'Buckle + thumb screw', 7),
    ('GoPro 10', 'USB-C kabel', 8),
    ('GoPro 10', 'Telesin laadbox', 9),
    ('Blackmagics', 'Blackmagic #1', 1),
    ('Blackmagics', 'Blackmagic #2', 2),
    ('Blackmagics', 'Blackmagic #3', 3),
    ('Blackmagics', 'Blackmagic #4', 4),
    ('Blackmagics', 'Blackmagic #5', 5),
    ('Studiostatieven', 'Studiostatief #1', 1),
    ('Studiostatieven', 'Studiostatief #2', 2),
    ('Studiostatieven', 'Studiostatief #3', 3),
    ('Studiostatieven', 'Studiostatief #4', 4),
    ('Studiostatieven', 'Studiostatief #5', 5)
  ) as v(kit, item, sort)
  join public.gear_kits k  on k.name = v.kit
  join public.gear_items i on i.name = v.item;

-- ── 6. De twee geannuleerde boekingen hingen aan FX3 A: nu "via" die kit ────
update public.gear_booking_items
   set via_kit_id = (select id from public.gear_kits where name = 'FX3 A (groene labels)'),
       via_kit_name = 'FX3 A (groene labels)'
 where item_id = 'e7482eee-cd47-4d83-820c-4752248f7061';

-- ── 7. Statuslogboek van de Insta360-container naar de camera erin ──────────
update public.gear_status_log
   set item_id = (select id from public.gear_items where name = 'Insta360 X4 #2')
 where item_id = '3a56c1f7-d028-4940-9932-7c03d18ebd89';

-- ── 8. Containers weg (alleen een setnaam, geen voorwerp; geen boekingen) ───
delete from public.gear_items where id in ('272209cd-f22f-4479-a392-c57a20ce4e76', 'ef9dc177-b064-45c7-abf6-0e4ab1253642', '491ef301-e84a-4913-8fb3-307d3c23d350', 'd16fb7ca-a42c-4285-99a6-9840a7d27ff4', '3a56c1f7-d028-4940-9932-7c03d18ebd89', '469e3751-6c12-430c-855b-8cb58cb983b6', 'cbecefe0-49ac-4826-a882-6eeadc4384fb', 'b8c440ff-d6d4-41a9-a3e5-011891cb0198', '3f973a30-2275-4183-902b-388fe462fb97', '3f750ca4-8647-4057-b643-61c7ed930f3c', 'bf34ec4b-c81a-4528-b04f-06d5c98be3de', 'e63b240b-a589-4c80-bbb5-aa67faa76dce');

-- ── 9. De oude kit-inhoud is omgezet ────────────────────────────────────────
drop table public.gear_unit_contents;

select set_config('gear.skip_log', '', true);

-- ── Controle: anders afbreken ──
do $$
declare r text := ''; fails int := 0;
begin
  if (select count(*) from public.gear_categories) = 21 then r := r || 'PASS: ' || '21 categorieën (15 + 6 nieuw)' || E'\n'; else r := r || 'FAIL: ' || '21 categorieën (15 + 6 nieuw)' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_items) = 197 then r := r || 'PASS: ' || '197 items' || E'\n'; else r := r || 'FAIL: ' || '197 items' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kits) = 23 then r := r || 'PASS: ' || '23 kits' || E'\n'; else r := r || 'FAIL: ' || '23 kits' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members where removed_at is null) = 142 then r := r || 'PASS: ' || '142 items in een kit' || E'\n'; else r := r || 'FAIL: ' || '142 items in een kit' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from (select item_id from public.gear_kit_members where removed_at is null group by item_id having count(*) > 1) x) = 0 then r := r || 'PASS: ' || 'elk item in hooguit één kit' || E'\n'; else r := r || 'FAIL: ' || 'elk item in hooguit één kit' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'FX3 A (groene labels)' and m.removed_at is null) = 17 then r := r || 'PASS: ' || 'kit FX3 A (groene labels): 17 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit FX3 A (groene labels): 17 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'FX3 B (wit label)' and m.removed_at is null) = 15 then r := r || 'PASS: ' || 'kit FX3 B (wit label): 15 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit FX3 B (wit label): 15 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'FX3 C (zwart label)' and m.removed_at is null) = 16 then r := r || 'PASS: ' || 'kit FX3 C (zwart label): 16 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit FX3 C (zwart label): 16 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Sony A7S III' and m.removed_at is null) = 5 then r := r || 'PASS: ' || 'kit Sony A7S III: 5 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Sony A7S III: 5 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Sony A7 IV (groen)' and m.removed_at is null) = 6 then r := r || 'PASS: ' || 'kit Sony A7 IV (groen): 6 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Sony A7 IV (groen): 6 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Sony A7 III' and m.removed_at is null) = 6 then r := r || 'PASS: ' || 'kit Sony A7 III: 6 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Sony A7 III: 6 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Sony A7 IV (wit)' and m.removed_at is null) = 7 then r := r || 'PASS: ' || 'kit Sony A7 IV (wit): 7 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Sony A7 IV (wit): 7 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Sony A7R' and m.removed_at is null) = 5 then r := r || 'PASS: ' || 'kit Sony A7R: 5 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Sony A7R: 5 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Set 2 Tentacle (groen)' and m.removed_at is null) = 4 then r := r || 'PASS: ' || 'kit Set 2 Tentacle (groen): 4 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Set 2 Tentacle (groen): 4 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Set 3 Tentacle (oranje)' and m.removed_at is null) = 4 then r := r || 'PASS: ' || 'kit Set 3 Tentacle (oranje): 4 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Set 3 Tentacle (oranje): 4 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Set 4 Tentacle (blauw)' and m.removed_at is null) = 4 then r := r || 'PASS: ' || 'kit Set 4 Tentacle (blauw): 4 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Set 4 Tentacle (blauw): 4 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Set 1 prikkers Sennheiser' and m.removed_at is null) = 3 then r := r || 'PASS: ' || 'kit Set 1 prikkers Sennheiser: 3 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Set 1 prikkers Sennheiser: 3 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Set 2 prikkers Sennheiser' and m.removed_at is null) = 3 then r := r || 'PASS: ' || 'kit Set 2 prikkers Sennheiser: 3 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Set 2 prikkers Sennheiser: 3 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Boompole + shotgun mic' and m.removed_at is null) = 2 then r := r || 'PASS: ' || 'kit Boompole + shotgun mic: 2 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Boompole + shotgun mic: 2 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Shotgun mic Sennheiser (zwarte hoes)' and m.removed_at is null) = 2 then r := r || 'PASS: ' || 'kit Shotgun mic Sennheiser (zwarte hoes): 2 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Shotgun mic Sennheiser (zwarte hoes): 2 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Nanlite Tubes' and m.removed_at is null) = 6 then r := r || 'PASS: ' || 'kit Nanlite Tubes: 6 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Nanlite Tubes: 6 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Softbox Nanlite set A' and m.removed_at is null) = 4 then r := r || 'PASS: ' || 'kit Softbox Nanlite set A: 4 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Softbox Nanlite set A: 4 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Softbox Nanlite set B' and m.removed_at is null) = 4 then r := r || 'PASS: ' || 'kit Softbox Nanlite set B: 4 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Softbox Nanlite set B: 4 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Insta360 X4 (wit 1)' and m.removed_at is null) = 5 then r := r || 'PASS: ' || 'kit Insta360 X4 (wit 1): 5 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Insta360 X4 (wit 1): 5 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Insta360 X4 (groen 2)' and m.removed_at is null) = 5 then r := r || 'PASS: ' || 'kit Insta360 X4 (groen 2): 5 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Insta360 X4 (groen 2): 5 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'GoPro 10' and m.removed_at is null) = 9 then r := r || 'PASS: ' || 'kit GoPro 10: 9 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit GoPro 10: 9 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Blackmagics' and m.removed_at is null) = 5 then r := r || 'PASS: ' || 'kit Blackmagics: 5 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Blackmagics: 5 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_kit_members m join public.gear_kits k on k.id = m.kit_id where k.name = 'Studiostatieven' and m.removed_at is null) = 5 then r := r || 'PASS: ' || 'kit Studiostatieven: 5 onderdelen' || E'\n'; else r := r || 'FAIL: ' || 'kit Studiostatieven: 5 onderdelen' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_items where id in ('272209cd-f22f-4479-a392-c57a20ce4e76', 'ef9dc177-b064-45c7-abf6-0e4ab1253642', '491ef301-e84a-4913-8fb3-307d3c23d350', 'd16fb7ca-a42c-4285-99a6-9840a7d27ff4', '3a56c1f7-d028-4940-9932-7c03d18ebd89', '469e3751-6c12-430c-855b-8cb58cb983b6', 'cbecefe0-49ac-4826-a882-6eeadc4384fb', 'b8c440ff-d6d4-41a9-a3e5-011891cb0198', '3f973a30-2275-4183-902b-388fe462fb97', '3f750ca4-8647-4057-b643-61c7ed930f3c', 'bf34ec4b-c81a-4528-b04f-06d5c98be3de', 'e63b240b-a589-4c80-bbb5-aa67faa76dce')) = 0 then r := r || 'PASS: ' || '12 containers weg' || E'\n'; else r := r || 'FAIL: ' || '12 containers weg' || E'\n'; fails := fails + 1; end if;
  if to_regclass('public.gear_unit_contents') is null then r := r || 'PASS: ' || 'alle kit-inhoud is omgezet; gear_unit_contents weg' || E'\n'; else r := r || 'FAIL: ' || 'alle kit-inhoud is omgezet; gear_unit_contents weg' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_bookings) = 2 and (select count(*) from public.gear_bookings where cancelled_at is not null) = 2 then r := r || 'PASS: ' || 'de 2 geannuleerde boekingen intact' || E'\n'; else r := r || 'FAIL: ' || 'de 2 geannuleerde boekingen intact' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_booking_items where item_id = 'e7482eee-cd47-4d83-820c-4752248f7061' and cancelled and via_kit_name = 'FX3 A (groene labels)') = 2 then r := r || 'PASS: ' || 'hun regels hangen aan Sony FX3 A, via kit FX3 A' || E'\n'; else r := r || 'FAIL: ' || 'hun regels hangen aan Sony FX3 A, via kit FX3 A' || E'\n'; fails := fails + 1; end if;
  if (select name from public.gear_items where id = 'e7482eee-cd47-4d83-820c-4752248f7061') = 'Sony FX3 A' then r := r || 'PASS: ' || 'FX3 A behield zijn id (nu Sony FX3 A)' || E'\n'; else r := r || 'FAIL: ' || 'FX3 A behield zijn id (nu Sony FX3 A)' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_status_log) = 2 then r := r || 'PASS: ' || 'statuslogboek: nog steeds 2 regels' || E'\n'; else r := r || 'FAIL: ' || 'statuslogboek: nog steeds 2 regels' || E'\n'; fails := fails + 1; end if;
  if exists (select 1 from public.gear_status_log l join public.gear_items i on i.id = l.item_id where i.name = 'Insta360 X4 #2' and l.new_status = 'beperkt') then r := r || 'PASS: ' || 'logregel verhuisd naar Insta360 X4 #2' || E'\n'; else r := r || 'FAIL: ' || 'logregel verhuisd naar Insta360 X4 #2' || E'\n'; fails := fails + 1; end if;
  if (select status from public.gear_items where name = 'Insta360 X4 #2') = 'beperkt' then r := r || 'PASS: ' || 'Insta360 X4 #2 staat op beperkt (Kapotte vijs)' || E'\n'; else r := r || 'FAIL: ' || 'Insta360 X4 #2 staat op beperkt (Kapotte vijs)' || E'\n'; fails := fails + 1; end if;
  if exists (select 1 from public.gear_status_log l join public.gear_items i on i.id = l.item_id where i.name = 'Sony 16-35mm F/2.8' and l.new_status = 'defect') then r := r || 'PASS: ' || 'logregel Sony 16-35mm intact' || E'\n'; else r := r || 'FAIL: ' || 'logregel Sony 16-35mm intact' || E'\n'; fails := fails + 1; end if;
  if (select responsible_client_id from public.gear_kits where name = 'Sony A7R') = 'f54c741b-059f-49ad-854b-cf34befa631d' then r := r || 'PASS: ' || 'kit Sony A7R: verantwoordelijke Friends of Sports' || E'\n'; else r := r || 'FAIL: ' || 'kit Sony A7R: verantwoordelijke Friends of Sports' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_items where responsible_client_id = 'f54c741b-059f-49ad-854b-cf34befa631d') = 3 then r := r || 'PASS: ' || 'Friends of Sports: LED paneeltje B + Duo-lader #1 en #2' || E'\n'; else r := r || 'FAIL: ' || 'Friends of Sports: LED paneeltje B + Duo-lader #1 en #2' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_items where responsible_client_id = '7748f9c3-8fc0-42ea-8942-6f58054bea22') = 2 then r := r || 'PASS: ' || 'Sporting Hasselt: Sigma 70-200mm + Manfrotto (Spor)' || E'\n'; else r := r || 'FAIL: ' || 'Sporting Hasselt: Sigma 70-200mm + Manfrotto (Spor)' || E'\n'; fails := fails + 1; end if;
  if (select notes from public.gear_kits where name = 'Sony A7 III') = 'Duo-lader blijft bij FoS' and (select notes from public.gear_kits where name = 'Sony A7R') = 'Duo-lader blijft bij FoS' then r := r || 'PASS: ' || 'notitie Duo-lader op kits A7 III en A7R' || E'\n'; else r := r || 'FAIL: ' || 'notitie Duo-lader op kits A7 III en A7R' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_items where legacy_equipment_id is not null) = 63 then r := r || 'PASS: ' || '63 items houden hun link met de oude planner' || E'\n'; else r := r || 'FAIL: ' || '63 items houden hun link met de oude planner' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_items where model = 'Sony batterij') = 16 and exists (select 1 from public.gear_items where name = 'Sony batterij #16') then r := r || 'PASS: ' || 'Sony batterij #1–#16' || E'\n'; else r := r || 'FAIL: ' || 'Sony batterij #1–#16' || E'\n'; fails := fails + 1; end if;
  if current_setting('gear.skip_log', true) = '' then r := r || 'PASS: ' || 'logboek-schakelaar weer uit' || E'\n'; else r := r || 'FAIL: ' || 'logboek-schakelaar weer uit' || E'\n'; fails := fails + 1; end if;
  if fails > 0 then raise exception E'Afgebroken, niets opgeslagen:\n%', r; end if;
  raise notice '%', r;
end $$;

commit;
