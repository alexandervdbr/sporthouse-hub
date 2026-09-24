-- Tracks how many times the same post has been shared/saved again (a quiet
-- "hype meter" on the card) — 1 for the original save, +1 per re-share
-- detected by save-reel's existing-row check.
alter table reel_inspiration add column if not exists share_count int not null default 1;
