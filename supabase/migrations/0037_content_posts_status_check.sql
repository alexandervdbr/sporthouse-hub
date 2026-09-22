-- Post-launch audit, last Low finding: content_posts.status was a closed
-- enum enforced only by the UI, with no CHECK backing it. The audit's own
-- assumed value set (concept/gepland/gepubliceerd) turned out to be wrong —
-- the actual UI (src/components/calendar/ContentCalendar.tsx's STATUSES
-- array) uses to_shoot/in_productie/afgewerkt, while the column's own
-- default ('concept') and the API route's insert fallback both still
-- referenced the old, never-actually-used value.
--
-- Confirmed via `select distinct status from content_posts` (run by the
-- platform owner in the SQL editor) that the table is completely empty —
-- zero rows, so there's no live data that could conflict with either
-- change below.
alter table content_posts alter column status set default 'to_shoot';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.content_posts'::regclass and conname = 'content_posts_status_check'
  ) then
    alter table content_posts
      add constraint content_posts_status_check
      check (status in ('to_shoot', 'in_productie', 'afgewerkt'));
  end if;
end $$;
