-- De statusknoppen in de planning kwamen deels uit deze hardcoded lijst
-- (planning-config.ts) als fallback voor wie nog geen echte preset had
-- aangemaakt — die waren dus wél zichtbaar in de kiezer, maar niet
-- bewerkbaar in de beheerder-tab (die enkel planning_presets kent). Door ze
-- hier ook als echte rijen te zetten, is alles wat in de kiezer staat ook
-- meteen aanpasbaar/verwijderbaar in Beheer > Presets.
insert into planning_presets (name, color, sort_order) values
  ('Play Sports', '#ca8a04', 3),
  ('Sport Vl',    '#6d28d9', 4),
  ('De Spor',     '#b45309', 5),
  ('Verlof',      '#be185d', 6),
  ('Recup',       '#0891b2', 7),
  ('Ziek',        '#9a3412', 8),
  ('RBFA',        '#be123c', 9)
on conflict (name) do nothing;
