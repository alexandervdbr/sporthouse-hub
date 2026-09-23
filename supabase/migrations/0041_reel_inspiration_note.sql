-- Optional free-text note a person can attach to a saved reel — separate
-- from `caption`, which is the post's own Instagram caption pulled via
-- oEmbed, not something anyone here typed. Purely additive: nullable, no
-- default, existing rows and the existing save/display flow are completely
-- unaffected until something actually sets it.
alter table reel_inspiration add column if not exists note text;
