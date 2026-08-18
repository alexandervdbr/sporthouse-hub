-- Second, standardized classification dimension alongside `category`: the
-- content's fundamental format (Video/Motion/Grafisch/Foto), for browsing by
-- "what kind of thing is this" during brainstorms rather than "what's it
-- about". No check constraint, same reasoning as `category` — kept editable
-- via a one-line array edit in src/lib/reel-media-types.ts, not a DB enum.
alter table reel_inspiration add column if not exists media_type text;

create index if not exists reel_inspiration_media_type_idx on reel_inspiration (media_type);
