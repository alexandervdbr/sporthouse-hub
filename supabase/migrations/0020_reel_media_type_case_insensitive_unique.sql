-- The plain unique(name) constraint is case-sensitive — "Video" and "video"
-- wouldn't collide at the DB level, only caught by the app's own
-- case-insensitive check before insert, which has a real (if narrow) race
-- window between two near-simultaneous creates. Enforce it at the DB level
-- instead so it's a hard guarantee, not just an app-level check.
alter table reel_media_types drop constraint if exists reel_media_types_name_key;
create unique index if not exists reel_media_types_name_lower_idx on reel_media_types (lower(name));
