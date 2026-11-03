-- Materiaalplanner (/materiaal), stap 1 van de database: btree_gist.
--
-- Een boeking wordt straks een periode (daterange) per unit, en de database
-- weigert zelf twee overlappende boekingen van dezelfde unit met een
-- exclusion constraint: (unit_id met =, periode met &&). Gist kent && voor
-- ranges uit zichzelf, maar = op een uuid niet — dat brengt btree_gist mee.
--
-- In het schema extensions, zoals Supabase het aanraadt; een exclusion
-- constraint vindt de standaard-operatorklasse voor uuid ongeacht het
-- zoekpad. Alleen toevoegen: niets bestaands verandert.

create extension if not exists btree_gist with schema extensions;
