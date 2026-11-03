-- Materiaalplanner, stap 10: de catalogus uit de oude planner overnemen.
-- Gegevens, geen schema. Eenmalig, al live uitgevoerd; niet opnieuw draaien
-- (de eerste controle weigert als de catalogus niet leeg is).

-- LIVE catalogus kopiëren uit de oude planner naar de nieuwe (gear_*).
-- Leest equipment en equipment_categories, schrijft alleen in gear_*.
-- Klopt een controle niet, dan breekt alles af en verandert er niets.
begin;

-- ── Voorwaarden: nieuwe catalogus leeg, de drie vaste houders bestaan ───────
do $$
begin
  if exists (select 1 from public.gear_categories) or exists (select 1 from public.gear_units) then
    raise exception 'Afgebroken: de nieuwe catalogus is niet leeg. Ruim eerst testgegevens op.';
  end if;
  if (select count(*) from public.clients where id = 'f54c741b-059f-49ad-854b-cf34befa631d' and name = 'Friends of Sports') <> 1
     or (select count(*) from public.clients where id = '7748f9c3-8fc0-42ea-8942-6f58054bea22' and name = 'Sporting Hasselt') <> 1 then
    raise exception 'Afgebroken: Friends of Sports of Sporting Hasselt niet gevonden op het verwachte id.';
  end if;
  if (select count(*) from public.equipment) <> 75 or (select count(*) from public.equipment_categories) <> 15 then
    raise exception 'Afgebroken: de oude planner heeft niet meer 75 stuks in 15 categorieën.';
  end if;
end $$;

-- ── Categorieën: naam, kleur en volgorde uit de oude planner ────────────────
insert into public.gear_categories (name, color, sort_order)
select name, color, sort_order from public.equipment_categories order by sort_order;

-- ── Materiaal ───────────────────────────────────────────────────────────────
insert into public.gear_units
  (category_id, name, quantity, sort_order, label_color, nd_size, warning, notes,
   status, status_note, home_client_id, legacy_equipment_id)
