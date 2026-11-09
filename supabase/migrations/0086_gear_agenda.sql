-- Materiaalplanner: een echt Google Calendar-item per boeking.
--
-- Het mailscript (Apps Script) zet elke boeking als afspraak in een eigen
-- agenda "Sporthouse Materiaal" op het verzendaccount, met de ontvangers als
-- gasten; Google stuurt zelf de uitnodiging, en nieuwe data of een annulering
-- werken die afspraak bij of halen ze weg. Hier bewaart de hub welk item bij
-- de boeking hoort, en of het laatst lukte.
--
-- Alleen drie kolommen; geen gegevens gewijzigd. Schrijven doet alleen de
-- server (service key); lezen volgt de bestaande policies van gear_bookings.

alter table public.gear_bookings
  add column if not exists calendar_event_id  text,
  add column if not exists calendar_error     text,
  add column if not exists calendar_synced_at timestamptz;
