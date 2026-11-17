-- Rollback van 0094 (samenvoegen). Haalt de functies en de tabel weg, en zet
-- opgenomen boekingen NIET terug: maak eerst wat je terug wil ongedaan in de
-- planner. Het mail-logboek houdt 'wijziging' toe (oude rijen blijven geldig).

begin;
drop function if exists public.gear_create_booking_into(uuid, text, date, date, uuid[], uuid[], uuid[], uuid, uuid, text, uuid, uuid, text, time, time);
drop function if exists public.gear_unmerge_bookings(uuid);
drop function if exists public.gear_merge_bookings(uuid[], uuid);
drop function if exists public.gear_merge_core(uuid[], uuid, uuid);
drop function if exists public.gear_holder_key(public.gear_bookings);
drop table if exists public.gear_booking_merges;
alter table public.gear_bookings drop column if exists merged_into_id;
commit;
