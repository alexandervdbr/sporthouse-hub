-- A reel can genuinely be a mix of types (e.g. a carousel that's half
-- filmed video, half designed graphic slides) — media_type as a single
-- scalar forced one-or-the-other. Same array pattern already used for
-- `tags` on this table. No existing query filters on media_type
-- (`.eq('media_type', ...)`) anywhere in the app, so this is a clean
-- column-type change with nothing at the query level to break.
alter table reel_inspiration add column if not exists media_types text[] not null default '{}';
update reel_inspiration set media_types = array[media_type] where media_type is not null;
drop index if exists reel_inspiration_media_type_idx;
alter table reel_inspiration drop column if exists media_type;
create index if not exists reel_inspiration_media_types_idx on reel_inspiration using gin (media_types);