select c.id, v.name, v.qty, v.sort, v.label, v.nd, v.warn, v.notes, v.status, v.snote, v.holder, e.id
  from (values
    ('SET 1 VIDEO', 'FX3 A (groene labels)', 'FX3 A (groene labels)', 1, 1, 'groen', null, null, null, 'ok', null, null::uuid),
    ('SET 2 VIDEO', 'FX3 B (wit label)', 'FX3 B (wit label)', 1, 1, 'wit', null, null, null, 'ok', null, null::uuid),
    ('SET 3 VIDEO', 'FX3 C (zwart label)', 'FX3 C (zwart label)', 1, 1, 'zwart', null, null, null, 'ok', null, null::uuid),
    ('SET 4 VIDEO', 'Sony A7S III', 'Sony A7S III', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('SET 5 VIDEO', 'Sony FS7', 'Sony FS7', 1, 1, null, null, null, 'Vrij, maar CFast-reader nog uit te zoeken', 'ok', null, null::uuid),
    ('FOTO', 'Sony A7 V', 'Sony A7 V', 1, 1, null, null, null, 'Ook voor video', 'ok', null, null::uuid),
    ('FOTO', 'Sony A7 IV (groen)', 'Sony A7 IV (groen)', 1, 2, 'groen', null, null, null, 'ok', null, null::uuid),
    ('FOTO', 'Sony A7 III', 'Sony A7 III', 1, 3, null, null, null, null, 'ok', null, null::uuid),
    ('FOTO', 'Sony A7 IV (wit)', 'Sony A7 IV (wit)', 1, 4, 'wit', null, null, null, 'ok', null, null::uuid),
    ('FOTO', 'Godox V1 flitser', 'Godox V1 flitser', 1, 5, null, null, null, null, 'ok', null, null::uuid),
    ('FOTO', 'Sony A7R', 'Sony A7R', 1, 6, null, null, null, null, 'ok', null, 'f54c741b-059f-49ad-854b-cf34befa631d'::uuid),
    ('EXTRA LENZEN', 'Sony 70-200mm 1 (zwart)', 'Sony 70-200mm 1 (zwart)', 1, 1, 'zwart', '77', null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sony 70-200mm 2 (groen)', 'Sony 70-200mm 2 (groen)', 1, 2, 'groen', '77', null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sony 70-200mm 3', 'Sony 70-200mm 3', 1, 3, null, null, 'Enkel MF of foto', null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sony 70-200mm 4', 'Sony 70-200mm 4', 1, 4, null, null, 'Enkel MF of foto', null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sigma 70-200mm', 'Sigma 70-200mm', 1, 5, null, null, null, null, 'ok', null, '7748f9c3-8fc0-42ea-8942-6f58054bea22'::uuid),
    ('EXTRA LENZEN', 'Tamron 35-150mm F/2-2.8 #1', 'Tamron 35-150mm F/2-2.8 #1', 1, 6, null, '82', null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Tamron 35-150mm F/2-2.8 #2', 'Tamron 35-150mm F/2-2.8 #2', 1, 7, null, '82', null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Tamron 28-200mm', 'Tamron 28-200mm', 1, 8, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sony 16-35mm F/2.8', 'Sony 16-35mm F/2.8', 1, 9, null, '82', null, null, 'defect', 'Kapot (zo genoteerd in de planning)', null::uuid),
    ('EXTRA LENZEN', 'Sigma 16-28mm F/2.8 #1', 'Sigma 16-28mm F/2.8 #1', 1, 10, null, '72', null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sigma 16-28mm F/2.8 #2', 'Sigma 16-28mm F/2.8 #2', 1, 11, null, '72', null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Laowa 10mm F/2.8', 'Laowa 10mm F/2.8', 1, 12, null, '77', null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sigma Cine 18-35mm', 'Sigma Cine 18-35mm', 1, 13, null, null, 'Vaste MF', null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Sigma 24-70mm', 'Sigma 24-70mm', 1, 14, null, null, null, null, 'ok', null, null::uuid),
    ('EXTRA LENZEN', 'Samyang 14mm F/2.8', 'Samyang 14mm F/2.8', 1, 15, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Tentacle Sync E 1', 'Tentacle Sync E 1', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Tentacle Sync E 2', 'Tentacle Sync E 2', 1, 2, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Set 1 Tentacle (groen)', 'Set 1 Tentacle (groen)', 1, 3, 'groen', null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Set 2 Tentacle (groen)', 'Set 2 Tentacle (groen)', 1, 4, 'groen', null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Set 3 Tentacle (oranje)', 'Set 3 Tentacle (oranje)', 1, 5, 'oranje', null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Set 4 Tentacle (blauw)', 'Set 4 Tentacle (blauw)', 1, 6, 'blauw', null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Rode stick', 'Rode stick', 1, 7, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Rode Pro 1 (prikkers)', 'Rode Pro 1 (prikkers)', 1, 8, null, null, null, null, 'ok', null, null::uuid),
    ('Tentacle', 'Rode Pro 2 (prikkers)', 'Rode Pro 2 (prikkers)', 1, 9, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Set 1 prikkers Sennheiser', 'Set 1 prikkers Sennheiser', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Set 2 prikkers Sennheiser', 'Set 2 prikkers Sennheiser', 1, 2, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Boompole + shotgun mic', 'Boompole + shotgun mic', 1, 3, null, null, null, null, 'ok', null, null::uuid),
    ('Sennheiser', 'Shotgun mic Sennheiser (zwarte hoes)', 'Shotgun mic Sennheiser (zwarte hoes)', 1, 4, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', '5-in-1 reflectieschermen', '5-in-1 reflectieschermen', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', '2x Nanlite Tubes', 'Nanlite Tubes', 2, 2, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Nanlite FS200 LED dual kit', 'Nanlite FS200 LED dual kit', 1, 3, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Softbox Nanlite set A', 'Softbox Nanlite set A', 1, 4, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'Softbox Nanlite set B', 'Softbox Nanlite set B', 1, 5, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'LED paneeltje A', 'LED paneeltje A', 1, 6, null, null, null, null, 'ok', null, null::uuid),
    ('LICHT', 'LED paneeltje B', 'LED paneeltje B', 1, 7, null, null, null, null, 'ok', null, 'f54c741b-059f-49ad-854b-cf34befa631d'::uuid),
    ('GoPro', 'Insta360 X4 (wit 1)', 'Insta360 X4 (wit 1)', 1, 1, 'wit', null, null, null, 'ok', null, null::uuid),
    ('GoPro', 'Insta360 X4 (groen 2)', 'Insta360 X4 (groen 2)', 1, 2, 'groen', null, null, null, 'beperkt', 'Kapotte vijs', null::uuid),
    ('GoPro', 'Powerbank voor GoPro', 'Powerbank voor GoPro', 1, 3, null, null, null, null, 'ok', null, null::uuid),
    ('GoPro', 'GoPro 10', 'GoPro 10', 1, 4, null, null, 'Oververhit makkelijk', null, 'ok', null, null::uuid),
    ('GoPro', 'GoPro klem', 'GoPro klem', 1, 5, null, null, null, null, 'ok', null, null::uuid),
    ('GoPro', 'GoPro harnas 1', 'GoPro harnas 1', 1, 6, null, null, null, null, 'ok', null, null::uuid),
    ('GoPro', 'GoPro harnas 2', 'GoPro harnas 2', 1, 7, null, null, null, null, 'ok', null, null::uuid),
    ('GoPro', 'GoPro armband', 'GoPro armband', 1, 8, null, null, null, null, 'ok', null, null::uuid),
    ('Drone', 'Drone', 'Drone', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('Statieven', 'Smallrig Potato Jet statief', 'Smallrig Potato Jet statief', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('Statieven', 'Manfrotto videostatief', 'Manfrotto videostatief', 1, 2, null, null, null, null, 'ok', null, null::uuid),
    ('Statieven', 'Manfrotto videostatief (Spor)', 'Manfrotto videostatief (Spor)', 1, 3, null, null, null, null, 'ok', null, '7748f9c3-8fc0-42ea-8942-6f58054bea22'::uuid),
    ('Statieven', 'Viltrox videostatief', 'Viltrox videostatief', 1, 4, null, null, null, null, 'ok', null, null::uuid),
    ('Statieven', 'Klein bruin statief (2x)', 'Klein bruin statief', 2, 5, null, null, null, null, 'ok', null, null::uuid),
    ('Statieven', 'Boom statief', 'Boom statief', 1, 6, null, null, null, null, 'ok', null, null::uuid),
    ('Extra', 'Schouderstatief', 'Schouderstatief', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('Extra', 'Polarisatie filter 77mm', 'Polarisatie filter 77mm', 1, 2, null, null, null, null, 'ok', null, null::uuid),
    ('Extra', 'Achtergrondstatieven', 'Achtergrondstatieven', 1, 3, null, null, null, null, 'ok', null, null::uuid),
    ('Extra', 'Tiltamax focus handle + battery', 'Tiltamax focus handle + battery', 1, 4, null, null, null, null, 'ok', null, null::uuid),
    ('Extra', 'POV helm', 'POV helm', 1, 5, null, null, null, null, 'ok', null, null::uuid),
    ('Extra', 'DJI RS 4 Pro', 'DJI RS 4 Pro', 1, 6, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Monitor', 'Monitor', 1, 1, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'SSD opnameschijf Ballieman', 'SSD opnameschijf Ballieman', 1, 2, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'ATEM mengpaneel', 'ATEM mengpaneel', 1, 3, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', '5x Blackmagic', 'Blackmagic', 5, 4, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', '5x statieven', 'Studiostatieven', 5, 5, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'MixPre 10 + SD-kaart', 'MixPre 10 + SD-kaart', 1, 6, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Zoom H8', 'Zoom H8', 1, 7, null, null, null, null, 'ok', null, null::uuid),
    ('Studio', 'Atomos + schijf', 'Atomos + schijf', 1, 8, null, null, null, null, 'ok', null, null::uuid)
  ) as v(cat, legacy_name, name, qty, sort, label, nd, warn, notes, status, snote, holder)
  join public.gear_categories c on c.name = v.cat
  join public.equipment e on e.category = v.cat and e.name = v.legacy_name;

-- ── Inhoud van de kits ──────────────────────────────────────────────────────
insert into public.gear_unit_contents (unit_id, label, quantity, note, sort_order)
select u.id, v.label, v.qty, v.note, v.sort
  from (values
    ('FX3 A (groene labels)', 'Sony 24-70mm', 1, null, 1),
    ('FX3 A (groene labels)', 'CF-kaart', 2, null, 2),
    ('FX3 A (groene labels)', 'CF-kaartlezer', 1, null, 3),
    ('FX3 A (groene labels)', 'XLR-audiohandle', 1, null, 4),
    ('FX3 A (groene labels)', 'Sony batterijen', 1, null, 5),
    ('FX3 A (groene labels)', 'Hama 77mm variabele ND', 1, null, 6),
    ('FX3 A (groene labels)', 'Rods', 1, null, 7),
    ('FX3 A (groene labels)', 'Fxlion V-lock', 1, null, 8),
    ('FX3 A (groene labels)', 'Lader', 1, null, 9),
    ('FX3 A (groene labels)', 'XLR-jack kabels', 1, null, 10),
    ('FX3 A (groene labels)', 'Sony ECM-VG1 microfoon', 1, null, 11),
    ('FX3 A (groene labels)', 'Monitor Shinobi', 1, null, 12),
    ('FX3 A (groene labels)', 'Pocket LED', 1, null, 13),
    ('FX3 B (wit label)', 'Sony 24-70mm', 1, null, 1),
    ('FX3 B (wit label)', 'CF-kaart', 2, null, 2),
    ('FX3 B (wit label)', 'CF-kaartlezer', 1, null, 3),
    ('FX3 B (wit label)', 'XLR-audiohandle', 1, null, 4),
    ('FX3 B (wit label)', 'Sony batterijen', 1, null, 5),
    ('FX3 B (wit label)', 'Hama 77mm variabele ND', 1, null, 6),
    ('FX3 B (wit label)', 'Rods', 1, null, 7),
    ('FX3 B (wit label)', 'Tilta V-mount plaat', 1, null, 8),
    ('FX3 B (wit label)', 'Fxlion V-lock', 1, null, 9),
    ('FX3 B (wit label)', 'Lader', 1, null, 10),
    ('FX3 B (wit label)', 'XLR-jack kabels', 1, null, 11),
    ('FX3 B (wit label)', 'Sony ECM-VG1 microfoon', 1, null, 12),
    ('FX3 B (wit label)', 'Pocket LED', 1, null, 13),
    ('FX3 C (zwart label)', 'Tamron 28-75mm', 1, null, 1),
    ('FX3 C (zwart label)', 'CF-kaart', 1, null, 2),
    ('FX3 C (zwart label)', 'CF-kaartlezer', 1, null, 3),
    ('FX3 C (zwart label)', 'XLR-audiohandle', 1, null, 4),
    ('FX3 C (zwart label)', 'Sony batterijen', 1, null, 5),
    ('FX3 C (zwart label)', 'Hama 77mm variabele ND', 1, null, 6),
    ('FX3 C (zwart label)', 'Rods', 1, null, 7),
    ('FX3 C (zwart label)', 'Tilta V-mount plaat', 1, null, 8),
    ('FX3 C (zwart label)', 'Fxlion V-lock', 1, null, 9),
    ('FX3 C (zwart label)', 'Lader', 1, null, 10),
    ('FX3 C (zwart label)', 'Sony ECM-VG1 microfoon', 1, null, 11),
    ('FX3 C (zwart label)', 'Monitor Desview R6', 1, null, 12),
    ('FX3 C (zwart label)', 'Pocket LED', 1, null, 13),
    ('Sony A7S III', 'Tamron 28-75mm', 1, null, 1),
    ('Sony A7S III', 'Sony batterij', 3, null, 2),
    ('Sony A7 IV (groen)', 'Sigma 24-70mm', 1, null, 1),
    ('Sony A7 IV (groen)', 'Sony batterij', 3, null, 2),
    ('Sony A7 IV (groen)', 'Sony lader', 1, null, 3),
    ('Sony A7 III', 'Tamron 28-75mm F/2.8', 1, null, 1),
    ('Sony A7 III', 'Sony 24-105mm', 1, null, 2),
    ('Sony A7 III', 'ND-filter', 1, null, 3),
    ('Sony A7 III', 'Sony batterij', 2, null, 4),
    ('Sony A7 III', 'Duo-lader', 1, 'blijft bij FoS', 5),
    ('Sony A7 IV (wit)', 'Godox flitser', 1, null, 1),
    ('Sony A7 IV (wit)', 'Lexar SD-kaart', 2, null, 2),
    ('Sony A7 IV (wit)', 'Sony BC-ZD1 lader', 1, null, 3),
    ('Sony A7 IV (wit)', 'Rode VideoMicro II', 1, null, 4),
    ('Sony A7 IV (wit)', 'Lowepro Nova 200 AW II tas', 1, null, 5),
    ('Sony A7R', 'Tamron 28-75mm F/2.8', 1, null, 1),
    ('Sony A7R', 'Sony batterij', 3, null, 2),
    ('Sony A7R', 'Duo-lader', 1, 'blijft bij FoS', 3),
    ('Set 2 Tentacle (groen)', 'Tentacle', 2, null, 1),
    ('Set 2 Tentacle (groen)', 'Microfoon', 1, null, 2),
    ('Set 2 Tentacle (groen)', 'Micro-SD', 1, null, 3),
    ('Set 3 Tentacle (oranje)', 'Tentacle', 1, null, 1),
    ('Set 3 Tentacle (oranje)', 'Microfoon', 1, null, 2),
    ('Set 3 Tentacle (oranje)', 'Micro-SD', 1, null, 3),
    ('Set 3 Tentacle (oranje)', 'Windkap', 1, null, 4),
    ('Set 4 Tentacle (blauw)', 'Tentacle', 1, null, 1),
    ('Set 4 Tentacle (blauw)', 'Microfoon', 1, null, 2),
    ('Set 4 Tentacle (blauw)', 'Micro-SD', 1, null, 3),
    ('Set 4 Tentacle (blauw)', 'Windkap', 1, null, 4),
    ('Set 1 prikkers Sennheiser', 'Zender', 1, null, 1),
    ('Set 1 prikkers Sennheiser', 'Ontvanger', 1, null, 2),
    ('Set 1 prikkers Sennheiser', '3,5mm-jackkabel', 1, null, 3),
    ('Set 2 prikkers Sennheiser', 'Zender', 1, null, 1),
    ('Set 2 prikkers Sennheiser', 'Ontvanger', 1, null, 2),
    ('Set 2 prikkers Sennheiser', '3,5mm-jackkabel', 1, null, 3),
    ('Boompole + shotgun mic', 'Boompole', 1, null, 1),
    ('Boompole + shotgun mic', 'Shotgun mic', 1, null, 2),
    ('Shotgun mic Sennheiser (zwarte hoes)', 'Zwarte hoes', 1, null, 1),
    ('Shotgun mic Sennheiser (zwarte hoes)', 'Shotgun mic', 1, null, 2),
    ('Nanlite Tubes', 'Ministatief', 2, null, 1),
    ('Nanlite Tubes', 'Stroomkabel', 2, null, 2),
    ('Softbox Nanlite set A', 'Nanlite lamp', 1, null, 1),
    ('Softbox Nanlite set A', 'Softbox', 1, null, 2),
    ('Softbox Nanlite set A', 'Lichtstatief', 1, null, 3),
    ('Softbox Nanlite set A', 'Oranje filter', 1, null, 4),
    ('Softbox Nanlite set B', 'Nanlite lamp', 1, null, 1),
    ('Softbox Nanlite set B', 'Softbox', 1, null, 2),
    ('Softbox Nanlite set B', 'Lichtstatief', 1, null, 3),
    ('Softbox Nanlite set B', 'Oranje filter', 1, null, 4),
    ('Insta360 X4 (wit 1)', 'Insta360 X4', 1, null, 1),
    ('Insta360 X4 (wit 1)', 'Stick + statief', 1, null, 2),
    ('Insta360 X4 (wit 1)', '256GB micro-SD', 1, null, 3),
    ('Insta360 X4 (wit 1)', 'Third-person bike tail mount', 1, null, 4),
    ('Insta360 X4 (wit 1)', 'GoPro accessory mount', 1, null, 5),
    ('Insta360 X4 (groen 2)', 'Insta360 X4', 1, null, 1),
    ('Insta360 X4 (groen 2)', 'Stick + statief', 1, null, 2),
    ('Insta360 X4 (groen 2)', '256GB micro-SD', 1, null, 3),
    ('Insta360 X4 (groen 2)', 'Third-person bike tail mount', 1, null, 4),
    ('Insta360 X4 (groen 2)', 'GoPro accessory mount', 1, null, 5),
    ('GoPro 10', 'Batterij', 3, null, 1),
    ('GoPro 10', 'GoPro dual battery charger', 1, null, 2),
    ('GoPro 10', 'Curved adhesive mount', 1, null, 3),
    ('GoPro 10', 'Buckle + thumb screw', 1, null, 4),
    ('GoPro 10', 'USB-C kabel', 1, null, 5),
    ('GoPro 10', 'Telesin laadbox', 1, null, 6)
  ) as v(unit_name, label, qty, note, sort)
  join public.gear_units u on u.name = v.unit_name;

-- ── Controle: anders afbreken ──

do $$
declare
  n_cat int := (select count(*) from public.gear_categories);
  n_unit int := (select count(*) from public.gear_units);
  n_legacy int := (select count(distinct legacy_equipment_id) from public.gear_units);
  n_cont int := (select count(*) from public.gear_unit_contents);
  n_kits int := (select count(distinct unit_id) from public.gear_unit_contents);
  n_home int := (select count(*) from public.gear_units where home_client_id is not null);
  n_log int := (select count(*) from public.gear_status_log);
  r text := '';
  fails int := 0;
begin
  if n_cat = 15 then r := r || 'PASS: 15 categorieën' || E'\n'; else r := r || 'FAIL: 15 categorieën' || E'\n'; fails := fails + 1; end if;
  if n_unit = 75 then r := r || 'PASS: 75 stuks materiaal' || E'\n'; else r := r || 'FAIL: 75 stuks materiaal' || E'\n'; fails := fails + 1; end if;
  if n_legacy = 75 then r := r || 'PASS: elk stuk gekoppeld aan zijn rij in de oude planner' || E'\n'; else r := r || 'FAIL: elk stuk gekoppeld aan zijn rij in de oude planner' || E'\n'; fails := fails + 1; end if;
  if n_cont = 104 then r := r || 'PASS: 104 onderdelen in 21 kits' || E'\n'; else r := r || 'FAIL: 104 onderdelen in 21 kits' || E'\n'; fails := fails + 1; end if;
  if n_kits = 21 then r := r || 'PASS: 21 kits' || E'\n'; else r := r || 'FAIL: 21 kits' || E'\n'; fails := fails + 1; end if;
  if n_home = 4 then r := r || 'PASS: 4 vaste houders' || E'\n'; else r := r || 'FAIL: 4 vaste houders' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_units where home_client_id = 'f54c741b-059f-49ad-854b-cf34befa631d') = 2 then r := r || 'PASS: Friends of Sports: Sony A7R en LED paneeltje B' || E'\n'; else r := r || 'FAIL: Friends of Sports: Sony A7R en LED paneeltje B' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_units where home_client_id = '7748f9c3-8fc0-42ea-8942-6f58054bea22') = 2 then r := r || 'PASS: Sporting Hasselt: Sigma 70-200mm en Manfrotto (Spor)' || E'\n'; else r := r || 'FAIL: Sporting Hasselt: Sigma 70-200mm en Manfrotto (Spor)' || E'\n'; fails := fails + 1; end if;
  if (select status from public.gear_units where name = 'Sony 16-35mm F/2.8') = 'defect' then r := r || 'PASS: Sony 16-35mm staat op defect' || E'\n'; else r := r || 'FAIL: Sony 16-35mm staat op defect' || E'\n'; fails := fails + 1; end if;
  if (select status from public.gear_units where name = 'Insta360 X4 (groen 2)') = 'beperkt' then r := r || 'PASS: Insta360 X4 (groen 2) staat op beperkt' || E'\n'; else r := r || 'FAIL: Insta360 X4 (groen 2) staat op beperkt' || E'\n'; fails := fails + 1; end if;
  if n_log = 2 then r := r || 'PASS: 2 regels in het statuslogboek (defect + beperkt)' || E'\n'; else r := r || 'FAIL: 2 regels in het statuslogboek (defect + beperkt)' || E'\n'; fails := fails + 1; end if;
  if (select quantity from public.gear_units where name = 'Blackmagic') = 5 then r := r || 'PASS: bundels: Blackmagic ×5' || E'\n'; else r := r || 'FAIL: bundels: Blackmagic ×5' || E'\n'; fails := fails + 1; end if;
  if (select count(*) from public.gear_units u join public.gear_categories c on c.id = u.category_id where c.name = 'EXTRA LENZEN') = 15 then r := r || 'PASS: 15 lenzen in EXTRA LENZEN' || E'\n'; else r := r || 'FAIL: 15 lenzen in EXTRA LENZEN' || E'\n'; fails := fails + 1; end if;
  if fails > 0 then raise exception E'Afgebroken, niets opgeslagen:\n%', r; end if;
  raise notice '%', r;
end $$;

commit;
