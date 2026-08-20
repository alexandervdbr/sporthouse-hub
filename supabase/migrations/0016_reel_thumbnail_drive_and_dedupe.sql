-- Instagram's signed thumbnail URLs expire a few days after being fetched;
-- thumbnails get re-hosted on Drive in the background classification job
-- (same pattern as every other file-storage feature in this app) and this
-- tracks the resulting Drive file so it can be trashed when the reel itself
-- is deleted.
alter table reel_inspiration add column if not exists thumbnail_drive_id text;

-- Sharing the same post twice (easy to do from the Share Sheet) used to
-- create a second card. save-reel now upserts on url instead of inserting,
-- so this needs to be enforceable at the DB level.
alter table reel_inspiration add constraint reel_inspiration_url_unique unique (url);
